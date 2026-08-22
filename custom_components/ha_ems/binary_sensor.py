"""Binary sensor platform for HA-EMS — one entity per schedulable device.

The integration plans, it does not actuate. Each configured device gets a binary
sensor that is `on` while the current slot schedules it; users drive the real
appliance from an automation on that entity, the same way `ems_current_action`
and the `ha_ems_action_changed` event drive the battery.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import slugify

from .const import (
    CONF_DEVICE_CONTROL,
    CONF_DEVICE_DEFAULT_WATTAGE,
    CONF_DEVICE_NAME,
    CONF_DEVICE_SWITCH_ENTITY_ID,
    DOMAIN,
    ENTITY_DEVICE_PREFIX,
)
from .coordinator import EMSCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: EMSCoordinator = hass.data[DOMAIN][config_entry.entry_id]
    async_add_entities(
        EMSDeviceSensor(coordinator, config_entry, device)
        for device in coordinator.configured_devices
    )


class EMSDeviceSensor(CoordinatorEntity[EMSCoordinator], BinarySensorEntity):
    """On while the current slot schedules this device."""

    _attr_icon = "mdi:power-plug"

    def __init__(
        self,
        coordinator: EMSCoordinator,
        config_entry: ConfigEntry,
        device: dict[str, Any],
    ) -> None:
        super().__init__(coordinator)
        self._device_name: str = device[CONF_DEVICE_NAME]
        self._default_wattage: float = device[CONF_DEVICE_DEFAULT_WATTAGE]
        self._control: str = device[CONF_DEVICE_CONTROL]
        self._switch_entity_id: str | None = device.get(CONF_DEVICE_SWITCH_ENTITY_ID)
        self._attr_unique_id = (
            f"{config_entry.entry_id}_{ENTITY_DEVICE_PREFIX}_{slugify(self._device_name)}"
        )
        self._attr_name = f"EMS {self._device_name}"
        self._attr_device_info = coordinator.device_info

    def _slot_entry(self, slot: dict | None) -> dict | None:
        """Return this device's entry within *slot*, if it is scheduled there."""
        if not slot:
            return None
        for dev in slot.get("devices") or []:
            if dev.get("name") == self._device_name:
                return dev
        return None

    def _current_slot(self) -> dict | None:
        slots: list[dict] = self.coordinator.data or []
        idx = self.coordinator._nowslot_idx(slots)
        return slots[idx] if idx is not None else None

    @property
    def is_on(self) -> bool:
        return self._slot_entry(self._current_slot()) is not None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        slots: list[dict] = self.coordinator.data or []
        idx = self.coordinator._nowslot_idx(slots)
        current = slots[idx] if idx is not None else None
        entry = self._slot_entry(current)

        attrs: dict[str, Any] = {
            "device_name": self._device_name,
            "control": self._control,
            "default_wattage": self._default_wattage,
            "switch_entity_id": self._switch_entity_id,
            # The mode to run in, for mode-controlled devices.
            "mode": entry.get("mode") if entry else None,
            # Resolved load estimate, whatever the control type.
            "wattage": entry.get("allocated_wattage_w") if entry else None,
        }

        # Next scheduled occurrence, so an automation can pre-warm or display it.
        search_from = (idx + 1) if idx is not None else 0
        for slot in slots[search_from:]:
            nxt = self._slot_entry(slot)
            if nxt is not None:
                attrs["next_start"] = slot["start"]
                attrs["next_wattage"] = nxt.get("allocated_wattage_w")
                attrs["next_mode"] = nxt.get("mode")
                break
        else:
            attrs["next_start"] = None
            attrs["next_wattage"] = None
            attrs["next_mode"] = None

        return attrs
