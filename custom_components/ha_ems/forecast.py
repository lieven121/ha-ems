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
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util.dt import parse_datetime, utcnow

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

            platforms = await async_get_energy_platforms(self.hass)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Energy platforms unavailable", exc_info=True)
            return {}

        total: dict[datetime, float] = {}
        for entry_id in entry_ids:
            entry = self.hass.config_entries.async_get_entry(entry_id)
            platform = platforms.get(entry.domain) if entry else None
            if platform is None:
                continue
            try:
                forecast = await platform.async_get_solar_forecast(self.hass, entry_id)
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
