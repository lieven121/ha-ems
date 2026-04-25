"""Coordinator for HA-EMS."""

from __future__ import annotations

import logging

from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.event import async_track_point_in_time, async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util.dt import now, parse_datetime

from .const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
    CONF_BATTERY_ENTITY_ID,
    CONF_BATTERY_SIZE_KWH,
    CONF_INJECTION_PRICE_KEY,
    CONF_PRICE_ATTRIBUTE,
    CONF_PRICE_ENTITY_ID,
    CONF_PRICE_KEY,
    CONF_ROUNDTRIP_LOSS_PCT,
    CONF_START_KEY,
    DEFAULT_AVG_CONSUMPTION,
    DEFAULT_KWP,
    DEFAULT_MAX_BATTERY,
    DEFAULT_MIN_BATTERY,
    DEFAULT_ROUNDTRIP_LOSS_PCT,
    DOMAIN,
    EVENT_ACTION_CHANGED,
    MAX_DEFAULT_WATTAGE,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

_UPDATE_INTERVAL = timedelta(minutes=5)


class EMSCoordinator(DataUpdateCoordinator[list[dict[str, Any]]]):
    """Coordinator that owns all EMS planning state."""

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{config_entry.entry_id}",
            update_interval=_UPDATE_INTERVAL,
        )
        self.config_entry = config_entry
        self._store: Store = Store(
            hass, STORAGE_VERSION, f"ha_ems_{config_entry.entry_id}"
        )
        # Planning dict: raw_start_str → {action, locked, action_config}
        self._planning: dict[str, dict[str, Any]] = {}

        # Live-editable values (backed by number/switch entities)
        self._min_battery: float = DEFAULT_MIN_BATTERY
        self._max_battery: float = DEFAULT_MAX_BATTERY
        self._avg_consumption: float = DEFAULT_AVG_CONSUMPTION
        self._allow_discharge: bool = False
        self._allow_idle_for_optimize: bool = True  # default: idle on expensive slots
        self._kwp: float = DEFAULT_KWP  # max charge power in watts

        self._last_action: str | None = None
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

    async def _async_save_planning(self) -> None:
        await self._store.async_save({"planning": self._planning})

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

        Falls back to *time_str* as-is if no match is found.
        """
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
            try:
                price = float(entry.get(price_key, 0))
            except (TypeError, ValueError):
                price = 0.0

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

        def clamp(v: float) -> float:
            return max(0.0, min(100.0, v))

        drain_pct = (
            (self._avg_consumption * slot_duration_h) / (battery_size_kwh * 1000) * 100
        )

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
            action = slot["action"]
            cfg = slot.get("action_config", {})
            wattage = float(cfg.get("wattage", 0))

            if action == ACTION_CHARGE:
                charge_pct = (wattage * slot_duration_h) / (battery_size_kwh * 1000) * 100
                soc = clamp(soc + charge_pct - drain_pct)
            elif action == ACTION_DISCHARGE:
                discharge_pct = (
                    (wattage * slot_duration_h) / (battery_size_kwh * 1000) * 100
                )
                soc = clamp(soc - discharge_pct - drain_pct)
            elif action == ACTION_USE_NET:
                # Using grid directly — battery is not involved, no drain
                pass
            elif action == ACTION_CAR_CHARGE:
                battery_w = float(cfg.get("use_battery_wattage", 0))
                if battery_w > 0:
                    car_pct = (battery_w * slot_duration_h) / (battery_size_kwh * 1000) * 100
                    soc = clamp(soc - car_pct)
                # if use_battery_wattage is 0 or not set, battery is not involved (grid/solar only)
            else:
                # idle: home consumption comes from battery
                soc = clamp(soc - drain_pct)

            slot["battery_prediction"] = round(soc, 1)

        # Past slots get no prediction
        for i in range(anchor_idx):
            slots[i]["battery_prediction"] = None

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

    async def _async_update_data(self) -> list[dict[str, Any]]:
        slots = self._build_slots()

        # Detect current-slot action change and fire event
        idx = self._nowslot_idx(slots)
        if idx is not None:
            current_action = slots[idx]["action"]
            if current_action != self._last_action:
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

    def _schedule_next_slot_refresh(self, slots: list[dict]) -> None:
        """Schedule a one-shot refresh at the start of the next slot.

        We cancel any existing timer first so the regular 5-minute poll
        cannot accumulate duplicate timers.  We also bypass async_schedule_refresh()
        (which uses async_call_later and can be overwritten) in favour of
        hass.async_create_task(async_refresh()) which cannot be cancelled.
        """
        # Cancel the previous boundary timer if still pending
        if self._unsub_slot_timer is not None:
            self._unsub_slot_timer()
            self._unsub_slot_timer = None

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

    async def async_set_planning(
        self,
        time_str: str,
        action: str,
        locked: bool,
        action_config: dict[str, Any],
    ) -> None:
        """Set or update a single slot override."""
        key = self._find_slot_start_str(time_str)
        self._planning[key] = {
            "action": action,
            "locked": locked,
            "action_config": action_config,
        }
        await self._async_save_planning()
        await self.async_refresh()

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
            _LOGGER.error("Invalid time range for lock: %s – %s", start_str, end_str)
            return

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
                }

        await self._async_save_planning()
        await self.async_refresh()

    async def async_clear(self, clear_locked: bool = False) -> None:
        """Clear planning overrides."""
        if clear_locked:
            self._planning.clear()
        else:
            self._planning = {
                k: v for k, v in self._planning.items() if v.get("locked", False)
            }
        await self._async_save_planning()
        await self.async_refresh()

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
            _LOGGER.error(
                "Invalid start/stop for car charging: %s / %s", start_time, stop_time
            )
            return

        candidates = []
        for slot in slots:
            ts = parse_datetime(slot["start"])
            if ts is None:
                continue
            slot_end = ts + timedelta(hours=slot_duration_h)
            # Slot must start within window and price must be acceptable
            if ts >= start_dt and ts < stop_dt and slot["price"] <= max_price:
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
                "locked": existing.get("locked", False),
                "action_config": action_config,
            }

        await self._async_save_planning()
        await self.async_refresh()

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

        def clamp(v: float) -> float:
            return max(0.0, min(100.0, v))

        # Pre-compute energy percentages per slot
        drain_pct: float = 0.0
        charge_pct: float = 0.0
        default_wattage: float = 0.0

        if battery_size_kwh and battery_size_kwh > 0:
            # Cap charge wattage at the configured kWp (inverter/solar limit)
            default_wattage = min(self._kwp, MAX_DEFAULT_WATTAGE)
            drain_pct = (
                self._avg_consumption * slot_duration_h / (battery_size_kwh * 1000) * 100
            )
            charge_pct = (
                default_wattage * slot_duration_h / (battery_size_kwh * 1000) * 100
            )

        current_soc = self._get_current_soc()
        if current_soc is None:
            current_soc = (self._min_battery + self._max_battery) / 2.0

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
        for slot in future_slots:
            key = slot["start"]
            existing = self._planning.get(key, {})
            if existing.get("locked") or existing.get("action") == ACTION_CAR_CHARGE:
                assignments[key] = existing.get("action", ACTION_IDLE)
            else:
                assignments[key] = ACTION_IDLE

        def simulate_trajectory() -> list[tuple[str, float]]:
            """Return list of (start_key, soc_after) for each future slot."""
            soc = current_soc
            result = []
            for slot in future_slots:
                key = slot["start"]
                action = assignments[key]
                if action == ACTION_CHARGE and battery_size_kwh:
                    soc = clamp(soc + charge_pct - drain_pct)
                elif action == ACTION_DISCHARGE and battery_size_kwh:
                    soc = clamp(soc - charge_pct - drain_pct)
                elif action == ACTION_USE_NET:
                    pass
                elif battery_size_kwh:
                    soc = clamp(soc - drain_pct)
                result.append((key, soc))
            return result

        if battery_size_kwh and battery_size_kwh > 0 and charge_pct > 0:
            # Iterate: fix one breach per iteration to avoid infinite loops
            for _ in range(len(future_slots)):
                trajectory = simulate_trajectory()

                # Find first slot where SoC drops below min
                breach_key: str | None = None
                for key, soc_after in trajectory:
                    if soc_after < self._min_battery:
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
                    and not self._planning.get(s["start"], {}).get("locked")
                    and self._planning.get(s["start"], {}).get("action") != ACTION_CAR_CHARGE
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
                    if soc >= self._max_battery:
                        action = ACTION_IDLE
                        action_config = {}
                    else:
                        predicted_soc_after = clamp(soc + charge_pct - drain_pct)
                        action = ACTION_CHARGE
                        action_config = {
                            "wattage": default_wattage,
                            "until_pct": round(min(predicted_soc_after, self._max_battery), 1),
                        }
                elif slot["price"] <= effective_battery_cost or soc <= self._min_battery:
                    # Cheap slot or battery depleted → use grid, spare the battery
                    action = ACTION_USE_NET
                    # Solar always takes precedence when using the grid
                    action_config = {"use_solar": True}
                elif self._allow_idle_for_optimize:
                    # Price is above effective cost → let battery power the home
                    if self._allow_discharge:
                        drop = charge_pct
                        if soc - drop - drain_pct >= self._min_battery:
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

                self._planning[key] = {
                    "action": action,
                    "locked": False,
                    "action_config": action_config,
                }

            # Advance SoC simulation
            if battery_size_kwh and battery_size_kwh > 0:
                if action == ACTION_CHARGE:
                    soc = clamp(soc + charge_pct - drain_pct)
                elif action == ACTION_DISCHARGE:
                    soc = clamp(soc - charge_pct - drain_pct)
                elif action == ACTION_USE_NET:
                    pass
                else:
                    soc = clamp(soc - drain_pct)

        await self._async_save_planning()
        await self.async_refresh()

