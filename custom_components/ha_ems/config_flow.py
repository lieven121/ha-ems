"""Config flow for HA-EMS."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
)

from .const import (
    CONF_BATTERY_ENTITY_ID,
    CONF_BATTERY_SIZE_KWH,
    CONF_DEVICE_CONTROL,
    CONF_DEVICE_DEFAULT_WATTAGE,
    CONF_DEVICE_MODES,
    CONF_DEVICE_NAME,
    CONF_DEVICE_SWITCH_ENTITY_ID,
    CONF_DEVICES,
    CONF_INJECTION_PRICE_KEY,
    CONF_PRICE_ATTRIBUTE,
    CONF_PRICE_ENTITY_ID,
    CONF_PRICE_KEY,
    CONF_ROUNDTRIP_LOSS_PCT,
    CONF_START_KEY,
    DEFAULT_DEVICE_WATTAGE,
    DEVICE_CONTROL_MODES,
    DEVICE_CONTROL_WATTAGE,
    DEVICE_CONTROLS,
    DEFAULT_PRICE_ATTRIBUTE,
    DEFAULT_PRICE_KEY,
    DEFAULT_ROUNDTRIP_LOSS_PCT,
    DEFAULT_START_KEY,
    DOMAIN,
)


def _user_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    d = defaults or {}
    return vol.Schema(
        {
            vol.Required(
                CONF_PRICE_ENTITY_ID,
                description={"suggested_value": d.get(CONF_PRICE_ENTITY_ID, "")},
            ): EntitySelector(EntitySelectorConfig(domain="sensor")),
            vol.Required(
                CONF_PRICE_ATTRIBUTE,
                default=d.get(CONF_PRICE_ATTRIBUTE, DEFAULT_PRICE_ATTRIBUTE),
            ): TextSelector(TextSelectorConfig()),
            vol.Required(
                CONF_START_KEY,
                default=d.get(CONF_START_KEY, DEFAULT_START_KEY),
            ): TextSelector(TextSelectorConfig()),
            vol.Required(
                CONF_PRICE_KEY,
                default=d.get(CONF_PRICE_KEY, DEFAULT_PRICE_KEY),
            ): TextSelector(TextSelectorConfig()),
            vol.Optional(
                CONF_INJECTION_PRICE_KEY,
                description={"suggested_value": d.get(CONF_INJECTION_PRICE_KEY, "")},
            ): TextSelector(TextSelectorConfig()),
        }
    )


def _battery_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    d = defaults or {}
    schema: dict[vol.Marker, Any] = {}
    schema[
        vol.Optional(
            CONF_BATTERY_ENTITY_ID,
            description={"suggested_value": d.get(CONF_BATTERY_ENTITY_ID, "")},
        )
    ] = EntitySelector(EntitySelectorConfig(domain=["number", "sensor"]))
    schema[
        vol.Optional(
            CONF_BATTERY_SIZE_KWH,
            description={"suggested_value": d.get(CONF_BATTERY_SIZE_KWH)},
        )
    ] = NumberSelector(
        NumberSelectorConfig(
            min=0.1,
            max=200.0,
            step=0.1,
            mode=NumberSelectorMode.BOX,
            unit_of_measurement="kWh",
        )
    )
    schema[
        vol.Required(
            CONF_ROUNDTRIP_LOSS_PCT,
            default=d.get(CONF_ROUNDTRIP_LOSS_PCT, DEFAULT_ROUNDTRIP_LOSS_PCT),
        )
    ] = NumberSelector(
        NumberSelectorConfig(
            min=0,
            max=50,
            step=1,
            mode=NumberSelectorMode.SLIDER,
            unit_of_measurement="%",
        )
    )
    return vol.Schema(schema)




def parse_modes(raw: list[str] | None) -> list[dict[str, Any]]:
    """Parse mode chips into {name, wattage}.

    A bare chip is just a mode name. "Comfort:1500" additionally pins the power
    that mode draws, so the battery forecast can tell modes apart. Anything
    without a number falls back to the device's default wattage.
    """
    modes: list[dict[str, Any]] = []
    for chip in raw or []:
        text = str(chip).strip()
        if not text:
            continue
        name, sep, watt_text = text.rpartition(":")
        if sep and name.strip():
            try:
                modes.append({"name": name.strip(), "wattage": float(watt_text)})
                continue
            except ValueError:
                pass
        modes.append({"name": text, "wattage": None})
    return modes


def _device_add_schema() -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_DEVICE_NAME): TextSelector(TextSelectorConfig()),
            vol.Required(
                CONF_DEVICE_CONTROL, default=DEVICE_CONTROL_WATTAGE
            ): SelectSelector(
                SelectSelectorConfig(
                    options=DEVICE_CONTROLS,
                    translation_key="device_control",
                    mode=SelectSelectorMode.LIST,
                )
            ),
            vol.Optional(CONF_DEVICE_MODES): SelectSelector(
                SelectSelectorConfig(options=[], multiple=True, custom_value=True)
            ),
            vol.Required(
                CONF_DEVICE_DEFAULT_WATTAGE, default=DEFAULT_DEVICE_WATTAGE
            ): NumberSelector(
                NumberSelectorConfig(
                    min=0,
                    max=100000,
                    step=100,
                    mode=NumberSelectorMode.BOX,
                    unit_of_measurement="W",
                )
            ),
            vol.Optional(CONF_DEVICE_SWITCH_ENTITY_ID): EntitySelector(
                EntitySelectorConfig(domain=["switch", "input_boolean", "climate", "water_heater"])
            ),
        }
    )


def _device_remove_schema(names: list[str]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_DEVICES): SelectSelector(
                SelectSelectorConfig(
                    options=names, multiple=True, mode=SelectSelectorMode.LIST
                )
            )
        }
    )


class _DeviceStepsMixin:
    """Add/remove schedulable devices. Shared by the config and options flows."""

    _devices: list[dict[str, Any]]

    def _device_menu_options(self) -> list[str]:
        options = ["device_add", "finish"]
        if self._devices:
            options.insert(1, "device_remove")
        return options

    async def async_step_devices(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        summary = (
            ", ".join(
                f"- {d[CONF_DEVICE_NAME]}"
                f" [{d.get(CONF_DEVICE_CONTROL, DEVICE_CONTROL_WATTAGE)}]"
                f" ~{d[CONF_DEVICE_DEFAULT_WATTAGE]:.0f} W"
                for d in self._devices
            )
            or "No devices configured yet."
        )
        return self.async_show_menu(
            step_id="devices",
            menu_options=self._device_menu_options(),
            description_placeholders={"devices": summary},
        )

    async def async_step_device_add(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            name = str(user_input[CONF_DEVICE_NAME]).strip()
            control = user_input[CONF_DEVICE_CONTROL]
            modes = parse_modes(user_input.get(CONF_DEVICE_MODES))
            if not name:
                errors[CONF_DEVICE_NAME] = "invalid_device_name"
            elif any(d[CONF_DEVICE_NAME].lower() == name.lower() for d in self._devices):
                errors[CONF_DEVICE_NAME] = "duplicate_device"
            elif control == DEVICE_CONTROL_MODES and not modes:
                errors[CONF_DEVICE_MODES] = "modes_required"
            else:
                self._devices.append(
                    {
                        CONF_DEVICE_NAME: name,
                        CONF_DEVICE_CONTROL: control,
                        CONF_DEVICE_MODES: modes,
                        CONF_DEVICE_DEFAULT_WATTAGE: float(
                            user_input[CONF_DEVICE_DEFAULT_WATTAGE]
                        ),
                        CONF_DEVICE_SWITCH_ENTITY_ID: user_input.get(
                            CONF_DEVICE_SWITCH_ENTITY_ID
                        ),
                    }
                )
                return await self.async_step_devices()

        return self.async_show_form(
            step_id="device_add",
            data_schema=_device_add_schema(),
            errors=errors,
        )

    async def async_step_device_remove(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        if user_input is not None:
            removed = set(user_input[CONF_DEVICES])
            self._devices = [
                d for d in self._devices if d[CONF_DEVICE_NAME] not in removed
            ]
            return await self.async_step_devices()

        return self.async_show_form(
            step_id="device_remove",
            data_schema=_device_remove_schema(
                [d[CONF_DEVICE_NAME] for d in self._devices]
            ),
        )


class EMSConfigFlow(_DeviceStepsMixin, config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for HA-EMS."""

    VERSION = 1

    def __init__(self) -> None:
        self._user_data: dict[str, Any] = {}
        self._battery_data: dict[str, Any] = {}
        self._devices: list[dict[str, Any]] = []

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            if not self.hass.states.get(user_input[CONF_PRICE_ENTITY_ID]):
                errors[CONF_PRICE_ENTITY_ID] = "invalid_entity"
            else:
                self._user_data = user_input
                return await self.async_step_battery()

        return self.async_show_form(
            step_id="user",
            data_schema=_user_schema(),
            errors=errors,
        )

    async def async_step_battery(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            battery_entity = user_input.get(CONF_BATTERY_ENTITY_ID)
            if battery_entity and not self.hass.states.get(battery_entity):
                errors[CONF_BATTERY_ENTITY_ID] = "invalid_entity"
            else:
                self._battery_data = user_input
                return await self.async_step_devices()

        return self.async_show_form(
            step_id="battery",
            data_schema=_battery_schema(),
            errors=errors,
        )

    async def async_step_finish(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        return self.async_create_entry(
            title="EMS",
            data={
                **self._user_data,
                **self._battery_data,
                CONF_DEVICES: self._devices,
            },
        )

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return EMSOptionsFlow(config_entry)


class EMSOptionsFlow(_DeviceStepsMixin, config_entries.OptionsFlow):
    """Handle HA-EMS options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry
        self._user_data: dict[str, Any] = {}
        self._battery_data: dict[str, Any] = {}
        self._devices: list[dict[str, Any]] = [
            dict(d) for d in (config_entry.data.get(CONF_DEVICES) or [])
        ]

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        return await self.async_step_user(user_input)

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        errors: dict[str, str] = {}
        current = self._config_entry.data

        if user_input is not None:
            if not self.hass.states.get(user_input[CONF_PRICE_ENTITY_ID]):
                errors[CONF_PRICE_ENTITY_ID] = "invalid_entity"
            else:
                self._user_data = user_input
                return await self.async_step_battery()

        return self.async_show_form(
            step_id="user",
            data_schema=_user_schema(current),
            errors=errors,
        )

    async def async_step_battery(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        errors: dict[str, str] = {}
        current = self._config_entry.data

        if user_input is not None:
            battery_entity = user_input.get(CONF_BATTERY_ENTITY_ID)
            if battery_entity and not self.hass.states.get(battery_entity):
                errors[CONF_BATTERY_ENTITY_ID] = "invalid_entity"
            else:
                self._battery_data = user_input
                return await self.async_step_devices()

        return self.async_show_form(
            step_id="battery",
            data_schema=_battery_schema(current),
            errors=errors,
        )

    async def async_step_finish(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        new_data = {
            **self._config_entry.data,
            **self._user_data,
            **self._battery_data,
            CONF_DEVICES: self._devices,
        }
        # The entry's update listener reloads the integration, which is what
        # picks up added/removed device entities.
        self.hass.config_entries.async_update_entry(self._config_entry, data=new_data)
        return self.async_abort(reason="changes_saved")
