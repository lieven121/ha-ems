"""The HA-EMS integration."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, PLATFORMS
from .coordinator import EMSConfigEntry, EMSCoordinator
from .services import async_register_services

_LOGGER = logging.getLogger(__name__)

_CARD_URL  = "/ha_ems/ha-ems.js"
_CARD_FILE = Path(__file__).parent / "www" / "ha-ems.js"

# Configured through the UI only; no YAML.
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, _config: ConfigType) -> bool:
    """Register the Lovelace card and the services (once per HA start).

    Services live for the whole HA run rather than per config entry, so they
    are always available to automations and fail with a clear error when no
    EMS entry is loaded instead of being missing.
    """
    if _CARD_FILE.exists():
        await hass.http.async_register_static_paths(
            [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
        )
        _LOGGER.debug("HA-EMS card registered at %s", _CARD_URL)
    async_register_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: EMSConfigEntry) -> bool:
    """Set up HA-EMS from a config entry."""
    coordinator = EMSCoordinator(hass, entry)
    entry.async_on_unload(coordinator.async_shutdown)
    await coordinator.async_load_planning()
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Refresh again now that all platform entities have restored their state
    # (number/switch entities restore values in async_added_to_hass which runs
    # during async_forward_entry_setups, so this second refresh picks them up)
    await coordinator.async_refresh()

    # Watch the price entity: refresh automatically whenever its state changes
    # (covers the case where it isn't available yet at startup)
    coordinator.async_start_price_tracking()

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: EMSConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(hass: HomeAssistant, entry: EMSConfigEntry) -> None:
    """Reload when the config entry is updated.

    A refresh is not enough: adding or removing a schedulable device changes
    which binary_sensor entities should exist, and only a reload re-runs the
    platform setup.
    """
    await hass.config_entries.async_reload(entry.entry_id)
