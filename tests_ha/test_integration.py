"""End-to-end tests inside Home Assistant: Energy dashboard, recorder, services.

A fake solar-forecast integration and four weeks of synthetic meter
statistics stand in for a real installation, so the whole path is covered:
energy prefs -> forecast + statistics -> learned profile -> slots -> optimizer.
"""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from homeassistant.components.energy.data import async_get_manager
from homeassistant.components.recorder.models import StatisticMeanType
from homeassistant.components.recorder.statistics import async_add_external_statistics
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    MockModule,
    mock_integration,
    mock_platform,
)
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)

DOMAIN = "ha_ems"
EVENING_W, BASE_W = 2000.0, 300.0  # learned load: 18:00 vs every other hour
SOLAR_WH = 2000.0  # forecast per hour, 10:00-15:00


def _hour(ts):
    return ts.replace(minute=0, second=0, microsecond=0)


def _load_w(ts) -> float:
    return EVENING_W if dt_util.as_local(ts).hour == 18 else BASE_W


async def _add_meter_history(hass: HomeAssistant, now) -> None:
    """Four weeks of hourly kWh: grid import = house load, no solar or battery."""
    hours = [_hour(now) - timedelta(hours=h) for h in range(28 * 24, 0, -1)]
    series = {
        "fake:grid_import": [_load_w(ts) / 1000 for ts in hours],
        "fake:grid_export": [0.0] * len(hours),
        "fake:solar": [0.0] * len(hours),
        "fake:bat_out": [0.0] * len(hours),
        "fake:bat_in": [0.0] * len(hours),
    }
    for stat_id, values in series.items():
        total = 0.0
        rows = []
        for ts, kwh in zip(hours, values, strict=True):
            total += kwh
            rows.append({"start": dt_util.as_utc(ts), "state": total, "sum": total})
        async_add_external_statistics(
            hass,
            {
                "mean_type": StatisticMeanType.NONE,
                "has_sum": True,
                "name": stat_id,
                "source": "fake",
                "statistic_id": stat_id,
                "unit_class": "energy",
                "unit_of_measurement": "kWh",
            },
            rows,
        )
    await async_wait_recording_done(hass)


async def _add_solar_forecast(hass: HomeAssistant, now) -> MockConfigEntry:
    """A solar-forecast integration with an energy platform, like Forecast.Solar."""
    today = dt_util.start_of_local_day(now)
    wh_hours = {
        (today + timedelta(days=d, hours=h)).isoformat(): SOLAR_WH
        for d in (0, 1)
        for h in range(10, 16)
    }

    async def async_get_solar_forecast(hass, config_entry_id):
        return {"wh_hours": wh_hours}

    mock_integration(hass, MockModule("fake_solar"))
    mock_platform(
        hass,
        "fake_solar.energy",
        SimpleNamespace(async_get_solar_forecast=async_get_solar_forecast),
    )
    entry = MockConfigEntry(domain="fake_solar")
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, "fake_solar", {})
    return entry


async def _configure_energy(hass: HomeAssistant, solar_entry: MockConfigEntry) -> None:
    assert await async_setup_component(hass, "energy", {})
    manager = await async_get_manager(hass)
    await manager.async_update(
        {
            "energy_sources": [
                {
                    "type": "grid",
                    "stat_energy_from": "fake:grid_import",
                    "stat_energy_to": "fake:grid_export",
                    "stat_cost": None,
                    "entity_energy_price": None,
                    "number_energy_price": None,
                    "stat_compensation": None,
                    "entity_energy_price_export": None,
                    "number_energy_price_export": None,
                    "cost_adjustment_day": 0,
                },
                {
                    "type": "solar",
                    "stat_energy_from": "fake:solar",
                    "config_entry_solar_forecast": [solar_entry.entry_id],
                },
                {
                    "type": "battery",
                    "stat_energy_from": "fake:bat_out",
                    "stat_energy_to": "fake:bat_in",
                },
            ]
        }
    )


def _price(ts) -> float:
    hour = dt_util.as_local(ts).hour
    if hour in (2, 3, 4):
        return 5.0
    if 17 <= hour <= 20:
        return 40.0
    return 20.0


async def _setup_ems(hass: HomeAssistant, now) -> MockConfigEntry:
    start = _hour(now)
    hass.states.async_set(
        "sensor.prices",
        "20",
        {
            "data": [
                {"start": ts.isoformat(), "price": _price(ts)}
                for ts in (start + timedelta(hours=h) for h in range(36))
            ]
        },
    )
    hass.states.async_set("sensor.battery_soc", "50")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="EMS",
        data={
            "price_entity_id": "sensor.prices",
            "price_attribute": "data",
            "start_key": "start",
            "price_key": "price",
            "battery_entity_id": "sensor.battery_soc",
            "battery_size_kwh": 10.0,
            "roundtrip_loss_pct": 10.0,
            "devices": [],
        },
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    return entry


def _entity_id(hass: HomeAssistant, entry: MockConfigEntry, suffix: str) -> str:
    entity_id = er.async_get(hass).async_get_entity_id(
        "sensor", DOMAIN, f"{entry.entry_id}_{suffix}"
    )
    assert entity_id, suffix
    return entity_id


def _device_id(hass: HomeAssistant, entry: MockConfigEntry) -> str:
    devices = dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
    assert len(devices) == 1
    return devices[0].id


@pytest.fixture
async def ems(hass: HomeAssistant, freezer):
    # 21:30 local: the 36 h horizon covers the cheap night, a sunny day and
    # the evening peak, in that order.
    freezer.move_to("2026-06-15 21:30:00-07:00")
    now = dt_util.now()
    await _add_meter_history(hass, now)
    solar_entry = await _add_solar_forecast(hass, now)
    await _configure_energy(hass, solar_entry)
    entry = await _setup_ems(hass, now)
    yield entry
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


def _slots(hass: HomeAssistant, entry) -> list[dict]:
    state = hass.states.get(_entity_id(hass, entry, "ems_planning"))
    assert state is not None
    return state.attributes["planning"]


async def test_load_is_learned_from_the_energy_dashboard(hass: HomeAssistant, ems) -> None:
    state = hass.states.get(_entity_id(hass, ems, "ems_predicted_load"))
    assert state.attributes["source"] == "learned"
    assert state.attributes["profile_days"] >= 27

    by_hour = {}
    for slot in _slots(hass, ems):
        by_hour.setdefault(dt_util.as_local(dt_util.parse_datetime(slot["start"])).hour, slot)
    # The bias over the last hours is 1 (actual == profile), so the learned
    # values come through as they are.
    assert by_hour[18]["base_load_w"] == pytest.approx(EVENING_W, rel=0.01)
    assert by_hour[3]["base_load_w"] == pytest.approx(BASE_W, rel=0.01)
    assert by_hour[18]["load_w"] == pytest.approx(EVENING_W, rel=0.01)


async def test_solar_forecast_reaches_the_slots(hass: HomeAssistant, ems) -> None:
    for slot in _slots(hass, ems):
        hour = dt_util.as_local(dt_util.parse_datetime(slot["start"])).hour
        expected = SOLAR_WH if 10 <= hour < 16 else 0.0
        assert slot["solar_w"] == pytest.approx(expected), slot["start"]

    state = hass.states.get(_entity_id(hass, ems, "ems_solar_forecast"))
    assert state.attributes["tomorrow_kwh"] == pytest.approx(6 * SOLAR_WH / 1000)


async def test_optimize_service_plans_every_slot(hass: HomeAssistant, ems) -> None:
    await hass.services.async_call(
        DOMAIN, "planning_optimize", {"device_id": _device_id(hass, ems)}, blocking=True
    )
    await hass.async_block_till_done()
    slots = _slots(hass, ems)
    actions = {slot["action"] for slot in slots}
    assert actions <= {"idle", "charge", "use_net", "discharge"}
    # The forecast never drops below the default 10 % floor.
    predictions = [s["battery_prediction"] for s in slots if s["battery_prediction"] is not None]
    assert predictions and min(predictions) >= 10 - 0.5
    # Grid charging, if any, only happens in the cheap night hours.
    for slot in slots:
        if slot["action"] == "charge":
            assert slot["price"] == 5.0, slot


async def test_bulk_lock_only_keeps_the_action(hass: HomeAssistant, ems) -> None:
    device_id = _device_id(hass, ems)
    first = _slots(hass, ems)[1]
    await hass.services.async_call(
        DOMAIN,
        "planning_bulk",
        {
            "device_id": device_id,
            "slots": [{"time": first["start"], "action": "use_net", "locked": False}],
        },
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "planning_bulk",
        {"device_id": device_id, "slots": [{"time": first["start"], "locked": True}]},
        blocking=True,
    )
    slot = _slots(hass, ems)[1]
    assert slot["locked"] is True
    assert slot["action"] == "use_net"

    # The optimizer leaves the locked slot alone.
    await hass.services.async_call(
        DOMAIN, "planning_optimize", {"device_id": device_id}, blocking=True
    )
    slot = _slots(hass, ems)[1]
    assert (slot["action"], slot["locked"]) == ("use_net", True)
