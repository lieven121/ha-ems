"""Tests for learning the house-load profile."""

from datetime import datetime, timedelta

import pytest

from ha_ems.load_profile import (
    LoadProfile,
    bias_factor,
    build_profile,
    house_load_wh,
    predict_load_w,
)

# A Monday at midnight, naive local time is fine for the pure functions.
MON = datetime(2026, 6, 1)
NOW = MON + timedelta(weeks=4)  # also a Monday


def test_house_load_from_meters():
    t = MON
    load = house_load_wh(
        imports=[{t: 0.5}],
        exports=[{t: 1.0}],
        solar=[{t: 2.0}],
        battery_out=[{t: 0.2}],
        battery_in=[{t: 0.4}],
    )
    # 0.5 - 1.0 + 2.0 + 0.2 - 0.4 = 1.3 kWh
    assert load == {t: pytest.approx(1300)}


def test_house_load_skips_hours_missing_a_meter_and_clamps():
    a, b = MON, MON + timedelta(hours=1)
    load = house_load_wh([{a: 0.1, b: 0.5}], [{a: 0.5, b: 0.0}], [{b: 0.2}], [], [])
    assert load == {b: pytest.approx(700)}  # hour a has no solar reading
    assert house_load_wh([{a: 0.0}], [{a: 1.0}], [], [], []) == {a: 0.0}


def test_house_load_needs_a_grid_meter():
    assert house_load_wh([], [], [{MON: 1.0}], [], []) == {}


def week_of(value_by_hour, start):
    return {start + timedelta(hours=h): value_by_hour(h) for h in range(24 * 7)}


def test_profile_per_weekday_hour():
    history = week_of(lambda h: 1000.0 if h % 24 == 18 else 200.0, MON)
    profile = build_profile(history, NOW)
    assert profile.expected_w(NOW + timedelta(hours=18), 0) == pytest.approx(1000)
    assert profile.expected_w(NOW + timedelta(hours=3), 0) == pytest.approx(200)
    assert profile.days == 7


def test_recent_weeks_weigh_more():
    old = week_of(lambda h: 100.0, MON)
    new = week_of(lambda h: 200.0, MON + timedelta(weeks=3))
    profile = build_profile({**old, **new}, NOW)
    # weights: 3 weeks ago 0.75**3 = 0.42, last week 1
    expected = (100 * 0.75**3 + 200) / (0.75**3 + 1)
    assert profile.expected_w(NOW, 0) == pytest.approx(expected, abs=0.1)


def test_outliers_are_trimmed():
    history = {MON + timedelta(weeks=w): 300.0 for w in range(3)}
    history[MON + timedelta(weeks=3)] = 5000.0  # one-off: sauna, guests, ...
    assert build_profile(history, NOW).expected_w(NOW, 0) == pytest.approx(300)


def test_fallback_chain():
    # Only Saturday data: Sunday falls back to "weekend", Monday to the default.
    sat = MON + timedelta(days=5, hours=12)
    profile = build_profile({sat: 800.0}, NOW)
    assert profile.expected_w(sat + timedelta(days=1), 99) == 800
    assert profile.expected_w(MON + timedelta(hours=12), 99) == 99
    assert LoadProfile().expected_w(MON, 123) == 123


def test_store_round_trip():
    profile = build_profile(week_of(lambda h: float(h), MON), NOW)
    again = LoadProfile.from_dict(profile.as_dict())
    assert again == profile
    assert LoadProfile.from_dict(None).empty


def test_bias_and_fade():
    profile = build_profile(week_of(lambda h: 500.0, MON), NOW)
    recent = {NOW - timedelta(hours=h): 1000.0 for h in (1, 2, 3)}
    bias = bias_factor(profile, recent, NOW, 0)
    assert bias == pytest.approx(2.0)  # twice the usual, at the clamp
    starts = [NOW, NOW + timedelta(hours=3), NOW + timedelta(hours=6)]
    assert predict_load_w(profile, starts, NOW, 0, bias) == pytest.approx([1000, 750, 500])


def test_bias_is_clamped_and_neutral_without_data():
    profile = build_profile(week_of(lambda h: 500.0, MON), NOW)
    assert bias_factor(profile, {}, NOW, 0) == 1.0
    low = {NOW - timedelta(hours=2): 10.0}
    assert bias_factor(profile, low, NOW, 0) == 0.5
