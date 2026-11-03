"""Tests for the battery planning optimiser."""

from ha_ems.const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
)
from ha_ems.models import EMSSettings
from ha_ems.optimizer import OptimizerSlot, optimize

# 10 kWh battery, 1 h slots, 1000 W load: each idle slot drains 10 % SoC.
LOAD_W = 1000.0


def slots(prices, **fixed):
    """Build slots s0, s1, ... with the given prices; fixed={index: (action, cfg)}."""
    out = []
    for i, price in enumerate(prices):
        action, cfg = fixed.get(f"s{i}", (None, {}))
        out.append(
            OptimizerSlot(
                key=f"s{i}", price=price, load_w=LOAD_W, fixed_action=action, fixed_config=cfg
            )
        )
    return out


def run(opt_slots, *, soc=50.0, battery_kwh=10.0, charge_w=3000.0, loss=20.0, **settings):
    return optimize(
        opt_slots,
        settings=EMSSettings(**{"min_battery": 10.0, "max_battery": 95.0, **settings}),
        current_soc=soc,
        slot_hours=1.0,
        battery_kwh=battery_kwh,
        charge_wattage=charge_w,
        roundtrip_loss_pct=loss,
    )


def actions(plan):
    return [plan[k][0] for k in sorted(plan, key=lambda k: int(k[1:]))]


def test_no_breach_means_no_charging():
    # 50 % with three 10 % slots never gets near the 10 % floor.
    plan = run(slots([30, 20, 25]))
    assert ACTION_CHARGE not in actions(plan)
    # No charge price, so the effective battery cost is 0 and every slot idles.
    assert actions(plan) == [ACTION_IDLE] * 3


def test_breach_promotes_cheapest_slot_before_it():
    # From 30 %, the third slot would end at 0 % (< 10 %). The cheapest slot
    # at or before that breach is s1; the cheaper s4 comes too late.
    plan = run(slots([30, 5, 25, 40, 1]), soc=30)
    assert plan["s1"][0] == ACTION_CHARGE
    assert plan["s4"][0] != ACTION_CHARGE
    assert plan["s1"][1]["wattage"] == 3000


def test_charge_sets_until_pct_to_predicted_soc():
    plan = run(slots([30, 5, 25]), soc=30)
    # s0 idle: 30 -> 20; s1 charge: 20 + 30 = 50 (the load runs on the grid)
    assert plan["s1"][1]["until_pct"] == 50.0


def test_cheap_slots_use_the_grid():
    # Charging at 5 makes stored energy cost 5 * 1.2 = 6, so a slot priced 6
    # or below should use the grid directly and anything dearer the battery.
    plan = run(slots([30, 5, 25, 6, 50]), soc=30)
    assert plan["s3"][0] == ACTION_USE_NET
    assert plan["s3"][1] == {"use_solar": True}
    assert plan["s4"][0] in (ACTION_IDLE, ACTION_USE_NET)


def test_fixed_slots_are_simulated_but_not_replanned():
    locked = (ACTION_USE_NET, {"use_solar": True})
    plan = run(slots([30, 20, 25], s1=locked))
    assert "s1" not in plan
    assert set(plan) == {"s0", "s2"}


def test_car_slot_with_negative_budget_counts_as_charging():
    # From 30 %, s2 would breach; but the car slot s1 charges the house
    # battery at 3 kW, so no extra charge slot is needed.
    car = (ACTION_CAR_CHARGE, {"use_battery_wattage": -3000})
    plan = run(slots([30, 20, 25, 25], s1=car), soc=30)
    assert ACTION_CHARGE not in actions(plan)


def test_without_idle_everything_else_uses_the_grid():
    plan = run(slots([30, 20, 25]), allow_idle_for_optimize=False)
    assert actions(plan) == [ACTION_USE_NET] * 3


def test_discharge_when_allowed_and_affordable():
    # 90 %: discharging 3 kW + 1 kW load costs 40 % a slot.
    plan = run(slots([30, 40]), soc=90, allow_discharge=True)
    assert plan["s0"][0] == ACTION_DISCHARGE  # 90 -> 50, stays above 10
    assert plan["s1"][0] == ACTION_DISCHARGE  # 50 -> 10, exactly at the floor
    # Starting at 70 %, s1 is reached at 30 %: discharging would end at -10 %,
    # so it idles instead (30 -> 20).
    plan = run(slots([30, 40]), soc=70, allow_discharge=True)
    assert plan["s1"] == (ACTION_IDLE, {})
    # And a slot reached at the floor uses the grid to spare the battery.
    plan = run(slots([30, 40, 50]), soc=90, allow_discharge=True)
    assert plan["s2"] == (ACTION_USE_NET, {"use_solar": True})


def test_battery_already_full_skips_the_charge():
    # From 95 %, nine idle slots would end at 5 %, so phase 1 picks the
    # cheapest slot, s0. But s0 starts at max_battery, so it idles instead.
    plan = run(slots([1] + [30] * 8), soc=95, max_battery=95)
    assert plan["s0"] == (ACTION_IDLE, {})


def test_no_battery_plans_no_charging():
    plan = run(slots([30, 5, 25]), soc=30, battery_kwh=0, charge_w=0)
    assert ACTION_CHARGE not in actions(plan)


def test_empty_input():
    assert run([]) == {}
