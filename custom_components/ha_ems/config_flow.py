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
    TextSelector,
    TextSelectorConfig,
)

from .const import (
    CONF_BATTERY_ENTITY_ID,
    CONF_BATTERY_SIZE_KWH,
    CONF_INJECTION_PRICE_KEY,
    CONF_PRICE_ATTRIBUTE,
    CONF_PRICE_ENTITY_ID,
    CONF_PRICE_KEY,
    CONF_ROUNDTRIP_LOSS_PCT,
    CONF_START_KEY,
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


class EMSConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for HA-EMS."""

    VERSION = 1

    def __init__(self) -> None:
        self._user_data: dict[str, Any] = {}

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
                return self.async_create_entry(
                    title="EMS",
                    data={**self._user_data, **user_input},
                )

        return self.async_show_form(
            step_id="battery",
            data_schema=_battery_schema(),
            errors=errors,
        )

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return EMSOptionsFlow(config_entry)


class EMSOptionsFlow(config_entries.OptionsFlow):
    """Handle HA-EMS options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry
        self._user_data: dict[str, Any] = {}

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
                new_data = {**current, **self._user_data, **user_input}
                self.hass.config_entries.async_update_entry(
                    self._config_entry, data=new_data
                )
                coordinator = self.hass.data.get(DOMAIN, {}).get(
                    self._config_entry.entry_id
                )
                if coordinator is not None:
                    await coordinator.async_refresh()
                return self.async_abort(reason="changes_saved")

        return self.async_show_form(
            step_id="battery",
            data_schema=_battery_schema(current),
            errors=errors,
        )
