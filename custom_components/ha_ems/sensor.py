"""Sensor entities for HA-EMS."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    ACTION_LABELS,
    CONF_BATTERY_ENTITY_ID,
    CONF_BATTERY_SIZE_KWH,
    ENTITY_CURRENT_ACTION,
    ENTITY_PLANNING,
)
from .coordinator import EMSConfigEntry, EMSCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: EMSConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = config_entry.runtime_data
    async_add_entities(
        [
            EMSPlanningSensor(coordinator, config_entry),
            EMSCurrentActionSensor(coordinator, config_entry),
        ]
    )


class EMSPlanningSensor(CoordinatorEntity[EMSCoordinator], SensorEntity):
    """Sensor whose state is the current slot action and whose attribute holds the full plan."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:calendar-clock"
    # The full plan is far beyond the recorder's 16 KB attribute limit and is
    # only useful live (for the card), so keep it out of history.
    _unrecorded_attributes = frozenset({"planning", "devices_available"})

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_PLANNING}"
        self._attr_translation_key = ENTITY_PLANNING
        self._attr_device_info = coordinator.device_info

    @property
    def native_value(self) -> str:
        slot = self.coordinator.current_slot
        return slot["action"] if slot else "unknown"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        cfg = self.coordinator.config_entry.data
        return {
            "planning": self.coordinator.data or [],
            # Surfaced so the Lovelace card can draw the battery overlay without
            # the entity id having to be configured a second time on the card.
            "battery_entity_id": cfg.get(CONF_BATTERY_ENTITY_ID),
            "battery_size_kwh": cfg.get(CONF_BATTERY_SIZE_KWH),
            "devices_available": [
                {
                    "name": d["name"],
                    "control": d["control"],
                    "modes": [m["name"] for m in d["modes"]],
                    "default_wattage": d["default_wattage"],
                }
                for d in self.coordinator.configured_devices
            ],
        }


class EMSCurrentActionSensor(CoordinatorEntity[EMSCoordinator], SensorEntity):
    """Sensor whose state is the human-readable label of the current slot action."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:lightning-bolt"

    def __init__(
        self, coordinator: EMSCoordinator, config_entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{config_entry.entry_id}_{ENTITY_CURRENT_ACTION}"
        self._attr_translation_key = ENTITY_CURRENT_ACTION
        self._attr_device_info = coordinator.device_info

    def _current_slot(self) -> dict | None:
        return self.coordinator.current_slot

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
        attrs: dict[str, Any] = {
            "action": slot["action"],
            "start": slot["start"],
            "price": slot.get("price"),
            "locked": slot.get("locked", False),
            "action_config": action_config,
            "devices": slot.get("devices") or [],
        }
        # Also flatten action_config into top-level for easy automation use
        attrs.update(action_config)
        battery = slot.get("battery_prediction")
        if battery is not None:
            attrs["battery_prediction"] = battery
        return attrs
