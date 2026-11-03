"""Coordinator for HA-EMS."""

from __future__ import annotations

import logging
import math
from dataclasses import replace
from functools import cached_property

from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.event import async_track_point_in_time, async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util.dt import now, parse_datetime

from .const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
    CONF_BATTERY_ENTITY_ID,
    CONF_BATTERY_SIZE_KWH,
    CONF_DEVICE_CONTROL,
    CONF_DEVICE_DEFAULT_WATTAGE,
    CONF_DEVICE_MODES,
    CONF_DEVICE_NAME,
    CONF_DEVICE_SWITCH_ENTITY_ID,
    CONF_DEVICES,
    CONF_INJECTION_PRICE_KEY,
    CONF_PRICE_ATTRIBUTE,
    CONF_PRICE_ENTITY_ID,
    CONF_PRICE_KEY,
    CONF_ROUNDTRIP_LOSS_PCT,
    CONF_START_KEY,
    DEFAULT_DEVICE_WATTAGE,
    DEVICE_CONTROL_MODES,
    DEVICE_CONTROL_WATTAGE,
    DEVICE_CONTROLS,
    DEFAULT_ROUNDTRIP_LOSS_PCT,
    DOMAIN,
    EVENT_ACTION_CHANGED,
    MAX_DEFAULT_WATTAGE,
    STORAGE_VERSION,
)

from .models import EMSSettings
from .simulation import step_soc

_LOGGER = logging.getLogger(__name__)

_UPDATE_INTERVAL = timedelta(minutes=5)
_SAVE_DELAY_S = 2
_PLANNING_RETENTION = timedelta(hours=48)


class EMSCoordinator(DataUpdateCoordinator[list[dict[str, Any]]]):
    """Coordinator that owns all EMS planning state."""

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=config_entry,
            name=f"{DOMAIN}_{config_entry.entry_id}",
            update_interval=_UPDATE_INTERVAL,
        )
        self.config_entry = config_entry
        self._store: Store = Store(
            hass, STORAGE_VERSION, f"ha_ems_{config_entry.entry_id}"
        )
        # Planning dict: raw_start_str → {action, locked, action_config, devices}
        # where devices is {device_name: {"wattage": float}}
        self._planning: dict[str, dict[str, Any]] = {}

        # Live-editable values (backed by number/switch entities)
        self.settings = EMSSettings()

        self._last_action: str | None = None
        # Index into self.data of the slot containing "now", recomputed on
        # every refresh (and a refresh is scheduled at each slot boundary).
        self.current_slot_index: int | None = None
        self._unsub_slot_timer: Any | None = None  # cancels current slot-boundary timer

    # ------------------------------------------------------------------
    # Device info
    # ------------------------------------------------------------------

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self.config_entry.entry_id)},
            name=self.config_entry.title or "EMS",
            manufacturer="ha_ems",
            model="Energy Management System",
        )

    # ------------------------------------------------------------------
    # Schedulable devices
    # ------------------------------------------------------------------

    @cached_property
    def configured_devices(self) -> list[dict[str, Any]]:
        """Return the configured non-battery devices, normalised.

        Cached: any config change reloads the entry and builds a new coordinator.
        """
        raw = self._cfg().get(CONF_DEVICES) or []
        devices: list[dict[str, Any]] = []
        for entry in raw:
            name = str(entry.get(CONF_DEVICE_NAME, "")).strip()
            if not name:
                continue
            try:
                wattage = float(entry.get(CONF_DEVICE_DEFAULT_WATTAGE, DEFAULT_DEVICE_WATTAGE))
            except (TypeError, ValueError):
                wattage = DEFAULT_DEVICE_WATTAGE
            control = entry.get(CONF_DEVICE_CONTROL, DEVICE_CONTROL_WATTAGE)
            if control not in DEVICE_CONTROLS:
                control = DEVICE_CONTROL_WATTAGE
            modes = [
                {"name": str(m.get("name")), "wattage": m.get("wattage")}
                for m in (entry.get(CONF_DEVICE_MODES) or [])
                if str(m.get("name") or "").strip()
            ]
            devices.append(
                {
                    CONF_DEVICE_NAME: name,
                    CONF_DEVICE_CONTROL: control,
                    CONF_DEVICE_MODES: modes,
                    CONF_DEVICE_DEFAULT_WATTAGE: wattage,
                    CONF_DEVICE_SWITCH_ENTITY_ID: entry.get(CONF_DEVICE_SWITCH_ENTITY_ID),
                }
            )
        return devices

    @cached_property
    def _devices_by_name(self) -> dict[str, dict[str, Any]]:
        return {d[CONF_DEVICE_NAME]: d for d in self.configured_devices}

    def _device_config(self, name: str) -> dict[str, Any] | None:
        return self._devices_by_name.get(name)

    def _effective_device_wattage(
        self, name: str, scheduled: dict[str, Any]
    ) -> float:
        """Load estimate in watts for a device scheduled in one slot.

        Only 'wattage' devices carry a per-slot figure. On/off devices use their
        configured default, and mode devices use the mode's own wattage when one
        was given, otherwise the default -- so the battery forecast stays honest
        even where the user is never asked for a number.
        """
        device = self._device_config(name)
        if device is None:
            # Device removed from config but still present in stored planning.
            try:
                return float(scheduled.get("wattage") or 0)
            except (TypeError, ValueError):
                return 0.0

        control = device[CONF_DEVICE_CONTROL]
        default_w = float(device[CONF_DEVICE_DEFAULT_WATTAGE])

        if control == DEVICE_CONTROL_WATTAGE:
            raw = scheduled.get("wattage")
            if raw is None:
                return default_w
            try:
                return float(raw)
            except (TypeError, ValueError):
                return default_w

        if control == DEVICE_CONTROL_MODES:
            mode_name = scheduled.get("mode")
            for mode in device[CONF_DEVICE_MODES]:
                if mode["name"] == mode_name and mode.get("wattage") is not None:
                    return float(mode["wattage"])
            return default_w

        return default_w

    def device_schedule(self, start_str: str) -> dict[str, dict[str, Any]]:
        """Return the devices scheduled for the slot starting at *start_str*."""
        return self._planning.get(start_str, {}).get("devices", {}) or {}

    def _slot_load_w(self, slot: dict) -> float:
        """House load during *slot*: baseline plus any scheduled devices."""
        return self.settings.avg_consumption + self._slot_device_wattage(slot)

    def _slot_device_wattage(self, slot: dict) -> float:
        """Total draw in watts of every device scheduled in *slot*."""
        total = 0.0
        for dev in slot.get("devices") or []:
            watts = dev.get("manual_override_w")
            if watts is None:
                watts = dev.get("allocated_wattage_w")
            try:
                total += float(watts or 0)
            except (TypeError, ValueError):
                continue
        return total

    async def async_update_settings(self, **changes: Any) -> None:
        """Change one or more settings, validate them, and re-plan."""
        new = replace(self.settings, **changes)
        try:
            new.validate()
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        self.settings = new
        await self.async_refresh()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    async def async_load_planning(self) -> None:
        """Load persisted planning from storage."""
        stored = await self._store.async_load()
        if stored and isinstance(stored, dict):
            self._planning = stored.get("planning", {})
            _LOGGER.debug(
                "Loaded %d planning overrides from storage", len(self._planning)
            )

    @callback
    def _async_save_planning(self) -> None:
        """Schedule a debounced write; a burst of edits ends up as one save.

        Store flushes pending delayed writes on shutdown, so nothing is lost.
        """
        self._store.async_delay_save(
            lambda: {"planning": self._planning}, _SAVE_DELAY_S
        )

    def async_start_price_tracking(self) -> None:
        """Track the price entity so we refresh as soon as it becomes available.

        On HA startup, other integrations may not have populated their entity
        states yet when our coordinator first runs.  By subscribing to state
        changes on the price entity we automatically refresh (and therefore
        show stored planning) the moment the entity is ready.
        """
        price_entity_id = self._cfg().get(CONF_PRICE_ENTITY_ID)
        if not price_entity_id:
            return

        @callback
        def _on_price_state_change(event: Any) -> None:
            self.async_schedule_refresh()

        self.config_entry.async_on_unload(
            async_track_state_change_event(
                self.hass, [price_entity_id], _on_price_state_change
            )
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _cfg(self) -> dict[str, Any]:
        return self.config_entry.data  # type: ignore[return-value]

    def _detect_slot_duration(self, price_list: list[dict]) -> float:
        """Return slot duration in hours from raw price feed."""
        if len(price_list) < 2:
            return 1.0
        start_key = self._cfg().get(CONF_START_KEY, "start")
        try:
            t1 = parse_datetime(str(price_list[0][start_key]))
            t2 = parse_datetime(str(price_list[1][start_key]))
            if t1 and t2:
                return (t2 - t1).total_seconds() / 3600.0
        except (KeyError, TypeError, ValueError):
            pass
        return 1.0

    def _slot_duration_from_slots(self, slots: list[dict]) -> float:
        """Return slot duration in hours from already-built slot list."""
        if len(slots) < 2:
            return 1.0
        t1 = parse_datetime(slots[0]["start"])
        t2 = parse_datetime(slots[1]["start"])
        if t1 and t2:
            return (t2 - t1).total_seconds() / 3600.0
        return 1.0

    def _get_current_soc(self) -> float | None:
        """Read current battery SoC % from the configured entity."""
        battery_entity_id = self._cfg().get(CONF_BATTERY_ENTITY_ID)
        if not battery_entity_id:
            return None
        state = self.hass.states.get(battery_entity_id)
        if state is None or state.state in ("unknown", "unavailable", ""):
            return None
        try:
            return float(state.state)
        except (ValueError, TypeError):
            return None

    def _find_slot_start_str(self, time_str: str) -> str:
        """Return the raw start string from the price feed matching *time_str*.

        Falls back to *time_str* as-is if no slot matches yet, so a slot can be
        planned before its price is published. Raises if *time_str* is not a
        timestamp at all, since that would only leave an orphaned entry behind.
        """
        if parse_datetime(time_str) is None:
            raise ServiceValidationError(f"Invalid slot time: {time_str!r}")
        cfg = self._cfg()
        price_entity_id = cfg.get(CONF_PRICE_ENTITY_ID, "")
        price_attribute = cfg.get(CONF_PRICE_ATTRIBUTE, "data")
        start_key = cfg.get(CONF_START_KEY, "start")

        state = self.hass.states.get(price_entity_id)
        if state is None:
            return time_str
        price_data = state.attributes.get(price_attribute, [])
        if not isinstance(price_data, list):
            return time_str

        # Exact match first
        for entry in price_data:
            raw = str(entry.get(start_key, ""))
            if raw == time_str:
                return raw

        # Datetime comparison fallback
        input_dt = parse_datetime(time_str)
        if input_dt is None:
            return time_str
        for entry in price_data:
            raw = str(entry.get(start_key, ""))
            slot_dt = parse_datetime(raw)
            if slot_dt and slot_dt == input_dt:
                return raw

        return time_str

    # ------------------------------------------------------------------
    # Core data build
    # ------------------------------------------------------------------

    def _build_slots(self) -> list[dict[str, Any]]:
        """Read price entity, merge planning overrides, simulate battery."""
        cfg = self._cfg()
        price_entity_id = cfg.get(CONF_PRICE_ENTITY_ID, "")
        price_attribute = cfg.get(CONF_PRICE_ATTRIBUTE, "data")
        start_key = cfg.get(CONF_START_KEY, "start")
        price_key = cfg.get(CONF_PRICE_KEY, "price")
        injection_price_key = cfg.get(CONF_INJECTION_PRICE_KEY) or None
        battery_size_kwh: float | None = cfg.get(CONF_BATTERY_SIZE_KWH)

        state = self.hass.states.get(price_entity_id)
        if state is None:
            return []

        price_data = state.attributes.get(price_attribute, [])
        if not isinstance(price_data, list) or not price_data:
            return []

        slot_duration_h = self._detect_slot_duration(price_data)
        current_time = now()

        # Build normalised slot list
        slots: list[dict[str, Any]] = []
        for entry in price_data:
            raw_start = entry.get(start_key)
            if raw_start is None:
                continue
            start_str = str(raw_start)
            # A missing price (e.g. tomorrow's prices not yet published) must
            # not be read as 0, or the optimiser would treat the slot as free
            # and charge there. Leave such slots out of the plan entirely.
            try:
                price = float(entry.get(price_key))
            except (TypeError, ValueError):
                continue
            if not math.isfinite(price):
                continue

            slot: dict[str, Any] = {"start": start_str, "price": price}

            if injection_price_key:
                try:
                    slot["injection_price"] = float(entry.get(injection_price_key, 0))
                except (TypeError, ValueError):
                    slot["injection_price"] = 0.0

            override = self._planning.get(start_str, {})
            slot["action"] = override.get("action", ACTION_IDLE)
            slot["locked"] = override.get("locked", False)
            slot["action_config"] = dict(override.get("action_config", {}))
            slot["devices"] = [
                {
                    "name": dev_name,
                    "control": (self._device_config(dev_name) or {}).get(
                        CONF_DEVICE_CONTROL, DEVICE_CONTROL_WATTAGE
                    ),
                    "mode": dev_cfg.get("mode"),
                    "manual_override_w": dev_cfg.get("wattage"),
                    "allocated_wattage_w": self._effective_device_wattage(
                        dev_name, dev_cfg
                    ),
                }
                for dev_name, dev_cfg in (override.get("devices") or {}).items()
            ]
            slot["battery_prediction"] = None
            slots.append(slot)

        # Battery simulation
        if battery_size_kwh and battery_size_kwh > 0:
            current_soc = self._get_current_soc()
            if current_soc is not None:
                self._simulate_battery(
                    slots, current_soc, battery_size_kwh, slot_duration_h, current_time
                )

        return slots

    def _simulate_battery(
        self,
        slots: list[dict],
        current_soc: float,
        battery_size_kwh: float,
        slot_duration_h: float,
        current_time: datetime,
    ) -> None:
        """Fill battery_prediction for slots starting from the current one forward."""
        # Find current slot index
        current_idx = None
        for i, slot in enumerate(slots):
            ts = parse_datetime(slot["start"])
            if ts and ts <= current_time < ts + timedelta(hours=slot_duration_h):
                current_idx = i
                break

        anchor_idx = current_idx if current_idx is not None else 0

        soc = current_soc
        for i in range(anchor_idx, len(slots)):
            slot = slots[i]
            soc = step_soc(
                soc,
                slot["action"],
                slot.get("action_config") or {},
                self._slot_load_w(slot),
                slot_duration_h,
                battery_size_kwh,
            )
            slot["battery_prediction"] = round(soc, 1)

        # Past slots get no prediction
        for i in range(anchor_idx):
            slots[i]["battery_prediction"] = None

    @property
    def current_slot(self) -> dict[str, Any] | None:
        """The slot containing "now", as of the last refresh."""
        idx = self.current_slot_index
        slots = self.data or []
        return slots[idx] if idx is not None and idx < len(slots) else None

    def _nowslot_idx(self, slots: list[dict]) -> int | None:
        """Return index of the slot that contains the current time."""
        if not slots:
            return None
        slot_duration_h = self._slot_duration_from_slots(slots)
        current_time = now()
        for i, slot in enumerate(slots):
            ts = parse_datetime(slot["start"])
            if ts and ts <= current_time < ts + timedelta(hours=slot_duration_h):
                return i
        return None

    # ------------------------------------------------------------------
    # DataUpdateCoordinator hook
    # ------------------------------------------------------------------

    def _prune_planning(self) -> None:
        """Drop planning entries for slots that ended long ago.

        Nothing else ever removes them, so without this the store grows by a
        day's worth of slots every day. Unparseable keys are dropped too: no
        price slot can ever match them.
        """
        cutoff = now() - _PLANNING_RETENTION
        stale = []
        for key in self._planning:
            ts = parse_datetime(key)
            if ts is None:
                stale.append(key)
            elif ts.tzinfo is not None and ts < cutoff:
                stale.append(key)
        if stale:
            for key in stale:
                del self._planning[key]
            _LOGGER.debug("Pruned %d old planning entries", len(stale))
            self._async_save_planning()

    async def _async_update_data(self) -> list[dict[str, Any]]:
        self._prune_planning()
        slots = self._build_slots()

        # Detect current-slot action change and fire event
        idx = self.current_slot_index = self._nowslot_idx(slots)
        if idx is not None:
            current_action = slots[idx]["action"]
            if self._last_action is None:
                # First refresh after startup/reload: nothing actually changed,
                # so seed the state without waking up automations.
                self._last_action = current_action
            elif current_action != self._last_action:
                prev = self._last_action
                self._last_action = current_action
                self.hass.bus.async_fire(
                    EVENT_ACTION_CHANGED,
                    {
                        "entry_id": self.config_entry.entry_id,
                        "previous_action": prev,
                        "action": current_action,
                        "start": slots[idx]["start"],
                        "price": slots[idx]["price"],
                    },
                )

        # Schedule a precise refresh at the next slot boundary so the current
        # action sensor updates immediately when the slot changes rather than
        # waiting up to 5 minutes for the regular poll.
        self._schedule_next_slot_refresh(slots)

        return slots

    def _cancel_slot_timer(self) -> None:
        if self._unsub_slot_timer is not None:
            self._unsub_slot_timer()
            self._unsub_slot_timer = None

    async def async_shutdown(self) -> None:
        """Stop the slot-boundary timer along with the regular poll.

        Without this, the timer of an unloaded coordinator keeps re-arming itself
        on every refresh, leaving one live coordinator behind per reload.
        """
        self._cancel_slot_timer()
        # Flush any debounced write now, so a reload that loads the store
        # straight away doesn't read stale planning.
        await self._store.async_save({"planning": self._planning})
        await super().async_shutdown()

    def _schedule_next_slot_refresh(self, slots: list[dict]) -> None:
        """Schedule a one-shot refresh at the start of the next slot.

        We cancel any existing timer first so the regular 5-minute poll
        cannot accumulate duplicate timers.  We also bypass async_schedule_refresh()
        (which uses async_call_later and can be overwritten) in favour of
        hass.async_create_task(async_refresh()) which cannot be cancelled.
        """
        # Cancel the previous boundary timer if still pending
        self._cancel_slot_timer()

        if not slots:
            return

        current_time = now()
        for slot in slots:
            ts = parse_datetime(slot["start"])
            if ts is not None and ts > current_time:
                # Fire 1 second after the slot start to ensure we're inside it
                refresh_at = ts + timedelta(seconds=1)

                @callback
                def _on_slot_start(_now: Any) -> None:
                    self._unsub_slot_timer = None
                    self.hass.async_create_task(self.async_refresh())

                self._unsub_slot_timer = async_track_point_in_time(
                    self.hass, _on_slot_start, refresh_at
                )
                return

    # ------------------------------------------------------------------
    # Planning mutations
    # ------------------------------------------------------------------

    def _validate_device(self, device_name: str, mode: str | None) -> None:
        device = self._device_config(device_name)
        if device is None:
            raise ServiceValidationError(f"Unknown device: {device_name!r}")
        if mode is not None:
            known_modes = [m["name"] for m in device[CONF_DEVICE_MODES]]
            if mode not in known_modes:
                raise ServiceValidationError(
                    f"Unknown mode {mode!r} for {device_name!r}; "
                    f"expected one of {known_modes}"
                )

    def _slot_entry(self, key: str) -> dict[str, Any]:
        """Return the planning entry for *key*, creating a default one."""
        existing = self._planning.get(key, {})
        entry = {
            "action": existing.get("action", ACTION_IDLE),
            "locked": existing.get("locked", False),
            "action_config": dict(existing.get("action_config") or {}),
            "devices": dict(existing.get("devices") or {}),
        }
        self._planning[key] = entry
        return entry

    @staticmethod
    def _scheduled(wattage: float | None, mode: str | None) -> dict[str, Any]:
        scheduled: dict[str, Any] = {}
        if wattage is not None:
            scheduled["wattage"] = wattage
        if mode is not None:
            scheduled["mode"] = mode
        return scheduled

    async def _async_commit(self) -> None:
        self._async_save_planning()
        await self.async_refresh()

    async def async_set_planning(
        self,
        time_str: str,
        action: str,
        locked: bool,
        action_config: dict[str, Any],
    ) -> None:
        """Set or update a single slot override.

        Device scheduling lives alongside the battery action in the same slot,
        so it is carried over rather than overwritten.
        """
        entry = self._slot_entry(self._find_slot_start_str(time_str))
        entry.update(action=action, locked=locked, action_config=action_config)
        await self._async_commit()

    async def async_set_device_slot(
        self,
        time_str: str,
        device_name: str,
        wattage: float | None = None,
        mode: str | None = None,
    ) -> None:
        """Schedule *device_name* in a single slot, leaving its battery action alone.

        On/off devices need neither argument; mode devices pass *mode*; only
        'wattage' devices carry a per-slot power figure.
        """
        self._validate_device(device_name, mode)
        entry = self._slot_entry(self._find_slot_start_str(time_str))
        entry["devices"][device_name] = self._scheduled(wattage, mode)
        await self._async_commit()

    async def async_clear_device_slot(self, time_str: str, device_name: str) -> None:
        """Unschedule *device_name* from a single slot."""
        key = self._find_slot_start_str(time_str)
        existing = self._planning.get(key)
        if not existing or device_name not in (existing.get("devices") or {}):
            return
        self._slot_entry(key)["devices"].pop(device_name)
        await self._async_commit()

    async def async_apply_bulk(self, items: list[dict[str, Any]]) -> None:
        """Apply many slot edits with a single save and a single refresh.

        Each item: {time, action|None, locked, action_config|None, devices},
        where devices maps a device name to {wattage?, mode?} to schedule it,
        or to None to unschedule it. Everything is validated before anything
        changes, so a bad item leaves the plan untouched.
        """
        resolved: list[tuple[str, dict[str, Any]]] = []
        for item in items:
            for name, dev in (item.get("devices") or {}).items():
                if dev is not None:
                    self._validate_device(name, dev.get("mode"))
            resolved.append((self._find_slot_start_str(item["time"]), item))

        for key, item in resolved:
            entry = self._slot_entry(key)
            if item.get("action") is not None:
                entry["action"] = item["action"]
                entry["locked"] = bool(item.get("locked", False))
                entry["action_config"] = item.get("action_config") or {}
            for name, dev in (item.get("devices") or {}).items():
                if dev is None:
                    entry["devices"].pop(name, None)
                else:
                    entry["devices"][name] = self._scheduled(
                        dev.get("wattage"), dev.get("mode")
                    )

        await self._async_commit()

    async def async_lock_range(
        self,
        start_str: str,
        end_str: str | None,
        lock: bool,
    ) -> None:
        """Lock or unlock all slots from start to end (inclusive)."""
        slots = self._build_slots()
        if not slots:
            return

        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str) if end_str else start_dt
        if start_dt is None or end_dt is None:
            raise ServiceValidationError(
                f"Invalid time range for lock: {start_str!r} – {end_str!r}"
            )

        for slot in slots:
            ts = parse_datetime(slot["start"])
            if ts is None:
                continue
            if start_dt <= ts <= end_dt:
                key = slot["start"]
                existing = self._planning.get(key, {})
                self._planning[key] = {
                    "action": existing.get("action", ACTION_IDLE),
                    "locked": lock,
                    "action_config": existing.get("action_config", {}),
                    "devices": dict(existing.get("devices") or {}),
                }

        await self._async_commit()

    async def async_clear(self, clear_locked: bool = False) -> None:
        """Clear planning overrides."""
        if clear_locked:
            self._planning.clear()
        else:
            self._planning = {
                k: v for k, v in self._planning.items() if v.get("locked", False)
            }
        await self._async_commit()

    async def async_charge_car(
        self,
        start_time: str,
        stop_time: str,
        max_price: float,
        slots_wanted: int,
        use_solar: bool = True,
        use_net_wattage: float | None = None,
        use_battery_wattage: float | None = None,
        use_battery_until_pct: float | None = None,
    ) -> None:
        """Select cheapest slots within window for car charging."""
        slots = self._build_slots()
        if not slots:
            return

        slot_duration_h = self._slot_duration_from_slots(slots)
        start_dt = parse_datetime(start_time)
        stop_dt = parse_datetime(stop_time)
        if start_dt is None or stop_dt is None:
            raise ServiceValidationError(
                f"Invalid start/stop for car charging: {start_time!r} / {stop_time!r}"
            )

        current_time = now()
        candidates = []
        for slot in slots:
            ts = parse_datetime(slot["start"])
            if ts is None or not start_dt <= ts < stop_dt:
                continue
            key = slot["start"]
            existing = self._planning.get(key, {})
            if existing.get("locked"):
                # Locked slots are the user's call; never repurpose them.
                continue
            if ts + timedelta(hours=slot_duration_h) <= current_time:
                continue  # already over
            if existing.get("action") == ACTION_CAR_CHARGE:
                # Re-running replaces the previous selection in this window
                # instead of adding to it.
                existing["action"] = ACTION_IDLE
                existing["action_config"] = {}
            if slot["price"] <= max_price:
                candidates.append(slot)

        candidates.sort(key=lambda s: s["price"])
        for slot in candidates[:slots_wanted]:
            key = slot["start"]
            existing = self._planning.get(key, {})
            action_config: dict[str, Any] = {"use_solar": use_solar}
            if use_net_wattage is not None:
                action_config["use_net_wattage"] = use_net_wattage
            if use_battery_wattage is not None:
                action_config["use_battery_wattage"] = use_battery_wattage
            if use_battery_until_pct is not None:
                action_config["use_battery_until_pct"] = use_battery_until_pct
            self._planning[key] = {
                "action": ACTION_CAR_CHARGE,
                "locked": False,
                "action_config": action_config,
                "devices": dict(existing.get("devices") or {}),
            }

        await self._async_commit()

    async def async_optimize(self) -> None:
        """Rebuild planning using iterative breach-detection (mirrors Node-RED logic).

        Algorithm:
        1. Start with all unlocked future slots as 'idle' (battery drains naturally).
        2. Simulate forward. If SoC would drop below min_battery at any point,
           find the cheapest idle slot *before* that breach and promote it to charge.
           Recalculate and repeat until no breach.
        3. Determine effective battery cost (max charge price × (1 + roundtrip_loss)).
        4. Final pass: non-charge slots with price ≤ effective_cost → use_net;
           slots above the threshold (and SoC allows) → idle (or discharge if enabled).
        """
        cfg = self._cfg()
        battery_size_kwh: float | None = cfg.get(CONF_BATTERY_SIZE_KWH)
        roundtrip_loss_pct = float(
            cfg.get(CONF_ROUNDTRIP_LOSS_PCT, DEFAULT_ROUNDTRIP_LOSS_PCT)
        )

        slots = self._build_slots()
        if not slots:
            return

        slot_duration_h = self._slot_duration_from_slots(slots)
        current_time = now()

        has_battery = bool(battery_size_kwh and battery_size_kwh > 0)
        battery_kwh = float(battery_size_kwh) if has_battery else 0.0
        # Cap charge wattage at the configured kWp (inverter/solar limit)
        default_wattage = min(self.settings.kwp_w, MAX_DEFAULT_WATTAGE) if has_battery else 0.0

        def step(soc: float, slot: dict, action: str, action_config: dict) -> float:
            return step_soc(
                soc,
                action,
                action_config,
                self._slot_load_w(slot),
                slot_duration_h,
                battery_kwh,
                default_wattage,
            )

        current_soc = self._get_current_soc()
        if current_soc is None:
            current_soc = (self.settings.min_battery + self.settings.max_battery) / 2.0

        # All future slots including locked/car for simulation accuracy
        future_slots = [
            s
            for s in slots
            if (parse_datetime(s["start"]) or current_time)
            + timedelta(hours=slot_duration_h)
            > current_time
        ]
        if not future_slots:
            await self.async_refresh()
            return

        # ---- Phase 1: iterative charge placement --------------------------------
        # Start with all unlocked non-car slots as 'idle'. Locked/car slots keep
        # their existing action. Find SoC breaches and insert charges greedily.

        assignments: dict[str, str] = {}
        fixed_keys: set[str] = set()
        for slot in future_slots:
            key = slot["start"]
            existing = self._planning.get(key, {})
            if existing.get("locked") or existing.get("action") == ACTION_CAR_CHARGE:
                assignments[key] = existing.get("action", ACTION_IDLE)
                fixed_keys.add(key)
            else:
                assignments[key] = ACTION_IDLE

        def simulate_trajectory() -> list[tuple[str, float]]:
            """Return list of (start_key, soc_after) for each future slot."""
            soc = current_soc
            result = []
            for slot in future_slots:
                key = slot["start"]
                action = assignments[key]
                if key in fixed_keys:
                    # Locked/car slots keep their real config (wattage, budget, ...)
                    action_config = self._planning.get(key, {}).get("action_config") or {}
                else:
                    action_config = {}
                soc = step(soc, slot, action, action_config)
                result.append((key, soc))
            return result

        if has_battery and default_wattage > 0:
            # Iterate: fix one breach per iteration to avoid infinite loops
            for _ in range(len(future_slots)):
                trajectory = simulate_trajectory()

                # Find first slot where SoC drops below min
                breach_key: str | None = None
                for key, soc_after in trajectory:
                    if soc_after < self.settings.min_battery:
                        breach_key = key
                        break

                if breach_key is None:
                    break  # No breach — done

                # Find cheapest idle (optimisable) slot at or before the breach
                breach_dt = parse_datetime(breach_key)
                candidates = [
                    s
                    for s in future_slots
                    if assignments[s["start"]] == ACTION_IDLE
                    and s["start"] not in fixed_keys
                    and (parse_datetime(s["start"]) or current_time) <= (breach_dt or current_time)
                ]
                if not candidates:
                    break  # No slot available to charge — cannot fix this breach

                best = min(candidates, key=lambda s: s["price"])
                assignments[best["start"]] = ACTION_CHARGE

        # ---- Phase 2: use_net for cheap non-charge slots ------------------------
        # Effective cost = cheapest charge price × (1 + roundtrip_loss).
        # This is the marginal cost of using stored energy from the cheapest
        # charge slot. Any grid slot cheaper than this threshold is better served
        # by using the grid directly (use_net) rather than discharging the battery.
        charge_prices = [
            s["price"]
            for s in future_slots
            if assignments.get(s["start"]) == ACTION_CHARGE
        ]
        effective_battery_cost = (
            min(charge_prices) * (1 + roundtrip_loss_pct / 100.0)
            if charge_prices
            else 0.0
        )

        # ---- Phase 3: final assignment pass ------------------------------------
        soc = current_soc
        for slot in future_slots:
            key = slot["start"]
            existing = self._planning.get(key, {})
            is_locked = existing.get("locked", False)
            existing_action = existing.get("action", ACTION_IDLE)

            if is_locked or existing_action == ACTION_CAR_CHARGE:
                action = existing_action
                action_config: dict[str, Any] = dict(existing.get("action_config", {}))
            else:
                if assignments[key] == ACTION_CHARGE:
                    if soc >= self.settings.max_battery:
                        action = ACTION_IDLE
                        action_config = {}
                    else:
                        predicted_soc_after = step(soc, slot, ACTION_CHARGE, {})
                        action = ACTION_CHARGE
                        action_config = {
                            "wattage": default_wattage,
                            "until_pct": round(min(predicted_soc_after, self.settings.max_battery), 1),
                        }
                elif slot["price"] <= effective_battery_cost or soc <= self.settings.min_battery:
                    # Cheap slot or battery depleted → use grid, spare the battery
                    action = ACTION_USE_NET
                    # Solar always takes precedence when using the grid
                    action_config = {"use_solar": True}
                elif self.settings.allow_idle_for_optimize:
                    # Price is above effective cost → let battery power the home
                    if self.settings.allow_discharge:
                        if step(soc, slot, ACTION_DISCHARGE, {}) >= self.settings.min_battery:
                            action = ACTION_DISCHARGE
                            action_config = {"wattage": default_wattage}
                        else:
                            action = ACTION_IDLE
                            action_config = {}
                    else:
                        action = ACTION_IDLE
                        action_config = {}
                else:
                    # allow_idle_for_optimize is off → always use grid on non-charge slots
                    action = ACTION_USE_NET
                    action_config = {"use_solar": True}

                # Scheduled devices are treated as fixed load: the optimiser
                # plans the battery around them, it does not move them.
                self._planning[key] = {
                    "action": action,
                    "locked": False,
                    "action_config": action_config,
                    "devices": dict(existing.get("devices") or {}),
                }

            # Advance SoC simulation
            soc = step(soc, slot, action, action_config)

        await self._async_commit()


# A config entry whose runtime_data holds its coordinator.
type EMSConfigEntry = ConfigEntry[EMSCoordinator]
