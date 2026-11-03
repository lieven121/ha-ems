"""Tests for the cost-minimising battery planner."""

import itertools
import random
import time

import pytest

from ha_ems.const import (
    ACTION_CAR_CHARGE,
    ACTION_CHARGE,
    ACTION_DISCHARGE,
    ACTION_IDLE,
    ACTION_USE_NET,
)
from ha_ems.models import EMSSettings
from ha_ems.optimizer import OptimizerSlot, optimize, terminal_price
from ha_ems.simulation import one_way_efficiency, simulate_slot

# 10 kWh battery, 1 h slots, 1000 W load: an idle slot drains 10 % SoC.
LOAD_W = 1000.0
KWH = 10.0


def slots(prices, solar=None, load=LOAD_W, inj=None, **fixed):
    """Build slots s0, s1, ...; fixed={"s<i>": (action, cfg)}."""
    out = []
    for i, price in enumerate(prices):
        action, cfg = fixed.get(f"s{i}", (None, {}))
        out.append(
            OptimizerSlot(
                key=f"s{i}",
                price=price,
                load_w=load,
                solar_w=(solar or [0] * len(prices))[i],
                injection_price=inj,
                fixed_action=action,
                fixed_config=cfg,
            )
        )
    return out


def run(opt_slots, *, soc=50.0, battery_kwh=KWH, charge_w=3000.0, loss=0.0, **settings):
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


def replay(opt_slots, plan, *, soc=50.0, charge_w=3000.0, loss=0.0):
    """Simulate a plan: return (grid cost, SoC after every slot)."""
    eta = one_way_efficiency(loss)
    cost, socs = 0.0, []
    for slot in opt_slots:
        if slot.is_fixed:
            action, cfg = slot.fixed_action, slot.fixed_config
        else:
            action, cfg = plan[slot.key]
        res = simulate_slot(
            soc,
            action,
            cfg,
            slot.load_w,
            1.0,
            KWH,
            solar_w=slot.solar_w,
            default_wattage=charge_w,
            max_charge_w=charge_w,
            efficiency=eta,
        )
        cost += res.import_kwh * slot.price - res.export_kwh * (slot.injection_price or 0)
        soc = res.soc
        socs.append(soc)
    return cost, socs


def test_empty_input():
    assert run([]) == {}


def test_charges_in_cheap_slots_to_cover_expensive_ones():
    plan = run(slots([30, 5, 5, 40, 40, 40, 40, 40]), soc=20)
    acts = actions(plan)
    assert ACTION_CHARGE in acts[1:3]
    assert ACTION_CHARGE not in acts[3:]
    # The expensive hours run on the battery.
    assert acts[3:] == [ACTION_IDLE] * 5


def test_never_plans_below_min_battery():
    rng = random.Random(1)
    for _ in range(30):
        opt = slots([rng.uniform(0, 40) for _ in range(12)])
        plan = run(opt, soc=30)
        _, socs = replay(opt, plan, soc=30)
        assert min(socs) >= 10 - 0.5


def test_charge_config_has_wattage_and_target():
    plan = run(slots([30, 5, 40, 40, 40, 40]), soc=12)
    action, cfg = plan["s1"]
    assert action == ACTION_CHARGE
    assert cfg["wattage"] == 3000
    assert 10 < cfg["until_pct"] <= 95


def test_solar_replaces_grid_charging():
    # Cheap night, a sunny midday with plenty of surplus, an expensive
    # evening. Charging at night would be wasted: the sun fills the battery.
    prices = [10, 10, 30, 30, 30, 30, 50, 50]
    solar = [0, 0, 4000, 4000, 4000, 0, 0, 0]
    plan = run(slots(prices, solar=solar), soc=50)
    assert ACTION_CHARGE not in actions(plan)[:2]
    # Midday runs idle so the surplus goes into the battery.
    assert actions(plan)[2:5] == [ACTION_IDLE] * 3


def test_flat_prices_do_nothing_silly():
    plan = run(slots([20] * 6), soc=60, loss=20)
    assert ACTION_CHARGE not in actions(plan)
    assert ACTION_DISCHARGE not in actions(plan)


def test_losses_make_small_spreads_not_worth_it():
    # Charging at 20 to save 22 loses money with 20 % round-trip loss.
    plan = run(slots([20, 22, 22, 22]), soc=40, loss=20)
    assert ACTION_CHARGE not in actions(plan)


def test_fixed_slots_are_simulated_but_not_replanned():
    locked = (ACTION_USE_NET, {"use_solar": True})
    plan = run(slots([30, 20, 25], s1=locked))
    assert set(plan) == {"s0", "s2"}


def test_car_slot_with_negative_budget_counts_as_charging():
    # The car slot charges the house battery at 3 kW, so no extra grid
    # charging is needed for the expensive slots after it.
    car = (ACTION_CAR_CHARGE, {"use_battery_wattage": -3000})
    plan = run(slots([30, 20, 40, 40], s1=car), soc=15)
    assert ACTION_CHARGE not in actions(plan)


def test_without_idle_non_charge_slots_use_the_grid():
    plan = run(slots([30, 20, 25]), allow_idle_for_optimize=False)
    assert ACTION_IDLE not in actions(plan)


def test_discharge_only_when_allowed_and_paid():
    plan = run(slots([10, 10, 10], inj=50), soc=90)
    assert ACTION_DISCHARGE not in actions(plan)
    plan = run(slots([10, 10, 10], inj=50), soc=90, allow_discharge=True)
    assert ACTION_DISCHARGE in actions(plan)


def test_no_battery_uses_the_grid():
    plan = run(slots([30, 5, 25]), battery_kwh=0)
    assert actions(plan) == [ACTION_USE_NET] * 3


def test_terminal_price_is_cheapest_quarter():
    assert terminal_price(slots([1, 2, 3, 4, 10, 20, 30, 40])) == pytest.approx(1.5)


def test_at_least_as_good_as_brute_force():
    # Small horizon: try every idle / use_net / full-charge sequence.
    rng = random.Random(7)
    choices = [
        (ACTION_IDLE, {}),
        (ACTION_USE_NET, {}),
        (ACTION_CHARGE, {"wattage": 3000, "until_pct": 95}),
    ]
    for _ in range(10):
        opt = slots([rng.uniform(0, 40) for _ in range(5)])
        tp = terminal_price(opt)

        def total(plan, opt=opt, tp=tp):
            cost, socs = replay(opt, plan, soc=40)
            return cost - socs[-1] / 100 * KWH * tp, min(socs)

        dp_total, _ = total(run(opt, soc=40))
        best = min(
            t
            for combo in itertools.product(choices, repeat=5)
            for t, low in [total({f"s{i}": c for i, c in enumerate(combo)})]
            if low >= 10
        )
        assert dp_total <= best + 0.05


def test_fast_enough_for_two_days_of_quarter_hours():
    rng = random.Random(3)
    opt = [
        OptimizerSlot(key=f"s{i}", price=rng.uniform(0, 40), load_w=400, solar_w=0)
        for i in range(192)
    ]
    start = time.perf_counter()
    optimize(
        opt,
        settings=EMSSettings(allow_discharge=True),
        current_soc=50,
        slot_hours=0.25,
        battery_kwh=10,
        charge_wattage=3000,
        roundtrip_loss_pct=20,
    )
    elapsed = time.perf_counter() - start
    print(f"192 slots: {elapsed:.2f}s")
    assert elapsed < 5


def test_fast_model_matches_simulation():
    """The DP's arithmetic must agree with simulate_slot for every option."""
    from ha_ems.optimizer import _Model

    rng = random.Random(11)
    settings = EMSSettings(min_battery=10, max_battery=95, allow_discharge=True)
    for _ in range(300):
        model = _Model(
            settings=settings,
            slot_hours=rng.choice([0.25, 1.0]),
            battery_kwh=rng.uniform(3, 20),
            charge_wattage=rng.uniform(500, 6000),
            efficiency=one_way_efficiency(rng.uniform(0, 30)),
        )
        slot = OptimizerSlot(
            key="x",
            price=rng.uniform(-5, 40),
            load_w=rng.uniform(0, 3000),
            solar_w=rng.choice([0, rng.uniform(0, 6000)]),
            injection_price=rng.uniform(0, 10),
        )
        soc = rng.uniform(0, 100)
        for action, cfg, end_soc, cost in model.options(slot, soc):
            _, _, sim_soc, sim_cost = model.simulate(slot, soc, action, cfg)
            assert end_soc == pytest.approx(sim_soc, abs=1e-6), (action, cfg)
            assert cost == pytest.approx(sim_cost, abs=1e-6), (action, cfg)
