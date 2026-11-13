"""Battery planning optimiser, as a pure function.

No Home Assistant imports: the coordinator gathers the inputs, calls
:func:`optimize`, and writes the result back to its planning store. That keeps
the algorithm unit-testable on its own.

The plan is the cheapest one under the energy model in :mod:`.simulation`,
found by dynamic programming over the battery's state of charge:

- State: SoC on a 0.5 % grid (values in between are interpolated).
- Per slot, every allowed action is tried: idle (self-consumption), use_net
  (no discharge; solar surplus still charges), charge and, if allowed, discharge -- the last two to
  every reachable target SoC, so a slot can also charge just a little.
- Cost of a slot: grid import x price - export x injection price, plus the
  configured cycle cost per kWh the battery delivers. Dropping below
  min_battery is penalised so heavily that it only happens when nothing can
  prevent it.
- Whatever is left in the battery at the end of the horizon is credited at
  what it would cost to put back: the average of the cheapest quarter of
  prices, losses included. So the plan only uses or sells stored energy when
  that beats buying it again, and doesn't empty the battery just because
  tomorrow's prices aren't known yet. Energy beyond what the battery holds
  now is credited at the cheapest price only, so nothing is bought on the
  guess that tomorrow will be dearer.
- Charging is limited to the charge power (the grid peak); discharging may go
  up to the battery's own discharge power. Pushing power out costs a little
  more the harder it is pushed, so similar-priced slots share a discharge
  while a slot that stands out still gets full power.

Locked and car-charge slots keep their action; the optimiser plans around
them.

A battery goal ("at least 80 % by 17:00") is one more thing a plan may not
miss: ending the goal's slot below the target is penalised like dropping
below min_battery, and the DP finds the cheapest way to get there.

The DP evaluates hundreds of thousands of transitions, so :class:`_Model`
computes them with plain arithmetic instead of calling
:func:`.simulation.simulate_slot` each time. It implements the same rules,
and a test holds the two to the same results.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from .const import (
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
)
from .models import EMSSettings
from .simulation import one_way_efficiency, simulate_slot

GRID_STEP_PCT = 0.5
# Most target SoCs tried per slot in one direction; a wider range (a long
# slot, a powerful battery) is covered in coarser steps.
_MAX_TARGETS = 24
_EPS = 1e-9
_TIE = 1e-9

# Preference order when two actions cost the same: leave the battery to its
# own devices rather than steer it.
_ACTION_RANK = {ACTION_IDLE: 0, ACTION_USE_NET: 1, ACTION_CHARGE: 2, ACTION_DISCHARGE: 3}

# Extra cost of discharging at full power, as a fraction of the mean price;
# the marginal cost at full power is twice this. See the module docstring.
_SPREAD_FRACTION = 0.03

# (action, action_config, SoC after the slot, grid cost of the slot,
#  battery cost of the slot: cycle cost and the discharge spread term)
Option = tuple[str, dict[str, Any], float, float, float]


@dataclass
class OptimizerSlot:
    """One future slot, in chronological order."""

    key: str
    price: float
    load_w: float  # house load: baseline/learned plus scheduled devices
    solar_w: float = 0.0  # forecast PV output
    injection_price: float | None = None  # paid per exported kWh; None = 0
    # Locked and car-charge slots are not re-planned; the optimiser only
    # simulates them with their existing action and config.
    fixed_action: str | None = None
    fixed_config: dict[str, Any] = field(default_factory=dict)
    # Length of this slot if it isn't a full one: what is left of the slot
    # that is already running.
    hours: float | None = None

    @property
    def is_fixed(self) -> bool:
        return self.fixed_action is not None


def terminal_price(slots: list[OptimizerSlot]) -> float:
    """Value per kWh of energy still stored at the end of the horizon."""
    prices = sorted(slot.price for slot in slots)
    if not prices:
        return 0.0
    cheapest = prices[: max(1, len(prices) // 4)]
    return max(sum(cheapest) / len(cheapest), 0.0)


class _Model:
    """Fast per-slot transitions for the DP; mirrors simulation.simulate_slot."""

    def __init__(
        self,
        *,
        settings: EMSSettings,
        slot_hours: float,
        battery_kwh: float,
        charge_wattage: float,
        discharge_wattage: float,
        efficiency: float,
        spread_cost: float = 0.0,
    ) -> None:
        self.settings = settings
        self.h = slot_hours
        self.battery_kwh = battery_kwh
        self.cap_wh = battery_kwh * 1000.0
        self.watts = charge_wattage
        self.discharge_watts = discharge_wattage
        self.eta = efficiency
        self.spread_cost = spread_cost

    def hours(self, slot: OptimizerSlot) -> float:
        return self.h if slot.hours is None else slot.hours

    def cost(self, slot: OptimizerSlot, grid_w: float) -> float:
        kwh = grid_w * self.hours(slot) / 1000.0
        if kwh >= 0:
            return kwh * slot.price
        return kwh * (slot.injection_price or 0.0)

    def simulate(self, slot: OptimizerSlot, soc: float, action: str, cfg: dict) -> Option:
        res = simulate_slot(
            soc,
            action,
            cfg,
            slot.load_w,
            self.hours(slot),
            self.battery_kwh,
            solar_w=slot.solar_w,
            default_wattage=self.watts,
            max_charge_w=self.watts,
            efficiency=self.eta,
        )
        price_in = res.import_kwh * slot.price
        price_out = res.export_kwh * (slot.injection_price or 0.0)
        return action, cfg, res.soc, price_in - price_out, 0.0

    def options(self, slot: OptimizerSlot, soc: float) -> list[Option]:
        if slot.is_fixed:
            return [self.simulate(slot, soc, slot.fixed_action, slot.fixed_config)]  # type: ignore[arg-type]

        settings = self.settings
        h = self.hours(slot)
        net = max(slot.load_w, 0.0) - max(slot.solar_w, 0.0)
        if h <= 0:
            return [(ACTION_USE_NET, {"use_solar": True}, soc, self.cost(slot, net), 0.0)]
        # SoC % gained per W of AC charging power over this slot, and lost per
        # W of AC discharge power.
        pct_in = self.eta * h / self.cap_wh * 100.0
        pct_out = h / self.eta / self.cap_wh * 100.0
        cycle = settings.cycle_cost * h / 1000.0  # per W delivered this slot

        # Solar surplus charges the battery in both idle and use_net.
        if net < 0:
            b_in = min(-net, self.watts, (100.0 - soc) / pct_in)
            solar_end, solar_grid = soc + b_in * pct_in, net + b_in
        else:
            solar_end, solar_grid = soc, net
        out: list[Option] = [
            (ACTION_USE_NET, {"use_solar": True}, solar_end, self.cost(slot, solar_grid), 0.0)
        ]

        if settings.allow_idle_for_optimize:
            if net > 0:
                b_out = min(net, soc / pct_out)
                end, grid_w, wear = soc - b_out * pct_out, net - b_out, b_out * cycle
            else:
                end, grid_w, wear = solar_end, solar_grid, 0.0
            out.append((ACTION_IDLE, {}, end, self.cost(slot, grid_w), wear))

        max_soc, min_soc = settings.max_battery, settings.min_battery
        if soc < max_soc - _EPS:
            # The grid delivers self.watts; the battery gets what the house
            # leaves of it.
            b_max = min(self.watts - net, self.watts, (max_soc - soc) / pct_in)
            for target in _targets(soc, soc + max(b_max, 0.0) * pct_in):
                b_in = (target - soc) / pct_in
                cfg = {"wattage": self.watts, "until_pct": target}
                out.append((ACTION_CHARGE, cfg, target, self.cost(slot, net + b_in), 0.0))

        if settings.allow_discharge and soc > min_soc + _EPS:
            full = max(self.discharge_watts, net)
            b_max = min(full, (soc - min_soc) / pct_out)
            for target in _targets(soc, soc - b_max * pct_out):
                b_out = (soc - target) / pct_out
                # Steady power over the whole slot rather than a short burst.
                cfg = {"wattage": math.ceil(b_out), "until_pct": target}
                wear = b_out * cycle + self.spread_cost * (b_out / full) * b_out * h / 1000.0
                out.append((ACTION_DISCHARGE, cfg, target, self.cost(slot, net - b_out), wear))
        return out


def _targets(soc: float, limit: float) -> list[float]:
    """Grid points strictly between *soc* and *limit*, plus *limit* itself."""
    if abs(limit - soc) < 1e-6:
        return []
    step = GRID_STEP_PCT * max(1, math.ceil(abs(limit - soc) / GRID_STEP_PCT / _MAX_TARGETS))
    if limit > soc:
        k = math.floor(soc / step + 1e-9) + 1
        points = []
        while k * step < limit - 1e-6:
            points.append(k * step)
            k += 1
    else:
        k = math.ceil(soc / step - 1e-9) - 1
        points = []
        while k * step > limit + 1e-6:
            points.append(k * step)
            k -= 1
    points.append(limit)
    return points


def optimize(
    slots: list[OptimizerSlot],
    *,
    settings: EMSSettings,
    current_soc: float,
    slot_hours: float,
    battery_kwh: float,
    charge_wattage: float,
    roundtrip_loss_pct: float,
    discharge_wattage: float | None = None,
    soc_goal: tuple[str, float] | None = None,
) -> dict[str, tuple[str, dict[str, Any]]]:
    """Plan every non-fixed slot; return {key: (action, action_config)}.

    *charge_wattage* is both the grid power a charge slot draws and the cap on
    power into the battery (solar included). *discharge_wattage* is the most
    the battery may deliver in a discharge slot; it defaults to the charge
    power. *soc_goal* is ``(slot key, SoC %)``: the battery must hold at least
    that much at the end of that slot (max_battery at most).
    """
    if not slots:
        return {}
    if battery_kwh <= 0 or charge_wattage <= 0:
        # Without a battery there is nothing to steer: run on solar and grid.
        return {
            slot.key: (ACTION_USE_NET, {"use_solar": True}) for slot in slots if not slot.is_fixed
        }

    eta = one_way_efficiency(roundtrip_loss_pct)
    mean_price = sum(abs(s.price) for s in slots) / len(slots)
    model = _Model(
        settings=settings,
        slot_hours=slot_hours,
        battery_kwh=battery_kwh,
        charge_wattage=charge_wattage,
        discharge_wattage=discharge_wattage or charge_wattage,
        efficiency=eta,
        spread_cost=_SPREAD_FRACTION * mean_price,
    )
    min_soc = settings.min_battery
    n = int(round(100 / GRID_STEP_PCT)) + 1
    grid = [i * GRID_STEP_PCT for i in range(n)]

    # Breaching min_battery must never be worth it: one % below costs more
    # than the dearest slot's whole battery could ever save.
    max_price = max(abs(s.price) + abs(s.injection_price or 0.0) for s in slots)
    penalty_per_pct = (max_price + 1.0) * battery_kwh * 100

    goal_key, goal_soc = soc_goal if soc_goal else (None, 0.0)
    goal_soc = min(goal_soc, settings.max_battery)

    def total(option: Option, start_soc: float, nxt: list[float], goal: float = 0.0) -> float:
        _, _, end_soc, cost, wear = option
        cost += wear
        if end_soc < goal - 1e-6:
            cost += penalty_per_pct * (goal - end_soc)
        if end_soc < min_soc - 1e-6 and end_soc < start_soc + 1e-6:
            # Only penalise ending below the floor when the slot made it worse
            # (or kept it there): a slot that climbs back up is the fix.
            cost += penalty_per_pct * (min_soc - end_soc)
        pos = min(max(end_soc / GRID_STEP_PCT, 0.0), n - 1.0)
        lo = min(int(pos), n - 2)
        frac = pos - lo
        return cost + nxt[lo] * (1 - frac) + nxt[lo + 1] * frac

    # Backward pass: values[t][i] = cheapest cost from slot t at SoC grid[i].
    tp = terminal_price(slots)
    floor_price = min(max(min(s.price for s in slots), 0.0), tp)
    values: list[list[float]] = [
        [
            -(min(soc, current_soc) * tp + max(soc - current_soc, 0.0) * floor_price)
            / 100
            * battery_kwh
            / eta
            for soc in grid
        ]
    ]
    for slot in reversed(slots):
        nxt = values[-1]
        goal = goal_soc if slot.key == goal_key else 0.0
        values.append(
            [min(total(opt, soc, nxt, goal) for opt in model.options(slot, soc)) for soc in grid]
        )
    values.reverse()  # values[t] belongs to slots[t]; values[-1] is terminal

    # Forward pass from the actual SoC, picking the best action per slot.
    plan: dict[str, tuple[str, dict[str, Any]]] = {}
    soc = current_soc
    for t, slot in enumerate(slots):
        best: tuple[float, int, Option] | None = None
        goal = goal_soc if slot.key == goal_key else 0.0
        for opt in model.options(slot, soc):
            score = total(opt, soc, values[t + 1], goal)
            rank = _ACTION_RANK.get(opt[0], 9)
            if (
                best is None
                or score < best[0] - _TIE
                or (abs(score - best[0]) <= _TIE and rank < best[1])
            ):
                best = (score, rank, opt)
        assert best is not None
        action, cfg, end_soc, _, _ = best[2]
        if not slot.is_fixed:
            if action in (ACTION_CHARGE, ACTION_DISCHARGE):
                cfg = {"wattage": cfg["wattage"], "until_pct": round(end_soc, 1)}
            plan[slot.key] = (action, dict(cfg))
        soc = end_soc
    return plan
