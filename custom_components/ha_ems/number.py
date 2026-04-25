"""Number entities for HA-EMS."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DEFAULT_AVG_CONSUMPTION,
    DEFAULT_KWP,
    DEFAULT_MAX_BATTERY,
    DEFAULT_MIN_BATTERY,
    DOMAIN,
    ENTITY_AVG_CONSUMPTION,
    ENTITY_KWP,
    ENTITY_MAX_BATTERY,
    ENTITY_MIN_BATTERY,
)
from .coordinator import EMSCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: EMSCoordinator = hass.data[DOMAIN][config_entry.entry_id]
    async_add_entities(
        [
            EMSMinBatteryNumber(coordinator, config_entry),
            EMSMaxBatteryNumber(coordinator, config_entry),
            EMSAvgConsumptionNumber(coordinator, config_entry),
            EMSKwpNumber(coordinator, config_entry),
        ]
    )


class EMSMinBatteryNumber(CoordinatorEntity[EMSCoordinator], NumberEntity, RestoreEntity):
    """Minimum battery % the optimizer will discharge to."""

    _attr_native_min_value = 0.0
    _attr_native_max_value = 100.0
    _attr_native_step = 1.0
    _attr_native_unit_of_measurement = "%"
    _attr_mode = NumberMode.BOX
    _attr_icon = "mdi:battery-low"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_MIN_BATTERY}"
        self._attr_name = "EMS Min Battery"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state not in ("unknown", "unavailable"):
            try:
                val = float(last.state)
                self.coordinator._min_battery = val
            except ValueError:
                pass

    @property
    def native_value(self) -> float:
        return self.coordinator._min_battery

    async def async_set_native_value(self, value: float) -> None:
        self.coordinator._min_battery = value
        await self.coordinator.async_refresh()


class EMSMaxBatteryNumber(CoordinatorEntity[EMSCoordinator], NumberEntity, RestoreEntity):
    """Maximum battery % the optimizer will charge to."""

    _attr_native_min_value = 0.0
    _attr_native_max_value = 100.0
    _attr_native_step = 1.0
    _attr_native_unit_of_measurement = "%"
    _attr_mode = NumberMode.BOX
    _attr_icon = "mdi:battery-high"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_MAX_BATTERY}"
        self._attr_name = "EMS Max Battery"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state not in ("unknown", "unavailable"):
            try:
                val = float(last.state)
                self.coordinator._max_battery = val
            except ValueError:
                pass

    @property
    def native_value(self) -> float:
        return self.coordinator._max_battery

    async def async_set_native_value(self, value: float) -> None:
        self.coordinator._max_battery = value
        await self.coordinator.async_refresh()


class EMSAvgConsumptionNumber(
    CoordinatorEntity[EMSCoordinator], NumberEntity, RestoreEntity
):
    """Average home consumption in watts used for battery drain estimation."""

    _attr_native_min_value = 0.0
    _attr_native_max_value = 10000.0
    _attr_native_step = 10.0
    _attr_native_unit_of_measurement = "W"
    _attr_mode = NumberMode.BOX
    _attr_icon = "mdi:lightning-bolt"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_AVG_CONSUMPTION}"
        self._attr_name = "EMS Avg Consumption"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state not in ("unknown", "unavailable"):
            try:
                val = float(last.state)
                self.coordinator._avg_consumption = val
            except ValueError:
                pass

    @property
    def native_value(self) -> float:
        return self.coordinator._avg_consumption

    async def async_set_native_value(self, value: float) -> None:
        self.coordinator._avg_consumption = value
        await self.coordinator.async_refresh()


class EMSKwpNumber(CoordinatorEntity[EMSCoordinator], NumberEntity, RestoreEntity):
    """Peak solar/inverter power in kW — used as the default max charge wattage."""

    _attr_native_min_value = 0.1
    _attr_native_max_value = 50.0
    _attr_native_step = 0.001
    _attr_native_unit_of_measurement = "kW"
    _attr_mode = NumberMode.BOX
    _attr_icon = "mdi:solar-power"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_KWP}"
        self._attr_name = "EMS kWp"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state not in ("unknown", "unavailable"):
            try:
                # Stored as kW, convert to W internally
                self.coordinator._kwp = float(last.state) * 1000.0
            except ValueError:
                pass

    @property
    def native_value(self) -> float:
        return round(self.coordinator._kwp / 1000.0, 3)

    async def async_set_native_value(self, value: float) -> None:
        self.coordinator._kwp = value * 1000.0
        await self.coordinator.async_refresh()
