"""Services for HA-EMS."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr

from .const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
    ACTIONS,
    DOMAIN,
    FIELD_ACTION,
    FIELD_CLEAR_LOCKED,
    FIELD_DEVICE_ID,
    FIELD_DEVICE_NAME,
    FIELD_DEVICES,
    FIELD_END,
    FIELD_LOCK,
    FIELD_LOCKED,
    FIELD_MAX_PRICE,
    FIELD_MAX_WATTAGE,
    FIELD_MODE,
    FIELD_SLOTS,
    FIELD_SLOTS_WANTED,
    FIELD_START,
    FIELD_START_TIME,
    FIELD_STOP_TIME,
    FIELD_TIME,
    FIELD_UNTIL_PCT,
    FIELD_USE_BATTERY_UNTIL_PCT,
    FIELD_USE_BATTERY_WATTAGE,
    FIELD_USE_NET_WATTAGE,
    FIELD_USE_SOLAR,
    FIELD_WATTAGE,
    SERVICE_PLANNING_BULK,
    SERVICE_PLANNING_CAR_CHARGE_SLOT,
    SERVICE_PLANNING_CHARGE,
    SERVICE_PLANNING_CHARGE_CAR,
    SERVICE_PLANNING_CLEAR,
    SERVICE_PLANNING_DEVICE_CLEAR,
    SERVICE_PLANNING_DEVICE_SLOT,
    SERVICE_PLANNING_DISCHARGE,
    SERVICE_PLANNING_IDLE,
    SERVICE_PLANNING_LOCK,
    SERVICE_PLANNING_OPTIMIZE,
    SERVICE_PLANNING_USE_NET,
)
from .coordinator import EMSCoordinator

_LOGGER = logging.getLogger(__name__)

_COMMON: dict[vol.Marker, Any] = {
    vol.Required(FIELD_DEVICE_ID): cv.string,
    vol.Required(FIELD_TIME): cv.string,
    vol.Optional(FIELD_LOCKED, default=False): cv.boolean,
}

_SERVICE_SCHEMAS: dict[str, vol.Schema] = {
    SERVICE_PLANNING_IDLE: vol.Schema(_COMMON),
    SERVICE_PLANNING_CHARGE: vol.Schema(
        {
            **_COMMON,
            vol.Required(FIELD_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_UNTIL_PCT): vol.Coerce(float),
        }
    ),
    SERVICE_PLANNING_DISCHARGE: vol.Schema(
        {
            **_COMMON,
            vol.Required(FIELD_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_UNTIL_PCT): vol.Coerce(float),
        }
    ),
    SERVICE_PLANNING_USE_NET: vol.Schema(
        {
            **_COMMON,
            vol.Optional(FIELD_MAX_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_USE_SOLAR, default=False): cv.boolean,
        }
    ),
    SERVICE_PLANNING_CAR_CHARGE_SLOT: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Required(FIELD_TIME): cv.string,
            vol.Optional(FIELD_LOCKED, default=False): cv.boolean,
            vol.Optional(FIELD_USE_SOLAR, default=True): cv.boolean,
            vol.Optional(FIELD_USE_NET_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_USE_BATTERY_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_USE_BATTERY_UNTIL_PCT): vol.Coerce(float),
        }
    ),
    SERVICE_PLANNING_CHARGE_CAR: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Required(FIELD_START_TIME): cv.string,
            vol.Required(FIELD_STOP_TIME): cv.string,
            vol.Required(FIELD_MAX_PRICE): vol.Coerce(float),
            vol.Required(FIELD_SLOTS_WANTED): vol.All(vol.Coerce(int), vol.Range(min=1)),
            vol.Optional(FIELD_USE_SOLAR, default=True): cv.boolean,
            vol.Optional(FIELD_USE_NET_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_USE_BATTERY_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_USE_BATTERY_UNTIL_PCT): vol.Coerce(float),
        }
    ),
    SERVICE_PLANNING_LOCK: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Required(FIELD_START): cv.string,
            vol.Optional(FIELD_END): cv.string,
            vol.Optional(FIELD_LOCK, default=True): cv.boolean,
        }
    ),
    SERVICE_PLANNING_CLEAR: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Optional(FIELD_CLEAR_LOCKED, default=False): cv.boolean,
        }
    ),
    SERVICE_PLANNING_OPTIMIZE: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
        }
    ),
    SERVICE_PLANNING_DEVICE_SLOT: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Required(FIELD_TIME): cv.string,
            vol.Required(FIELD_DEVICE_NAME): cv.string,
            # Only 'wattage' devices send a power figure; 'modes' devices send a
            # mode; plain on/off devices send neither.
            vol.Optional(FIELD_WATTAGE): vol.Coerce(float),
            vol.Optional(FIELD_MODE): cv.string,
        }
    ),
    SERVICE_PLANNING_DEVICE_CLEAR: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Required(FIELD_TIME): cv.string,
            vol.Required(FIELD_DEVICE_NAME): cv.string,
        }
    ),
    SERVICE_PLANNING_BULK: vol.Schema(
        {
            vol.Required(FIELD_DEVICE_ID): cv.string,
            vol.Required(FIELD_SLOTS): vol.All(
                cv.ensure_list,
                [
                    vol.Schema(
                        {
                            vol.Required(FIELD_TIME): cv.string,
                            vol.Optional(FIELD_ACTION): vol.In(ACTIONS),
                            vol.Optional(FIELD_LOCKED, default=False): cv.boolean,
                            vol.Optional(FIELD_WATTAGE): vol.Coerce(float),
                            vol.Optional(FIELD_UNTIL_PCT): vol.Coerce(float),
                            vol.Optional(FIELD_MAX_WATTAGE): vol.Coerce(float),
                            vol.Optional(FIELD_USE_SOLAR): cv.boolean,
                            vol.Optional(FIELD_USE_NET_WATTAGE): vol.Coerce(float),
                            vol.Optional(FIELD_USE_BATTERY_WATTAGE): vol.Coerce(float),
                            vol.Optional(FIELD_USE_BATTERY_UNTIL_PCT): vol.Coerce(float),
                            # device name -> {wattage?, mode?} to schedule,
                            # or null to unschedule
                            vol.Optional(FIELD_DEVICES): {
                                cv.string: vol.Any(
                                    None,
                                    {
                                        vol.Optional(FIELD_WATTAGE): vol.Coerce(float),
                                        vol.Optional(FIELD_MODE): cv.string,
                                    },
                                )
                            },
                        }
                    )
                ],
            ),
        }
    ),
}


def build_action_config(action: str, data: Mapping[str, Any]) -> dict[str, Any]:
    """Build a slot's action_config from service fields, the same way for the
    single-slot services and for each entry of planning_bulk."""
    if action in (ACTION_CHARGE, ACTION_DISCHARGE):
        if FIELD_WATTAGE not in data:
            raise ServiceValidationError(f"{action} needs a wattage")
        cfg: dict[str, Any] = {"wattage": data[FIELD_WATTAGE]}
        if FIELD_UNTIL_PCT in data:
            cfg["until_pct"] = data[FIELD_UNTIL_PCT]
        return cfg
    if action == ACTION_USE_NET:
        cfg = {"use_solar": data.get(FIELD_USE_SOLAR, False)}
        if FIELD_MAX_WATTAGE in data:
            cfg["max_wattage"] = data[FIELD_MAX_WATTAGE]
        return cfg
    if action == ACTION_CAR_CHARGE:
        cfg = {"use_solar": data.get(FIELD_USE_SOLAR, True)}
        for field, key in (
            (FIELD_USE_NET_WATTAGE, "use_net_wattage"),
            (FIELD_USE_BATTERY_WATTAGE, "use_battery_wattage"),
            (FIELD_USE_BATTERY_UNTIL_PCT, "use_battery_until_pct"),
        ):
            if field in data:
                cfg[key] = data[field]
        return cfg
    return {}


def _get_coordinator_by_device(hass: HomeAssistant, device_id: str) -> EMSCoordinator:
    """Return the coordinator for the given device_id, or raise."""
    device = dr.async_get(hass).async_get(device_id)
    if device is None:
        raise ServiceValidationError(f"EMS device {device_id!r} not found")
    for entry_id in device.config_entries:
        coord = hass.data.get(DOMAIN, {}).get(entry_id)
        if coord is not None:
            return coord
    raise ServiceValidationError(
        f"Device {device_id!r} is not a loaded EMS instance"
    )


async def async_register_services(hass: HomeAssistant) -> None:
    """Register all EMS services (idempotent – skips already-registered ones)."""

    def _make_action_handler(action: str):
        async def handler(call: ServiceCall) -> None:
            coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
            await coord.async_set_planning(
                time_str=call.data[FIELD_TIME],
                action=action,
                locked=call.data.get(FIELD_LOCKED, False),
                action_config=build_action_config(action, call.data),
            )

        return handler

    async def handle_planning_bulk(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_apply_bulk(
            [
                {
                    "time": item[FIELD_TIME],
                    "action": item.get(FIELD_ACTION),
                    "locked": item.get(FIELD_LOCKED, False),
                    "action_config": (
                        build_action_config(item[FIELD_ACTION], item)
                        if FIELD_ACTION in item
                        else None
                    ),
                    "devices": item.get(FIELD_DEVICES) or {},
                }
                for item in call.data[FIELD_SLOTS]
            ]
        )

    async def handle_planning_charge_car(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_charge_car(
            start_time=call.data[FIELD_START_TIME],
            stop_time=call.data[FIELD_STOP_TIME],
            max_price=call.data[FIELD_MAX_PRICE],
            slots_wanted=call.data[FIELD_SLOTS_WANTED],
            use_solar=call.data.get(FIELD_USE_SOLAR, True),
            use_net_wattage=call.data.get(FIELD_USE_NET_WATTAGE),
            use_battery_wattage=call.data.get(FIELD_USE_BATTERY_WATTAGE),
            use_battery_until_pct=call.data.get(FIELD_USE_BATTERY_UNTIL_PCT),
        )

    async def handle_planning_lock(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_lock_range(
            start_str=call.data[FIELD_START],
            end_str=call.data.get(FIELD_END),
            lock=call.data.get(FIELD_LOCK, True),
        )

    async def handle_planning_clear(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_clear(
            clear_locked=call.data.get(FIELD_CLEAR_LOCKED, False),
        )

    async def handle_planning_optimize(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_optimize()

    async def handle_planning_device_slot(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_set_device_slot(
            time_str=call.data[FIELD_TIME],
            device_name=call.data[FIELD_DEVICE_NAME],
            wattage=call.data.get(FIELD_WATTAGE),
            mode=call.data.get(FIELD_MODE),
        )

    async def handle_planning_device_clear(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        await coord.async_clear_device_slot(
            time_str=call.data[FIELD_TIME],
            device_name=call.data[FIELD_DEVICE_NAME],
        )

    _handlers = {
        SERVICE_PLANNING_IDLE: _make_action_handler(ACTION_IDLE),
        SERVICE_PLANNING_CHARGE: _make_action_handler(ACTION_CHARGE),
        SERVICE_PLANNING_DISCHARGE: _make_action_handler(ACTION_DISCHARGE),
        SERVICE_PLANNING_USE_NET: _make_action_handler(ACTION_USE_NET),
        SERVICE_PLANNING_CAR_CHARGE_SLOT: _make_action_handler(ACTION_CAR_CHARGE),
        SERVICE_PLANNING_BULK: handle_planning_bulk,
        SERVICE_PLANNING_CHARGE_CAR: handle_planning_charge_car,
        SERVICE_PLANNING_LOCK: handle_planning_lock,
        SERVICE_PLANNING_CLEAR: handle_planning_clear,
        SERVICE_PLANNING_OPTIMIZE: handle_planning_optimize,
        SERVICE_PLANNING_DEVICE_SLOT: handle_planning_device_slot,
        SERVICE_PLANNING_DEVICE_CLEAR: handle_planning_device_clear,
    }

    for name, handler in _handlers.items():
        if not hass.services.has_service(DOMAIN, name):
            hass.services.async_register(
                DOMAIN, name, handler, schema=_SERVICE_SCHEMAS[name]
            )


async def async_unregister_services(hass: HomeAssistant) -> None:
    """Remove all EMS services when the last entry is unloaded."""
    if hass.data.get(DOMAIN):
        return  # Other instances still active
    for name in _SERVICE_SCHEMAS:
        if hass.services.has_service(DOMAIN, name):
            hass.services.async_remove(DOMAIN, name)
