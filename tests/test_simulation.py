"""Tests for the shared battery SoC step."""

import pytest

from ha_ems.const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
)
from ha_ems.simulation import car_battery_budget_w, step_soc

# 10 kWh battery, 1 h slots: 100 W over a slot is 1 % of SoC.
KWH = 10.0
H = 1.0


@pytest.mark.parametrize(
    ("soc", "action", "cfg", "load_w", "expected"),
    [
        # idle: the house load comes from the battery
        (50, ACTION_IDLE, {}, 500, 45),
        # charge: wattage in, load out
        (50, ACTION_CHARGE, {"wattage": 3000}, 500, 75),
        # discharge: wattage out, load out
        (50, ACTION_DISCHARGE, {"wattage": 1000}, 500, 35),
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
        (50, ACTION_DISCHARGE, 40),  # stops at the floor
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
