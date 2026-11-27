"""Slot conditions: "do this action when ..., otherwise that one".

A slot's ``action_config`` may carry::

    "when": [{"on": "soc" | "solar" | "surplus", "op": "above" | "below", "value": 30}],
    "otherwise": {"action": "use_net", "config": {...}},

All conditions must hold for the slot's own action to run; otherwise the
fallback runs (idle if none is given). The fallback has no conditions of its
own, so a slot is always one sentence: "Idle while battery ≥ 30 %, otherwise
Use net".

The built-in car-on-surplus rule is the same kind of guard, put around any
slot that isn't locked or planned for the car already.

No Home Assistant imports, so the simulation and the optimiser can use it.
"""

from __future__ import annotations

from typing import Any

from .const import (
    ACTION_CAR_CHARGE,
    ACTION_IDLE,
    ACTION_LABELS,
    ACTIONS,
    COND_SOC,
    COND_SOLAR,
    COND_SURPLUS,
    CONDITIONS,
    FIELD_OTHERWISE,
    FIELD_WHEN,
    MAX_CONDITIONS,
    OP_ABOVE,
    OPS,
)

Condition = dict[str, Any]

# How far a live value must move back past a condition's threshold before a
# condition that holds stops holding, so passing clouds don't flip the action
# every few seconds. SoC has none: a floor is a floor.
HYSTERESIS = {COND_SOC: 0.0, COND_SOLAR: 200.0, COND_SURPLUS: 200.0}

_UNITS = {COND_SOC: "%", COND_SOLAR: "W", COND_SURPLUS: "W"}
_NAMES = {COND_SOC: "battery", COND_SOLAR: "solar", COND_SURPLUS: "surplus"}


def normalize_when(raw: Any) -> list[Condition]:
    """Validate a ``when`` list; raise ValueError with a readable message."""
    if raw in (None, []):
        return []
    if not isinstance(raw, list):
        raise ValueError("Conditions must be a list")
    if len(raw) > MAX_CONDITIONS:
        raise ValueError(f"At most {MAX_CONDITIONS} conditions per slot")
    out: list[Condition] = []
    for cond in raw:
        if not isinstance(cond, dict):
            raise ValueError("Each condition needs 'on', 'op' and 'value'")
        on, op = cond.get("on"), cond.get("op")
        if on not in CONDITIONS:
            raise ValueError(f"Unknown condition {on!r}; use one of {', '.join(CONDITIONS)}")
        if op not in OPS:
            raise ValueError(f"Unknown operator {op!r}; use 'above' or 'below'")
        try:
            value = float(cond.get("value"))
        except (TypeError, ValueError):
            raise ValueError(f"Condition on {on} needs a numeric value") from None
        out.append({"on": on, "op": op, "value": value})
    return out


def normalize_otherwise(raw: Any) -> dict[str, Any]:
    """Validate an ``otherwise`` fallback; defaults to idle."""
    if not raw:
        return {"action": ACTION_IDLE, "config": {}}
    action = raw.get("action", ACTION_IDLE) if isinstance(raw, dict) else raw
    if action not in ACTIONS:
        raise ValueError(f"Unknown fallback action {action!r}")
    config = raw.get("config") if isinstance(raw, dict) else None
    return {"action": action, "config": strip_guard(dict(config or {}))}


def strip_guard(cfg: dict[str, Any]) -> dict[str, Any]:
    """*cfg* without its condition keys: the plain action's config."""
    return {k: v for k, v in cfg.items() if k not in (FIELD_WHEN, FIELD_OTHERWISE)}


def guard(cfg: dict[str, Any]) -> tuple[list[Condition], str, dict[str, Any]] | None:
    """(conditions, fallback action, fallback config) of a slot, or None."""
    when = cfg.get(FIELD_WHEN)
    if not when:
        return None
    other = cfg.get(FIELD_OTHERWISE) or {}
    return list(when), other.get("action", ACTION_IDLE), dict(other.get("config") or {})


def is_met(cond: Condition, value: float | None, *, holding: bool = False) -> bool:
    """Whether *cond* holds for *value*.

    *holding*: the condition held a moment ago, so it only stops once the
    value is back past the threshold by the hysteresis margin.
    """
    if value is None:
        return False
    margin = HYSTERESIS.get(cond["on"], 0.0) if holding else 0.0
    if cond["op"] == OP_ABOVE:
        return value >= cond["value"] - margin
    return value <= cond["value"] + margin


def surplus_rule(soc_pct: float, surplus_w: float) -> list[Condition]:
    """Conditions of the built-in car-on-surplus rule."""
    return [
        {"on": COND_SOC, "op": OP_ABOVE, "value": soc_pct},
        {"on": COND_SURPLUS, "op": OP_ABOVE, "value": surplus_w},
    ]


# The car runs on the surplus only: no grid power, battery left alone.
SURPLUS_CAR_CONFIG: dict[str, Any] = {"use_solar": True, "use_net_wattage": 0}


def with_surplus_rule(
    action: str, cfg: dict[str, Any], soc_pct: float, surplus_w: float
) -> tuple[str, dict[str, Any]]:
    """Wrap a slot's plan in the car-on-surplus rule, for simulating it."""
    return ACTION_CAR_CHARGE, {
        **SURPLUS_CAR_CONFIG,
        FIELD_WHEN: surplus_rule(soc_pct, surplus_w),
        FIELD_OTHERWISE: {"action": action, "config": cfg},
    }


def surplus_rule_applies(slot: dict[str, Any]) -> bool:
    """Whether the car-on-surplus rule may take over *slot*.

    Not for slots someone decided on: locked ones and car slots. A slot with
    a condition keeps it; the rule goes around it.
    """
    return not slot.get("locked") and slot.get("action") != ACTION_CAR_CHARGE


def describe_condition(cond: Condition) -> str:
    on = cond["on"]
    sign = "≥" if cond["op"] == OP_ABOVE else "≤"
    return f"{_NAMES.get(on, on)} {sign} {cond['value']:g} {_UNITS.get(on, '')}"


def describe_conditions(conds: list[Condition]) -> str:
    return " and ".join(describe_condition(c) for c in conds)


def summary(action: str, cfg: dict[str, Any]) -> str:
    """One sentence for a slot: "Idle while battery ≥ 30 %, otherwise Using Net"."""
    label = ACTION_LABELS.get(action, action)
    g = guard(cfg)
    if g is None:
        return label
    conds, other, _ = g
    other_label = ACTION_LABELS.get(other, other)
    return f"{label} while {describe_conditions(conds)}, otherwise {other_label}"
