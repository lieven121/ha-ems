"""Sensor entities for HA-EMS."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ACTION_LABELS, DOMAIN, ENTITY_CURRENT_ACTION, ENTITY_PLANNING
from .coordinator import EMSCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: EMSCoordinator = hass.data[DOMAIN][config_entry.entry_id]
    async_add_entities(
        [
            EMSPlanningSensor(coordinator, config_entry),
            EMSCurrentActionSensor(coordinator, config_entry),
        ]
    )


class EMSPlanningSensor(CoordinatorEntity[EMSCoordinator], SensorEntity):
    """Sensor whose state is the current slot action and whose attribute holds the full plan."""

    _attr_icon = "mdi:calendar-clock"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_PLANNING}"
        self._attr_name = "EMS Planning"
        self._attr_device_info = coordinator.device_info

    @property
    def native_value(self) -> str:
        slots: list[dict] = self.coordinator.data or []
        idx = self.coordinator._nowslot_idx(slots)
        if idx is not None:
            return slots[idx]["action"]
        return "unknown"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"planning": self.coordinator.data or []}


class EMSCurrentActionSensor(CoordinatorEntity[EMSCoordinator], SensorEntity):
    """Sensor whose state is the human-readable label of the current slot action."""

    _attr_icon = "mdi:lightning-bolt"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_CURRENT_ACTION}"
        self._attr_name = "EMS Current Action"
        self._attr_device_info = coordinator.device_info

    def _current_slot(self) -> dict | None:
        slots: list[dict] = self.coordinator.data or []
        idx = self.coordinator._nowslot_idx(slots)
        return slots[idx] if idx is not None else None

    @property
    def native_value(self) -> str:
        slot = self._current_slot()
        if slot:
            return ACTION_LABELS.get(slot["action"], slot["action"])
        return "Unknown"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        slot = self._current_slot()
        if not slot:
            return {}
        action_config = slot.get("action_config") or {}
        car = slot.get("car") or {}
        attrs: dict[str, Any] = {
            "action": slot["action"],
            "start": slot["start"],
            "price": slot.get("price"),
            "locked": slot.get("locked", False),
            "action_config": action_config,
            "car": car,
        }
        # Also flatten action_config into top-level for easy automation use
        attrs.update(action_config)
        battery = slot.get("battery_prediction")
        if battery is not None:
            attrs["battery_prediction"] = battery
        return attrs
