"""Battery planning optimiser, as a pure function.

No Home Assistant imports: the coordinator gathers the inputs, calls
:func:`optimize`, and writes the result back to its planning store. That keeps
the algorithm unit-testable on its own.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .const import (
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
)
from .models import EMSSettings
from .simulation import step_soc


@dataclass
class OptimizerSlot:
    """One future slot, in chronological order."""

    key: str
    price: float
    load_w: float  # house load: baseline plus scheduled devices
    # Locked and car-charge slots are not re-planned; the optimiser only
    # simulates them with their existing action and config.
    fixed_action: str | None = None
    fixed_config: dict[str, Any] = field(default_factory=dict)

    @property
    def is_fixed(self) -> bool:
        return self.fixed_action is not None


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

    Algorithm (mirrors the original Node-RED flow):

    1. Start with every non-fixed slot idle (the battery drains naturally).
    2. Simulate forward. When SoC would drop below min_battery, promote the
       cheapest idle slot at or before that breach to charge. Repeat until
       there is no breach or nothing left to promote.
    3. Effective battery cost = the *cheapest* chosen charge price
       x (1 + roundtrip_loss). Grid energy below that price is better used
       directly than via the battery.
    4. Final pass: charge slots are kept (skipped if the battery is already
       at max_battery); other slots priced at or below the effective cost, or
       reached with the battery at min_battery, use the grid; the rest idle
       (or discharge, if allowed and the SoC can afford it).
    """
    has_battery = battery_kwh > 0

    def step(soc: float, slot: OptimizerSlot, action: str, cfg: dict[str, Any]) -> float:
        return step_soc(
            soc, action, cfg, slot.load_w, slot_hours, battery_kwh, charge_wattage
        )

    # ---- Phase 1: iterative charge placement ---------------------------------
    assignments: list[str] = [
        slot.fixed_action if slot.is_fixed else ACTION_IDLE  # type: ignore[misc]
        for slot in slots
    ]

    def first_breach() -> int | None:
        soc = current_soc
        for i, slot in enumerate(slots):
            cfg = slot.fixed_config if slot.is_fixed else {}
            soc = step(soc, slot, assignments[i], cfg)
            if soc < settings.min_battery:
                return i
        return None

    if has_battery and charge_wattage > 0:
        # At most one promotion per slot, so this always terminates.
        for _ in range(len(slots)):
            breach = first_breach()
            if breach is None:
                break
            candidates = [
                i
                for i in range(breach + 1)
                if not slots[i].is_fixed and assignments[i] == ACTION_IDLE
            ]
            if not candidates:
                break  # nothing left to charge in time for this breach
            best = min(candidates, key=lambda i: slots[i].price)
            assignments[best] = ACTION_CHARGE

    # ---- Phase 2: effective battery cost --------------------------------------
    # Locked charge slots count too: they are charge energy all the same.
    charge_prices = [
        slot.price
        for slot, action in zip(slots, assignments, strict=True)
        if action == ACTION_CHARGE
    ]
    effective_battery_cost = (
        min(charge_prices) * (1 + roundtrip_loss_pct / 100.0) if charge_prices else 0.0
    )

    # ---- Phase 3: final assignment pass ---------------------------------------
    result: dict[str, tuple[str, dict[str, Any]]] = {}
    soc = current_soc
    for slot, assigned in zip(slots, assignments, strict=True):
        if slot.is_fixed:
            action, cfg = assigned, slot.fixed_config
        else:
            action, cfg = _final_action(
                slot, assigned, soc, step, settings, effective_battery_cost, charge_wattage
            )
            result[slot.key] = (action, cfg)
        soc = step(soc, slot, action, cfg)

    return result


def _final_action(
    slot: OptimizerSlot,
    assigned: str,
    soc: float,
    step,
    settings: EMSSettings,
    effective_battery_cost: float,
    charge_wattage: float,
) -> tuple[str, dict[str, Any]]:
    if assigned == ACTION_CHARGE:
        if soc >= settings.max_battery:
            return ACTION_IDLE, {}
        predicted = step(soc, slot, ACTION_CHARGE, {})
        return ACTION_CHARGE, {
            "wattage": charge_wattage,
            "until_pct": round(min(predicted, settings.max_battery), 1),
        }

    if slot.price <= effective_battery_cost or soc <= settings.min_battery:
        # Cheap slot or battery depleted: use the grid, spare the battery.
        # Solar always takes precedence when using the grid.
        return ACTION_USE_NET, {"use_solar": True}

    if not settings.allow_idle_for_optimize:
        # Keep the battery: always use the grid on non-charge slots.
        return ACTION_USE_NET, {"use_solar": True}

    # Price is above the effective cost: let the battery power the home.
    if settings.allow_discharge and (
        step(soc, slot, ACTION_DISCHARGE, {}) >= settings.min_battery
    ):
        return ACTION_DISCHARGE, {"wattage": charge_wattage}
    return ACTION_IDLE, {}
