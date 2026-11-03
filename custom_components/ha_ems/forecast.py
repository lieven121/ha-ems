"""Read solar forecasts and energy history from Home Assistant's Energy dashboard.

Everything here is configured once, in Settings -> Dashboards -> Energy: the
grid, solar and battery meters and the solar forecast integrations
(Forecast.Solar, Open-Meteo Solar Forecast, Solcast, ...). Reading that config
means HA-EMS needs no setup of its own. When the Energy dashboard isn't set
up, every method returns empty results and the caller falls back to the
flat average consumption and no solar.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util.dt import as_local, parse_datetime, utcnow

from .load_profile import house_load_wh

_LOGGER = logging.getLogger(__name__)

_SOLAR_CACHE_TTL = timedelta(minutes=30)


async def _async_energy_prefs(hass: HomeAssistant) -> dict[str, Any] | None:
    """The Energy dashboard preferences, or None if it isn't set up."""
    try:
        from homeassistant.components.energy.data import async_get_manager
    except ImportError:
        return None
    try:
        manager = await async_get_manager(hass)
    except Exception:  # noqa: BLE001 - energy is optional, never fail planning
        _LOGGER.debug("Energy manager unavailable", exc_info=True)
        return None
    return manager.data or None


def _sources(prefs: dict[str, Any] | None, kind: str) -> list[dict[str, Any]]:
    if not prefs:
        return []
    return [s for s in prefs.get("energy_sources") or [] if s.get("type") == kind]


class EnergyDashboardSource:
    """Solar forecast and energy statistics from the Energy dashboard config."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._solar: dict[datetime, float] = {}
        self._solar_fetched: datetime | None = None

    # ------------------------------------------------------------------
    # Solar forecast
    # ------------------------------------------------------------------

    async def async_solar_forecast(self) -> dict[datetime, float]:
        """Forecast PV energy, {period start: Wh}, summed over all arrays.

        Cached for half an hour: forecast integrations update hourly at most.
        """
        now = utcnow()
        if self._solar_fetched and now - self._solar_fetched < _SOLAR_CACHE_TTL:
            return self._solar
        self._solar = await self._async_fetch_solar()
        self._solar_fetched = now
        return self._solar

    async def _async_fetch_solar(self) -> dict[datetime, float]:
        prefs = await _async_energy_prefs(self.hass)
        entry_ids = {
            entry_id
            for source in _sources(prefs, "solar")
            for entry_id in source.get("config_entry_solar_forecast") or []
        }
        if not entry_ids:
            return {}

        try:
            from homeassistant.components.energy.websocket_api import (
                async_get_energy_platforms,
            )

            # {domain: async_get_solar_forecast function}
            forecasters = await async_get_energy_platforms(self.hass)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Energy platforms unavailable", exc_info=True)
            return {}

        total: dict[datetime, float] = {}
        for entry_id in entry_ids:
            entry = self.hass.config_entries.async_get_entry(entry_id)
            get_forecast = forecasters.get(entry.domain) if entry else None
            if get_forecast is None:
                continue
            try:
                forecast = await get_forecast(self.hass, entry_id)
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Solar forecast from %s failed", entry_id, exc_info=True)
                continue
            for key, wh in ((forecast or {}).get("wh_hours") or {}).items():
                ts = parse_datetime(str(key))
                if ts is None:
                    continue
                try:
                    total[ts] = total.get(ts, 0.0) + float(wh)
                except (TypeError, ValueError):
                    continue
        return total

    # ------------------------------------------------------------------
    # Metered history
    # ------------------------------------------------------------------

    async def async_house_load_history(
        self, start: datetime, end: datetime
    ) -> dict[datetime, float]:
        """House load in Wh per hour between *start* and *end* (local hour starts).

        Derived from the Energy dashboard's grid, solar and battery meters; see
        load_profile.house_load_wh. Empty if no grid meter is configured.
        """
        prefs = await _async_energy_prefs(self.hass)
        roles = _meter_roles(prefs)
        if not roles["imports"]:
            return {}
        stat_ids = {sid for ids in roles.values() for sid in ids}

        try:
            from homeassistant.components.recorder import get_instance
            from homeassistant.components.recorder.statistics import (
                statistics_during_period,
            )

            stats = await get_instance(self.hass).async_add_executor_job(
                statistics_during_period,
                self.hass,
                start,
                end,
                stat_ids,
                "hour",
                {"energy": "kWh"},
                {"change"},
            )
        except Exception:  # noqa: BLE001 - recorder is optional, never fail planning
            _LOGGER.debug("Reading energy statistics failed", exc_info=True)
            return {}

        def series(stat_id: str) -> dict[datetime, float]:
            out: dict[datetime, float] = {}
            for row in stats.get(stat_id) or []:
                change = row.get("change")
                ts = _row_start(row.get("start"))
                if change is None or ts is None:
                    continue
                out[as_local(ts)] = float(change)
            return out

        return house_load_wh(
            *([series(sid) for sid in roles[role]] for role in _ROLE_ORDER)
        )


_ROLE_ORDER = ("imports", "exports", "solar", "battery_out", "battery_in")


def _meter_roles(prefs: dict[str, Any] | None) -> dict[str, list[str]]:
    """Statistic IDs per role from the Energy dashboard config.

    Accepts both grid layouts HA has used: ``flow_from``/``flow_to`` lists
    on one grid source, and grid sources carrying the IDs directly.
    """
    roles: dict[str, list[str]] = {role: [] for role in _ROLE_ORDER}

    def add(role: str, stat_id: Any) -> None:
        if isinstance(stat_id, str) and stat_id and stat_id not in roles[role]:
            roles[role].append(stat_id)

    for grid in _sources(prefs, "grid"):
        for flow in grid.get("flow_from") or []:
            add("imports", flow.get("stat_energy_from"))
        for flow in grid.get("flow_to") or []:
            add("exports", flow.get("stat_energy_to"))
        add("imports", grid.get("stat_energy_from"))
        add("exports", grid.get("stat_energy_to"))
    for solar in _sources(prefs, "solar"):
        add("solar", solar.get("stat_energy_from"))
    for battery in _sources(prefs, "battery"):
        add("battery_out", battery.get("stat_energy_from"))
        add("battery_in", battery.get("stat_energy_to"))
    return roles


def _row_start(value: Any) -> datetime | None:
    """Statistics rows carry the start as a UNIX timestamp (or, long ago, a datetime)."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=UTC)
    return None
