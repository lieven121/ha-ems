"""Button platform for HA-EMS — exposes an Optimize button entity."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, ENTITY_OPTIMIZE
from .coordinator import EMSCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: EMSCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([EMSOptimizeButton(coordinator, entry)])


class EMSOptimizeButton(ButtonEntity):
    """Button that triggers the EMS optimizer."""

    _attr_has_entity_name = True
    _attr_name = "Optimize"
    _attr_icon = "mdi:auto-fix"

    def __init__(self, coordinator: EMSCoordinator, entry: ConfigEntry) -> None:
        self._coordinator = coordinator
        self._attr_unique_id = f"{entry.entry_id}_{ENTITY_OPTIMIZE}"
        self._attr_device_info: DeviceInfo = coordinator.device_info

    async def async_press(self) -> None:
        """Run the optimizer and refresh the planning sensor."""
        await self._coordinator.async_optimize()
        await self._coordinator.async_refresh()
