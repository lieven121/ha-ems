"""Pure per-slot energy model shared by the forecast and the optimiser.

Kept free of Home Assistant imports so it can be unit tested on its own, and so
the forecast shown on the card and the optimiser's own simulation can never
disagree about what an action does to the battery.

Power flows in one slot (all in W, averaged over the slot)::

    grid = load + car + battery_in - battery_out - solar

``battery_in`` / ``battery_out`` are measured on the AC side; the battery
itself gains ``battery_in * efficiency`` and loses ``battery_out / efficiency``,
where *efficiency* is the one-way efficiency (sqrt of the round trip).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from .conditions import guard, is_met, strip_guard
from .const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_USE_NET,
    COND_SOC,
    COND_SOLAR,
    COND_SURPLUS,
)


def clamp_soc(value: float) -> float:
    return max(0.0, min(100.0, value))


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def one_way_efficiency(roundtrip_loss_pct: float) -> float:
    """Charge (and discharge) efficiency for a given round-trip loss."""
    loss = min(max(roundtrip_loss_pct, 0.0), 99.0) / 100.0
    return math.sqrt(1.0 - loss)


def car_battery_budget_w(action_config: dict[str, Any]) -> float:
    """Battery budget for a car-charge slot, in watts.

    Positive: the car may draw this much from the house battery.
    Negative: charge the house battery at this rate while the car charges,
    which is what you want when the cheap hours have to serve both.
    Zero: grid/solar only, the battery is not involved.
    """
    return _as_float(action_config.get("use_battery_wattage"))


@dataclass(frozen=True, slots=True)
class SlotResult:
    """Outcome of one slot: end SoC and the energy exchanged with the grid."""

    soc: float
    import_kwh: float
    export_kwh: float


def simulate_slot(
    soc: float,
    action: str,
    action_config: dict[str, Any],
    load_w: float,
    slot_hours: float,
    battery_kwh: float,
    *,
    solar_w: float = 0.0,
    default_wattage: float = 0.0,
    max_charge_w: float = 0.0,
    efficiency: float = 1.0,
) -> SlotResult:
    """Simulate one slot, conditions included; see :func:`_simulate_action`.

    A slot with conditions (see :mod:`.conditions`) runs its own action while
    they hold and its fallback while they don't. Solar and surplus conditions
    are judged on the forecast for the whole slot. SoC conditions can change
    within the slot: the slot then switches once, at the moment the battery
    reaches the threshold.
    """
    kwargs = {
        "solar_w": solar_w,
        "default_wattage": default_wattage,
        "max_charge_w": max_charge_w,
        "efficiency": efficiency,
    }

    def run(soc: float, act: str, cfg: dict[str, Any], hours: float) -> SlotResult:
        # A fallback may have conditions of its own (the car-on-surplus rule
        # around a slot that has some), so recurse.
        return simulate_slot(soc, act, cfg, load_w, hours, battery_kwh, **kwargs)

    g = guard(action_config)
    if g is None:
        return _simulate_action(
            soc, action, action_config, load_w, slot_hours, battery_kwh, **kwargs
        )
    conds, other, other_cfg = g
    primary_cfg = strip_guard(action_config)
    forecast = {COND_SOLAR: solar_w, COND_SURPLUS: solar_w - load_w}
    fixed = [c for c in conds if c["on"] != COND_SOC]
    if not all(is_met(c, forecast.get(c["on"])) for c in fixed):
        return run(soc, other, other_cfg, slot_hours)
    soc_conds = [c for c in conds if c["on"] == COND_SOC]
    if not soc_conds:
        return run(soc, action, primary_cfg, slot_hours)

    def holds(value: float) -> bool:
        return all(is_met(c, value) for c in soc_conds)

    on = holds(soc)
    first = run(soc, *((action, primary_cfg) if on else (other, other_cfg)), slot_hours)
    if abs(first.soc - soc) < 1e-9:
        return first
    # The battery moves at a steady rate within a slot: find the first
    # threshold it passes that changes the outcome.
    crossings = sorted(
        (c["value"] - soc) / (first.soc - soc)
        for c in soc_conds
        if min(soc, first.soc) < c["value"] < max(soc, first.soc)
    )
    for frac in crossings:
        past = soc + (first.soc - soc) * min(frac + 1e-6, 1.0)
        if holds(past) == on:
            continue
        mid = soc + (first.soc - soc) * frac
        rest = run(
            mid,
            *((other, other_cfg) if on else (action, primary_cfg)),
            slot_hours * (1 - frac),
        )
        return SlotResult(
            soc=rest.soc,
            import_kwh=first.import_kwh * frac + rest.import_kwh,
            export_kwh=first.export_kwh * frac + rest.export_kwh,
        )
    return first


def _simulate_action(
    soc: float,
    action: str,
    action_config: dict[str, Any],
    load_w: float,
    slot_hours: float,
    battery_kwh: float,
    *,
    solar_w: float = 0.0,
    default_wattage: float = 0.0,
    max_charge_w: float = 0.0,
    efficiency: float = 1.0,
) -> SlotResult:
    """Simulate one slot running one plain action.

    *load_w* is the house load (baseline plus scheduled devices), *solar_w*
    the expected PV output. *default_wattage* is used for charge/discharge
    slots whose config carries no wattage. *max_charge_w* caps the power
    going into the battery (0 = no cap).

    Actions:

    - idle: self-consumption. The battery covers load the sun doesn't, and
      solar surplus charges it; the rest goes to or comes from the grid.
    - charge: ``wattage`` is drawn from the grid until ``until_pct``. The
      battery gets what the house leaves of it, plus any solar surplus; a
      house that needs more than ``wattage`` takes the rest from the battery.
    - discharge: the battery delivers ``wattage``, or the house's need if
      that is larger, down to ``until_pct``. What the house doesn't use is
      exported.
    - use_net: the battery is not discharged; the house runs on solar and
      grid. Solar surplus (solar minus house and devices) charges the
      battery, unless ``use_solar`` is false: then it is exported. A
      ``max_wattage`` below the need makes the battery cover the difference.
    - car_charge: only the configured battery budget moves the battery. The
      car draws ``use_net_wattage``, or the solar surplus if that is more and
      ``use_solar`` is on.

    A charge whose target is already reached, or a discharge already at its
    floor, behaves as idle.
    """
    h = slot_hours
    eta = efficiency if efficiency > 0 else 1.0
    cap_wh = battery_kwh * 1000.0 if battery_kwh > 0 else 0.0
    charge_cap = max_charge_w if max_charge_w > 0 else math.inf
    soc = clamp_soc(soc)
    load_w = max(load_w, 0.0)
    solar_w = max(solar_w, 0.0)

    wattage = _as_float(action_config.get("wattage"), default_wattage)
    until_raw = action_config.get("until_pct")
    until = _as_float(until_raw) if until_raw is not None else None

    if action == ACTION_CHARGE and until is not None and soc >= until:
        action = ""  # target reached: idle
    elif action == ACTION_DISCHARGE and until is not None and soc <= until:
        action = ""  # floor reached: idle

    def max_in_w(upper_pct: float) -> float:
        """Most AC power the battery can take this slot before *upper_pct*."""
        if cap_wh <= 0 or h <= 0:
            return 0.0
        room_wh = max(upper_pct - soc, 0.0) / 100.0 * cap_wh
        return min(room_wh / eta / h, charge_cap)

    def max_out_w(lower_pct: float) -> float:
        """Most AC power the battery can deliver this slot before *lower_pct*."""
        if cap_wh <= 0 or h <= 0:
            return 0.0
        avail_wh = max(soc - lower_pct, 0.0) / 100.0 * cap_wh
        return avail_wh * eta / h

    battery_in = 0.0
    battery_out = 0.0
    car_w = 0.0
    net = load_w - solar_w  # >0: the house needs power, <0: solar surplus

    if action == ACTION_CHARGE:
        upper = until if until is not None else 100.0
        flow = wattage - net  # what the grid target leaves for the battery
        if flow >= 0:
            battery_in = min(flow, max_in_w(upper))
        else:
            battery_out = min(-flow, max_out_w(0.0))
    elif action == ACTION_DISCHARGE:
        lower = until if until is not None else 0.0
        battery_out = min(max(wattage, net, 0.0), max_out_w(lower))
    elif action == ACTION_USE_NET:
        max_w = _as_float(action_config.get("max_wattage"))
        need = max(net, 0.0)
        if 0 < max_w < need:
            battery_out = min(need - max_w, max_out_w(0.0))
        elif net < 0 and action_config.get("use_solar", True) is not False:
            battery_in = min(-net, max_in_w(100.0))
    elif action == ACTION_CAR_CHARGE:
        budget = car_battery_budget_w(action_config)
        if budget > 0:
            battery_out = min(budget, max_out_w(0.0))
        elif budget < 0:
            battery_in = min(-budget, max_in_w(100.0))
        car_w = _as_float(action_config.get("use_net_wattage"))
        if action_config.get("use_solar", True) is not False:
            car_w = max(car_w, -net)
    else:  # idle
        if net > 0:
            battery_out = min(net, max_out_w(0.0))
        elif net < 0:
            battery_in = min(-net, max_in_w(100.0))

    if cap_wh > 0:
        delta_wh = (battery_in * eta - battery_out / eta) * h
        new_soc = clamp_soc(soc + delta_wh / cap_wh * 100.0)
    else:
        new_soc = soc

    grid_w = load_w + car_w + battery_in - battery_out - solar_w
    return SlotResult(
        soc=new_soc,
        import_kwh=max(grid_w, 0.0) * h / 1000.0,
        export_kwh=max(-grid_w, 0.0) * h / 1000.0,
    )


def step_soc(
    soc: float,
    action: str,
    action_config: dict[str, Any],
    load_w: float,
    slot_hours: float,
    battery_kwh: float,
    default_wattage: float = 0.0,
    *,
    solar_w: float = 0.0,
    max_charge_w: float = 0.0,
    efficiency: float = 1.0,
) -> float:
    """Return the SoC (%) at the end of one slot; see :func:`simulate_slot`."""
    if battery_kwh <= 0:
        return soc
    return simulate_slot(
        soc,
        action,
        action_config,
        load_w,
        slot_hours,
        battery_kwh,
        solar_w=solar_w,
        default_wattage=default_wattage,
        max_charge_w=max_charge_w,
        efficiency=efficiency,
    ).soc
