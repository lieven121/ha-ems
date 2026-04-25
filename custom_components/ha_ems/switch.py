"""Switch entity for HA-EMS allow-discharge toggle."""

from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, ENTITY_ALLOW_DISCHARGE, ENTITY_ALLOW_IDLE_FOR_OPTIMIZE
from .coordinator import EMSCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: EMSCoordinator = hass.data[DOMAIN][config_entry.entry_id]
    async_add_entities([
        EMSAllowDischargeSwitch(coordinator, config_entry),
        EMSAllowIdleForOptimizeSwitch(coordinator, config_entry),
    ])


class EMSAllowDischargeSwitch(
    CoordinatorEntity[EMSCoordinator], SwitchEntity, RestoreEntity
):
    """Controls whether the optimizer may assign discharge actions."""

    _attr_icon = "mdi:battery-arrow-down"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_ALLOW_DISCHARGE}"
        self._attr_name = "EMS Allow Discharge"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last:
            self.coordinator._allow_discharge = last.state == "on"

    @property
    def is_on(self) -> bool:
        return self.coordinator._allow_discharge

    async def async_turn_on(self, **kwargs) -> None:
        self.coordinator._allow_discharge = True
        await self.coordinator.async_refresh()

    async def async_turn_off(self, **kwargs) -> None:
        self.coordinator._allow_discharge = False
        await self.coordinator.async_refresh()


class EMSAllowIdleForOptimizeSwitch(
    CoordinatorEntity[EMSCoordinator], SwitchEntity, RestoreEntity
):
    """Controls whether the optimizer may leave expensive slots as idle.

    When ON (default): slots with price > effective_battery_cost → idle
      (let battery power the home — worth it vs grid cost).
    When OFF: all non-charge slots → use_net (preserve battery, always use grid).
    """

    _attr_icon = "mdi:battery-clock"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_ALLOW_IDLE_FOR_OPTIMIZE}"
        self._attr_name = "EMS Allow Idle (Optimizer)"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last:
            self.coordinator._allow_idle_for_optimize = last.state == "on"

    @property
    def is_on(self) -> bool:
        return self.coordinator._allow_idle_for_optimize

    async def async_turn_on(self, **kwargs) -> None:
        self.coordinator._allow_idle_for_optimize = True
        await self.coordinator.async_refresh()

    async def async_turn_off(self, **kwargs) -> None:
        self.coordinator._allow_idle_for_optimize = False
        await self.coordinator.async_refresh()
