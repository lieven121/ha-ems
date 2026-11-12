"""Tests for the shared battery SoC step."""

import pytest

from ha_ems.const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
)
from ha_ems.simulation import (
    car_battery_budget_w,
    one_way_efficiency,
    simulate_slot,
    step_soc,
)

# 10 kWh battery, 1 h slots: 100 W over a slot is 1 % of SoC.
KWH = 10.0
H = 1.0


@pytest.mark.parametrize(
    ("soc", "action", "cfg", "load_w", "expected"),
    [
        # idle: the house load comes from the battery
        (50, ACTION_IDLE, {}, 500, 45),
        # charge: wattage from the grid; the battery gets what the house leaves
        (50, ACTION_CHARGE, {"wattage": 3000}, 500, 75),
        # discharge: wattage out, the house's share included
        (50, ACTION_DISCHARGE, {"wattage": 1000}, 500, 40),
        # ...or the whole house load, if that is more
        (50, ACTION_DISCHARGE, {"wattage": 300}, 500, 45),
        # use_net: battery untouched...
        (50, ACTION_USE_NET, {}, 500, 50),
        # ...unless the grid draw is capped below the load
        (50, ACTION_USE_NET, {"max_wattage": 200}, 500, 47),
        # car charge: only the battery budget moves the SoC
        (50, ACTION_CAR_CHARGE, {}, 500, 50),
        (50, ACTION_CAR_CHARGE, {"use_battery_wattage": 1000}, 500, 40),
        (50, ACTION_CAR_CHARGE, {"use_battery_wattage": -1000}, 500, 60),
    ],
)
def test_actions(soc, action, cfg, load_w, expected):
    assert step_soc(soc, action, cfg, load_w, H, KWH) == pytest.approx(expected)


def test_default_wattage_used_when_config_has_none():
    assert step_soc(50, ACTION_CHARGE, {}, 500, H, KWH, 2000) == pytest.approx(65)


@pytest.mark.parametrize(
    ("soc", "action", "expected"),
    [
        (50, ACTION_CHARGE, 60),  # stops at the target
        (70, ACTION_CHARGE, 65),  # already past it: behaves as idle
        (45, ACTION_DISCHARGE, 40),  # stops at the floor
        (30, ACTION_DISCHARGE, 25),  # already below it: behaves as idle
    ],
)
def test_until_pct(soc, action, expected):
    until = 60 if action == ACTION_CHARGE else 40
    cfg = {"wattage": 3000, "until_pct": until}
    assert step_soc(soc, action, cfg, 500, H, KWH) == pytest.approx(expected)


def test_clamped_to_0_100():
    assert step_soc(95, ACTION_CHARGE, {"wattage": 5000}, 0, H, KWH) == 100
    assert step_soc(5, ACTION_IDLE, {}, 5000, H, KWH) == 0


def test_no_battery_leaves_soc_unchanged():
    assert step_soc(50, ACTION_IDLE, {}, 500, H, 0) == 50


def test_slot_length_scales_the_change():
    # A 15-minute slot moves a quarter as much as an hour.
    assert step_soc(50, ACTION_IDLE, {}, 400, 0.25, KWH) == pytest.approx(49)


@pytest.mark.parametrize(
    ("cfg", "expected"),
    [({}, 0.0), ({"use_battery_wattage": "1500"}, 1500.0), ({"use_battery_wattage": "x"}, 0.0)],
)
def test_car_battery_budget(cfg, expected):
    assert car_battery_budget_w(cfg) == expected


# ---- solar, losses and grid flows -------------------------------------------


def sim(soc, action, cfg=None, load=500, solar=0, **kw):
    return simulate_slot(soc, action, cfg or {}, load, H, KWH, solar_w=solar, **kw)


def test_idle_solar_surplus_charges_the_battery():
    r = sim(50, ACTION_IDLE, load=500, solar=2500)
    assert r.soc == pytest.approx(70)  # 2000 W surplus = 20 %
    assert r.import_kwh == 0 and r.export_kwh == 0


def test_idle_surplus_beyond_charge_cap_is_exported():
    r = sim(50, ACTION_IDLE, load=500, solar=2500, max_charge_w=1500)
    assert r.soc == pytest.approx(65)
    assert r.export_kwh == pytest.approx(0.5)


def test_idle_surplus_exported_once_full():
    r = sim(95, ACTION_IDLE, load=500, solar=2500)
    assert r.soc == 100
    assert r.export_kwh == pytest.approx(1.5)


def test_idle_partial_solar_reduces_battery_drain():
    r = sim(50, ACTION_IDLE, load=1000, solar=400)
    assert r.soc == pytest.approx(44)
    assert r.import_kwh == 0


def test_idle_empty_battery_imports_the_rest():
    r = sim(2, ACTION_IDLE, load=1000)
    assert r.soc == 0
    assert r.import_kwh == pytest.approx(0.8)


def test_use_net_charges_from_solar_surplus():
    # 2000 W solar - 500 W house = 1500 W into the battery, nothing exported.
    r = sim(50, ACTION_USE_NET, load=500, solar=2000)
    assert r.soc == pytest.approx(65)
    assert r.export_kwh == pytest.approx(0)
    assert r.import_kwh == pytest.approx(0)


def test_use_net_without_solar_flag_holds_battery_and_exports_surplus():
    r = sim(50, ACTION_USE_NET, {"use_solar": False}, load=500, solar=2000)
    assert r.soc == 50
    assert r.export_kwh == pytest.approx(1.5)
    r = sim(50, ACTION_USE_NET, load=1500, solar=500)
    assert r.import_kwh == pytest.approx(1.0)


def test_charge_wattage_is_the_grid_draw():
    r = sim(50, ACTION_CHARGE, {"wattage": 2000}, load=500)
    assert r.soc == pytest.approx(65)
    assert r.import_kwh == pytest.approx(2.0)


def test_charge_adds_solar_surplus_to_the_grid_draw():
    r = sim(50, ACTION_CHARGE, {"wattage": 1000}, load=500, solar=3500)
    assert r.soc == pytest.approx(90)
    assert r.import_kwh == pytest.approx(1.0) and r.export_kwh == 0


def test_charge_with_load_above_the_grid_draw_drains_the_battery():
    r = sim(50, ACTION_CHARGE, {"wattage": 1000}, load=1500)
    assert r.soc == pytest.approx(45)
    assert r.import_kwh == pytest.approx(1.0)


def test_charge_stops_exactly_at_target():
    r = sim(50, ACTION_CHARGE, {"wattage": 3000, "until_pct": 60}, load=500)
    assert r.soc == pytest.approx(60)
    assert r.import_kwh == pytest.approx(1.5)  # 1000 W charge + 500 W load
    r = sim(50, ACTION_CHARGE, {"wattage": 3000, "until_pct": 90}, load=500)
    assert r.soc == pytest.approx(75)
    assert r.import_kwh == pytest.approx(3.0)


def test_discharge_exports():
    r = sim(80, ACTION_DISCHARGE, {"wattage": 2000}, load=500)
    assert r.soc == pytest.approx(60)
    assert r.export_kwh == pytest.approx(1.5)


def test_efficiency_applies_both_ways():
    eta = one_way_efficiency(19)  # sqrt(0.81) = 0.9
    assert eta == pytest.approx(0.9)
    charged = sim(50, ACTION_CHARGE, {"wattage": 1000}, load=0, efficiency=eta)
    assert charged.soc == pytest.approx(59)
    assert sim(50, ACTION_IDLE, load=900, efficiency=eta).soc == pytest.approx(40)
