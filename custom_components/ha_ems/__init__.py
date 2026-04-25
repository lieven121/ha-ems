"""The HA-EMS integration."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .coordinator import EMSCoordinator
from .services import async_register_services, async_unregister_services

_LOGGER = logging.getLogger(__name__)

_CARD_URL  = "/ha_ems/ha-ems.js"
_CARD_FILE = Path(__file__).parent / "www" / "ha-ems.js"


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Register the Lovelace card as a static resource (once per HA start)."""
    if _CARD_FILE.exists():
        await hass.http.async_register_static_paths(
            [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
        )
        _LOGGER.debug("HA-EMS card registered at %s", _CARD_URL)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA-EMS from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    coordinator = EMSCoordinator(hass, entry)
    await coordinator.async_load_planning()
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await async_register_services(hass)

    # Refresh again now that all platform entities have restored their state
    # (number/switch entities restore values in async_added_to_hass which runs
    # during async_forward_entry_setups, so this second refresh picks them up)
    await coordinator.async_refresh()

    # Watch the price entity: refresh automatically whenever its state changes
    # (covers the case where it isn't available yet at startup)
    coordinator.async_start_price_tracking()

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        await async_unregister_services(hass)
    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Refresh coordinator when config entry is updated externally."""
    coordinator: EMSCoordinator | None = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if coordinator is not None:
        coordinator.config_entry = entry
        await coordinator.async_refresh()
