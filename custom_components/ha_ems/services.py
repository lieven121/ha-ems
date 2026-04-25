"""Services for HA-EMS."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr

from .const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
    DOMAIN,
    FIELD_CAR_USE_SOLAR,
    FIELD_CLEAR_LOCKED,
    FIELD_DEVICE_ID,
    FIELD_END,
    FIELD_LOCK,
    FIELD_LOCKED,
    FIELD_MAX_PRICE,
    FIELD_MAX_WATTAGE,
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
    SERVICE_PLANNING_CAR_CHARGE_SLOT,
    SERVICE_PLANNING_CHARGE,
    SERVICE_PLANNING_CHARGE_CAR,
    SERVICE_PLANNING_CLEAR,
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
}


def _get_coordinators(hass: HomeAssistant) -> list[EMSCoordinator]:
    """Return all registered EMS coordinators."""
    entries = hass.data.get(DOMAIN, {})
    if not entries:
        _LOGGER.error("No EMS coordinator found – is the integration loaded?")
    return list(entries.values())


def _get_coordinator_by_device(hass: HomeAssistant, device_id: str) -> "EMSCoordinator | None":
    """Return the coordinator for the given device_id."""
    device_reg = dr.async_get(hass)
    device = device_reg.async_get(device_id)
    if device is None:
        _LOGGER.error("EMS: device %s not found", device_id)
        return None
    for entry_id in device.config_entries:
        coord = hass.data.get(DOMAIN, {}).get(entry_id)
        if coord is not None:
            return coord
    _LOGGER.error("EMS: no coordinator found for device %s", device_id)
    return None


async def async_register_services(hass: HomeAssistant) -> None:
    """Register all EMS services (idempotent – skips already-registered ones)."""

    async def handle_planning_idle(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        await coord.async_set_planning(
            time_str=call.data[FIELD_TIME],
            action=ACTION_IDLE,
            locked=call.data.get(FIELD_LOCKED, False),
            action_config={},
        )

    async def handle_planning_charge(call: ServiceCall) -> None:
        action_config: dict[str, Any] = {"wattage": call.data[FIELD_WATTAGE]}
        if FIELD_UNTIL_PCT in call.data:
            action_config["until_pct"] = call.data[FIELD_UNTIL_PCT]
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        await coord.async_set_planning(
            time_str=call.data[FIELD_TIME],
            action=ACTION_CHARGE,
            locked=call.data.get(FIELD_LOCKED, False),
            action_config=action_config,
        )

    async def handle_planning_discharge(call: ServiceCall) -> None:
        action_config: dict[str, Any] = {"wattage": call.data[FIELD_WATTAGE]}
        if FIELD_UNTIL_PCT in call.data:
            action_config["until_pct"] = call.data[FIELD_UNTIL_PCT]
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        await coord.async_set_planning(
            time_str=call.data[FIELD_TIME],
            action=ACTION_DISCHARGE,
            locked=call.data.get(FIELD_LOCKED, False),
            action_config=action_config,
        )

    async def handle_planning_use_net(call: ServiceCall) -> None:
        action_config: dict[str, Any] = {
            "use_solar": call.data.get(FIELD_USE_SOLAR, False),
        }
        if FIELD_MAX_WATTAGE in call.data:
            action_config["max_wattage"] = call.data[FIELD_MAX_WATTAGE]
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        await coord.async_set_planning(
            time_str=call.data[FIELD_TIME],
            action=ACTION_USE_NET,
            locked=call.data.get(FIELD_LOCKED, False),
            action_config=action_config,
        )

    async def handle_planning_car_charge_slot(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        action_config: dict[str, Any] = {
            "use_solar": call.data.get(FIELD_USE_SOLAR, True),
        }
        if FIELD_USE_NET_WATTAGE in call.data:
            action_config["use_net_wattage"] = call.data[FIELD_USE_NET_WATTAGE]
        if FIELD_USE_BATTERY_WATTAGE in call.data:
            action_config["use_battery_wattage"] = call.data[FIELD_USE_BATTERY_WATTAGE]
        if FIELD_USE_BATTERY_UNTIL_PCT in call.data:
            action_config["use_battery_until_pct"] = call.data[FIELD_USE_BATTERY_UNTIL_PCT]
        await coord.async_set_planning(
            time_str=call.data[FIELD_TIME],
            action=ACTION_CAR_CHARGE,
            locked=call.data.get(FIELD_LOCKED, False),
            action_config=action_config,
        )

    async def handle_planning_charge_car(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
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
        if coord is None:
            return
        await coord.async_lock_range(
            start_str=call.data[FIELD_START],
            end_str=call.data.get(FIELD_END),
            lock=call.data.get(FIELD_LOCK, True),
        )

    async def handle_planning_clear(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        await coord.async_clear(
            clear_locked=call.data.get(FIELD_CLEAR_LOCKED, False),
        )

    async def handle_planning_optimize(call: ServiceCall) -> None:
        coord = _get_coordinator_by_device(hass, call.data[FIELD_DEVICE_ID])
        if coord is None:
            return
        await coord.async_optimize()

    _handlers = {
        SERVICE_PLANNING_IDLE: handle_planning_idle,
        SERVICE_PLANNING_CHARGE: handle_planning_charge,
        SERVICE_PLANNING_DISCHARGE: handle_planning_discharge,
        SERVICE_PLANNING_USE_NET: handle_planning_use_net,
        SERVICE_PLANNING_CAR_CHARGE_SLOT: handle_planning_car_charge_slot,
        SERVICE_PLANNING_CHARGE_CAR: handle_planning_charge_car,
        SERVICE_PLANNING_LOCK: handle_planning_lock,
        SERVICE_PLANNING_CLEAR: handle_planning_clear,
        SERVICE_PLANNING_OPTIMIZE: handle_planning_optimize,
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
