"""Switch entities for HA-EMS optimiser toggles."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.switch import SwitchEntity, SwitchEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ENTITY_ALLOW_DISCHARGE, ENTITY_ALLOW_IDLE_FOR_OPTIMIZE
from .coordinator import EMSConfigEntry, EMSCoordinator


@dataclass(frozen=True, kw_only=True)
class EMSSwitchDescription(SwitchEntityDescription):
    """A switch backed by one boolean field of EMSSettings."""

    setting: str


SWITCHES: tuple[EMSSwitchDescription, ...] = (
    # Whether the optimiser may assign discharge actions.
    EMSSwitchDescription(
        key=ENTITY_ALLOW_DISCHARGE,
        translation_key=ENTITY_ALLOW_DISCHARGE,
        setting="allow_discharge",
        icon="mdi:battery-arrow-down",
    ),
    # Whether the optimiser may leave expensive slots as idle.
    #   ON (default): slots priced above the effective battery cost -> idle
    #     (let the battery power the home, worth it vs the grid price).
    #   OFF: every non-charge slot -> use_net (preserve the battery).
    EMSSwitchDescription(
        key=ENTITY_ALLOW_IDLE_FOR_OPTIMIZE,
        translation_key=ENTITY_ALLOW_IDLE_FOR_OPTIMIZE,
        setting="allow_idle_for_optimize",
        icon="mdi:battery-clock",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: EMSConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = config_entry.runtime_data
    async_add_entities(
        EMSSettingSwitch(coordinator, config_entry, description)
        for description in SWITCHES
    )


class EMSSettingSwitch(CoordinatorEntity[EMSCoordinator], SwitchEntity, RestoreEntity):
    """Toggle one optimiser setting; the value survives restarts."""

    _attr_has_entity_name = True
    entity_description: EMSSwitchDescription

    def __init__(
        self,
        coordinator: EMSCoordinator,
        config_entry: EMSConfigEntry,
        description: EMSSwitchDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{config_entry.entry_id}_{description.key}"
        self._attr_device_info = coordinator.device_info

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        # Only a real on/off restores; "unavailable" used to switch it off.
        if last and last.state in ("on", "off"):
            setattr(
                self.coordinator.settings,
                self.entity_description.setting,
                last.state == "on",
            )

    @property
    def is_on(self) -> bool:
        return getattr(self.coordinator.settings, self.entity_description.setting)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.async_update_settings(
            **{self.entity_description.setting: True}
        )

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.async_update_settings(
            **{self.entity_description.setting: False}
        )
