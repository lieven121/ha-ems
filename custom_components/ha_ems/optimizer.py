"""Battery planning optimiser, as a pure function.

No Home Assistant imports: the coordinator gathers the inputs, calls
:func:`optimize`, and writes the result back to its planning store. That keeps
the algorithm unit-testable on its own.

The plan is the cheapest one under the energy model in :mod:`.simulation`,
found by dynamic programming over the battery's state of charge:

- State: SoC on a 0.5 % grid (values in between are interpolated).
- Per slot, every allowed action is tried: idle (self-consumption), use_net
  (hold the battery), charge and, if allowed, discharge -- the last two to
  every reachable target SoC, so a slot can also charge just a little.
- Cost of a slot: grid import x price - export x injection price. Dropping
  below min_battery is penalised so heavily that it only happens when nothing
  can prevent it.
- Whatever is left in the battery at the end of the horizon is credited at
  the average of the cheapest quarter of prices, so the plan doesn't empty
  the battery just because tomorrow's prices aren't known yet.

Locked and car-charge slots keep their action; the optimiser plans around
them.

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
_EPS = 1e-9
_TIE = 1e-9

# Preference order when two actions cost the same: leave the battery to its
# own devices rather than steer it.
_ACTION_RANK = {ACTION_IDLE: 0, ACTION_USE_NET: 1, ACTION_CHARGE: 2, ACTION_DISCHARGE: 3}

# (action, action_config, SoC after the slot, grid cost of the slot)
Option = tuple[str, dict[str, Any], float, float]


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
        efficiency: float,
    ) -> None:
        self.settings = settings
        self.h = slot_hours
        self.battery_kwh = battery_kwh
        self.cap_wh = battery_kwh * 1000.0
        self.watts = charge_wattage
        self.eta = efficiency
        # SoC % gained per W of AC charging power over one slot, and lost per
        # W of AC discharge power.
        self.pct_in = efficiency * slot_hours / self.cap_wh * 100.0
        self.pct_out = slot_hours / efficiency / self.cap_wh * 100.0

    def cost(self, slot: OptimizerSlot, grid_w: float) -> float:
        kwh = grid_w * self.h / 1000.0
        if kwh >= 0:
            return kwh * slot.price
        return kwh * (slot.injection_price or 0.0)

    def simulate(self, slot: OptimizerSlot, soc: float, action: str, cfg: dict) -> Option:
        res = simulate_slot(
            soc,
            action,
            cfg,
            slot.load_w,
            self.h,
            self.battery_kwh,
            solar_w=slot.solar_w,
            default_wattage=self.watts,
            max_charge_w=self.watts,
            efficiency=self.eta,
        )
        price_in = res.import_kwh * slot.price
        price_out = res.export_kwh * (slot.injection_price or 0.0)
        return action, cfg, res.soc, price_in - price_out

    def options(self, slot: OptimizerSlot, soc: float) -> list[Option]:
        if slot.is_fixed:
            return [self.simulate(slot, soc, slot.fixed_action, slot.fixed_config)]  # type: ignore[arg-type]

        settings = self.settings
        net = max(slot.load_w, 0.0) - max(slot.solar_w, 0.0)
        out: list[Option] = [(ACTION_USE_NET, {"use_solar": True}, soc, self.cost(slot, net))]

        if settings.allow_idle_for_optimize:
            if net > 0:
                b_out = min(net, soc / self.pct_out)
                end, grid_w = soc - b_out * self.pct_out, net - b_out
            else:
                b_in = min(-net, self.watts, (100.0 - soc) / self.pct_in)
                end, grid_w = soc + b_in * self.pct_in, net + b_in
            out.append((ACTION_IDLE, {}, end, self.cost(slot, grid_w)))

        max_soc, min_soc = settings.max_battery, settings.min_battery
        if soc < max_soc - _EPS:
            b_max = min(max(self.watts, -net), self.watts, (max_soc - soc) / self.pct_in)
            for target in _targets(soc, soc + b_max * self.pct_in):
                b_in = (target - soc) / self.pct_in
                cfg = {"wattage": self.watts, "until_pct": target}
                out.append((ACTION_CHARGE, cfg, target, self.cost(slot, net + b_in)))

        if settings.allow_discharge and soc > min_soc + _EPS:
            b_max = min(self.watts + max(net, 0.0), (soc - min_soc) / self.pct_out)
            for target in _targets(soc, soc - b_max * self.pct_out):
                b_out = (soc - target) / self.pct_out
                cfg = {"wattage": self.watts, "until_pct": target}
                out.append((ACTION_DISCHARGE, cfg, target, self.cost(slot, net - b_out)))
        return out


def _targets(soc: float, limit: float) -> list[float]:
    """Grid points strictly between *soc* and *limit*, plus *limit* itself."""
    if abs(limit - soc) < 1e-6:
        return []
    step = GRID_STEP_PCT
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
) -> dict[str, tuple[str, dict[str, Any]]]:
    """Plan every non-fixed slot; return {key: (action, action_config)}.

    *charge_wattage* is both the grid charge/discharge power the plan uses and
    the cap on power into the battery (solar included).
    """
    if not slots:
        return {}
    if battery_kwh <= 0 or charge_wattage <= 0:
        # Without a battery there is nothing to steer: run on solar and grid.
        return {
            slot.key: (ACTION_USE_NET, {"use_solar": True}) for slot in slots if not slot.is_fixed
        }

    eta = one_way_efficiency(roundtrip_loss_pct)
    model = _Model(
        settings=settings,
        slot_hours=slot_hours,
        battery_kwh=battery_kwh,
        charge_wattage=charge_wattage,
        efficiency=eta,
    )
    min_soc = settings.min_battery
    n = int(round(100 / GRID_STEP_PCT)) + 1
    grid = [i * GRID_STEP_PCT for i in range(n)]

    # Breaching min_battery must never be worth it: one % below costs more
    # than the dearest slot's whole battery could ever save.
    max_price = max(abs(s.price) + abs(s.injection_price or 0.0) for s in slots)
    penalty_per_pct = (max_price + 1.0) * battery_kwh * 100

    def total(option: Option, start_soc: float, nxt: list[float]) -> float:
        _, _, end_soc, cost = option
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
    values: list[list[float]] = [[-(soc / 100 * battery_kwh) * eta * tp for soc in grid]]
    for slot in reversed(slots):
        nxt = values[-1]
        values.append(
            [min(total(opt, soc, nxt) for opt in model.options(slot, soc)) for soc in grid]
        )
    values.reverse()  # values[t] belongs to slots[t]; values[-1] is terminal

    # Forward pass from the actual SoC, picking the best action per slot.
    plan: dict[str, tuple[str, dict[str, Any]]] = {}
    soc = current_soc
    for t, slot in enumerate(slots):
        best: tuple[float, int, Option] | None = None
        for opt in model.options(slot, soc):
            score = total(opt, soc, values[t + 1])
            rank = _ACTION_RANK.get(opt[0], 9)
            if (
                best is None
                or score < best[0] - _TIE
                or (abs(score - best[0]) <= _TIE and rank < best[1])
            ):
                best = (score, rank, opt)
        assert best is not None
        action, cfg, end_soc, _ = best[2]
        if not slot.is_fixed:
            if action in (ACTION_CHARGE, ACTION_DISCHARGE):
                cfg = {"wattage": cfg["wattage"], "until_pct": round(end_soc, 1)}
            plan[slot.key] = (action, dict(cfg))
        soc = end_soc
    return plan
