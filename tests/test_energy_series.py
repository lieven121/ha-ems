"""Tests for resampling energy series into price slots."""

from datetime import UTC, datetime, timedelta

import pytest

from ha_ems.energy_series import resample_energy_to_slots

T0 = datetime(2026, 6, 1, 10, tzinfo=UTC)


def hours(n, step=1.0):
    return [T0 + timedelta(hours=i * step) for i in range(n)]


def test_hourly_into_quarter_hours():
    periods = {T0: 1000.0, T0 + timedelta(hours=1): 2000.0}
    out = resample_energy_to_slots(periods, hours(8, 0.25), 0.25)
    # 1000 Wh over an hour is 1000 W on average, in every quarter of it.
    assert out == pytest.approx([1000] * 4 + [2000] * 4)


def test_quarter_hours_into_hourly():
    periods = {T0 + timedelta(minutes=15 * i): 250.0 for i in range(4)}
    assert resample_energy_to_slots(periods, hours(1), 1.0) == pytest.approx([1000])


def test_slots_outside_the_forecast_get_zero():
    slots = [T0 - timedelta(hours=1), T0, T0 + timedelta(hours=1)]
    out = resample_energy_to_slots({T0: 500.0}, slots, 1.0)
    assert out == pytest.approx([0, 500, 0])


def test_empty():
    assert resample_energy_to_slots({}, hours(2), 1.0) == [0.0, 0.0]
