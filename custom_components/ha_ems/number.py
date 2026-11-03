"""Number entities for HA-EMS."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.number import (
    NumberEntity,
    NumberEntityDescription,
    NumberMode,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    ENTITY_AVG_CONSUMPTION,
    ENTITY_KWP,
    ENTITY_MAX_BATTERY,
    ENTITY_MIN_BATTERY,
)
from .coordinator import EMSConfigEntry, EMSCoordinator


@dataclass(frozen=True, kw_only=True)
class EMSNumberDescription(NumberEntityDescription):
    """A number backed by one field of EMSSettings."""

    setting: str
    # Settings are stored in base units; scale converts to the displayed unit
    # (e.g. W stored, kW shown -> 1000).
    scale: float = 1.0
    precision: int | None = None


NUMBERS: tuple[EMSNumberDescription, ...] = (
    EMSNumberDescription(
        key=ENTITY_MIN_BATTERY,
        translation_key=ENTITY_MIN_BATTERY,
        setting="min_battery",
        native_min_value=0.0,
        native_max_value=100.0,
        native_step=1.0,
        native_unit_of_measurement="%",
        mode=NumberMode.BOX,
        icon="mdi:battery-low",
    ),
    EMSNumberDescription(
        key=ENTITY_MAX_BATTERY,
        translation_key=ENTITY_MAX_BATTERY,
        setting="max_battery",
        native_min_value=0.0,
        native_max_value=100.0,
        native_step=1.0,
        native_unit_of_measurement="%",
        mode=NumberMode.BOX,
        icon="mdi:battery-high",
    ),
    EMSNumberDescription(
        key=ENTITY_AVG_CONSUMPTION,
        translation_key=ENTITY_AVG_CONSUMPTION,
        setting="avg_consumption",
        native_min_value=0.0,
        native_max_value=10000.0,
        native_step=10.0,
        native_unit_of_measurement="W",
        mode=NumberMode.BOX,
        icon="mdi:lightning-bolt",
    ),
    EMSNumberDescription(
        key=ENTITY_KWP,
        translation_key=ENTITY_KWP,
        setting="kwp_w",
        scale=1000.0,
        precision=3,
        native_min_value=0.1,
        native_max_value=50.0,
        native_step=0.001,
        native_unit_of_measurement="kW",
        mode=NumberMode.BOX,
        icon="mdi:solar-power",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: EMSConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = config_entry.runtime_data
    async_add_entities(
        EMSSettingNumber(coordinator, config_entry, description)
        for description in NUMBERS
    )


class EMSSettingNumber(CoordinatorEntity[EMSCoordinator], NumberEntity, RestoreEntity):
    """Edit one planning setting; the value survives restarts."""

    _attr_has_entity_name = True
    entity_description: EMSNumberDescription

    def __init__(
        self,
        coordinator: EMSCoordinator,
        config_entry: EMSConfigEntry,
        description: EMSNumberDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{config_entry.entry_id}_{description.key}"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state not in ("unknown", "unavailable"):
            try:
                value = float(last.state) * self.entity_description.scale
            except ValueError:
                return
            # Restore without validation or refresh: setup refreshes once all
            # entities have restored.
            setattr(self.coordinator.settings, self.entity_description.setting, value)

    @property
    def native_value(self) -> float:
        desc = self.entity_description
        value = getattr(self.coordinator.settings, desc.setting) / desc.scale
        return round(value, desc.precision) if desc.precision is not None else value

    async def async_set_native_value(self, value: float) -> None:
        desc = self.entity_description
        await self.coordinator.async_update_settings(**{desc.setting: value * desc.scale})
