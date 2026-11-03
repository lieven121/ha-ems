"""Pure battery state-of-charge model shared by the forecast and the optimiser.

Kept free of Home Assistant imports so it can be unit tested on its own, and so
the forecast shown on the card and the optimiser's own simulation can never
disagree about what an action does to the battery.
"""

from __future__ import annotations

from typing import Any

from .const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_USE_NET,
)


def clamp_soc(value: float) -> float:
    return max(0.0, min(100.0, value))


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def car_battery_budget_w(action_config: dict[str, Any]) -> float:
    """Battery budget for a car-charge slot, in watts.

    Positive: the car may draw this much from the house battery.
    Negative: charge the house battery at this rate while the car charges,
    which is what you want when the cheap hours have to serve both.
    Zero: grid/solar only, the battery is not involved.
    """
    return _as_float(action_config.get("use_battery_wattage"))


def step_soc(
    soc: float,
    action: str,
    action_config: dict[str, Any],
    load_w: float,
    slot_hours: float,
    battery_kwh: float,
    default_wattage: float = 0.0,
) -> float:
    """Return the SoC (%) at the end of one slot.

    *load_w* is the house load during the slot (baseline plus scheduled
    devices). *default_wattage* is used for charge/discharge slots whose config
    carries no explicit wattage.
    """
    if battery_kwh <= 0:
        return soc

    def pct(watts: float) -> float:
        """Convert a sustained draw over one slot into a SoC percentage."""
        return watts * slot_hours / (battery_kwh * 1000) * 100

    wattage = _as_float(action_config.get("wattage"), default_wattage)

    if action == ACTION_CHARGE:
        return clamp_soc(soc + pct(wattage) - pct(load_w))

    if action == ACTION_DISCHARGE:
        return clamp_soc(soc - pct(wattage) - pct(load_w))

    if action == ACTION_USE_NET:
        # Using grid directly — but if max_wattage is capped below the slot
        # load, the deficit must come from the battery.
        max_w = _as_float(action_config.get("max_wattage"))
        if 0 < max_w < load_w:
            return clamp_soc(soc - pct(load_w - max_w))
        return soc

    if action == ACTION_CAR_CHARGE:
        # The house load is served from grid/solar; only the configured
        # battery budget moves the SoC.
        return clamp_soc(soc - pct(car_battery_budget_w(action_config)))

    # idle: home consumption comes from the battery
    return clamp_soc(soc - pct(load_w))
