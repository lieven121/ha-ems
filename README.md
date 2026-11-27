# HA-EMS — Home Assistant Energy Management System

A Home Assistant integration that plans battery charge/discharge, grid usage, and car charging across 15-minute slots based on dynamic pricing and solar forecasts. A Lovelace card visualises the plan and lets you edit any slot interactively.

---

## Installation (HACS)

1. Add this repo as a **Custom Repository** in HACS (category: Integration)
2. Install **HA EMS** and restart Home Assistant
3. Go to **Settings → Devices & Services → Add Integration** → search **HA EMS**
4. Add `/ha_ems/ha-ems.js` as a Lovelace resource (**Settings → Dashboards → Resources**, type: JavaScript Module)

---

## Setup

The config flow will ask for:

| Field | Description |
|-------|-------------|
| Price entity | Sensor with a list of `{start, price}` dicts (e.g. Nordpool `data` attribute) |
| Price / start key | Attribute keys inside each price dict (defaults: `price`, `start`) |
| Injection price key | Optional — price received when injecting to grid |
| Battery entity | Sensor reporting current SoC in % |
| Battery size (kWh) | Total usable capacity |
| Round-trip loss (%) | Default 20 % |
| Live solar power | Optional — sensor with the solar power right now (W or kW). Slot conditions on solar or surplus use it; without it they use the slot's forecast |
| Car connected | Optional — on while the car is plugged in. With it, the car only charges on excess solar while connected |

### Solar and house load (Energy dashboard)

HA-EMS has no setup of its own for these. It reads them from **Settings → Dashboards → Energy**:

- **Solar forecast**: the forecast integrations attached to your solar panels there (Forecast.Solar, Open-Meteo Solar Forecast, Solcast, ...).
- **House load**: learned from the grid import/export, solar production and battery charge/discharge meters there.
  - House load = import − export + solar + battery discharge − battery charge.
  - It uses hourly statistics from the last four weeks.

If the Energy dashboard isn't set up, the plan uses a flat `Avg Consumption` and no solar.

---

## Entities (per device)

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.ems_planning` | Sensor | Full slot plan as `planning` attribute |
| `sensor.ems_current_action` | Sensor | What runs right now, with all its parameters. For a slot with a condition this is its action or its fallback; `planned_action`, `summary`, `condition`, `condition_met` and `car_on_surplus` tell why |
| `number.ems_min_battery` | Number | Minimum SoC the optimizer won't go below |
| `number.ems_max_battery` | Number | Maximum SoC the optimizer targets |
| `number.ems_avg_consumption` | Number | Average household load in W |
| `number.ems_kwp` | Number | Charge power limit: the grid power a planned charge slot draws, and the cap on power into the battery (solar included) |
| `number.ems_max_discharge` | Number | Most power the battery may deliver in a planned discharge slot |
| `number.ems_cycle_cost` | Number | Cost of cycling the battery, in price units per kWh discharged. The optimizer only uses the battery when the gain after losses is larger. 0 = any gain counts |
| `switch.ems_car_on_surplus` | Switch | Charge the car on excess solar in any slot that isn't locked or planned for the car (default on) |
| `number.ems_car_surplus_soc` | Number | …once the battery is at least this full (default 98 %) |
| `number.ems_car_surplus_w` | Number | …and solar beats the expected house load by this much (default 1500 W) |
| `switch.ems_allow_discharge` | Switch | Enable discharge slots in the optimizer |
| `switch.ems_allow_idle_for_optimize` | Switch | Allow idle slots even when grid is cheaper than idle threshold |
| `button.ems_optimize` | Button | Trigger a fresh optimizer run |
| `sensor.ems_solar_forecast` | Sensor (diagnostic) | Forecast PV output for the current slot in W; `today_kwh` / `tomorrow_kwh` attributes |
| `sensor.ems_predicted_load` | Sensor (diagnostic) | Expected house load for the current slot in W; `source` is `learned` or `average`, `profile_days` is how much history it learned from |

---

## Services

All services target a **device** (`device_id`), supporting multiple EMS instances.

| Service | Description |
|---------|-------------|
| `ha_ems.planning_idle` | Set a slot to idle |
| `ha_ems.planning_charge` | Set a slot to charge (`wattage`, `until_pct`) |
| `ha_ems.planning_discharge` | Set a slot to discharge (`wattage`, `until_pct`) |
| `ha_ems.planning_use_net` | Draw from grid (`max_wattage`, `use_solar`) |
| `ha_ems.planning_car_charge_slot` | Single slot car charge (`use_solar`, `use_net_wattage`, `use_battery_wattage`, `use_battery_until_pct`) |
| `ha_ems.planning_charge_car` | Reserve the cheapest slots in a window for car charging: `stop_time`, and either `slots_wanted` or `energy_kwh` (with `use_net_wattage` as the charging power). `start_time` defaults to now, `max_price` to no limit |
| `ha_ems.planning_battery_goal` | Have the battery at `target_pct` by the time `by`. Re-plans right away, and every later optimizer run keeps to it until the time has passed. Without `target_pct` the goal is cleared |
| `ha_ems.planning_lock` | Lock / unlock a range of slots against the optimizer |
| `ha_ems.planning_clear` | Reset all manual overrides (optionally including locked slots) |
| `ha_ems.planning_optimize` | Re-run the optimizer for all unlocked slots |
| `ha_ems.planning_bulk` | Edit many slots in one call; an entry with only `time` and `locked` just locks or unlocks a slot |

Add `locked: true` to any planning service to protect the slot from future optimizer runs.

### Conditions

The single-slot services and every `planning_bulk` entry take an optional condition: the slot runs its action only while the condition holds, and a fallback otherwise.

```yaml
action: ha_ems.planning_car_charge_slot
data:
  device_id: <ems device>
  time: "2026-11-28T12:00:00+01:00"
  use_net_wattage: 0
  when:
    - { on: soc, op: above, value: 98 }
    - { on: surplus, op: above, value: 1500 }
  otherwise: { action: idle }
```

- `on` is `soc` (battery %), `solar` (W) or `surplus` (solar minus the expected house load, W).
- `op` is `above` or `below`.
- At most two conditions per slot, and all of them must hold.
- `otherwise` is an action plus its fields, e.g. `{action: use_net, use_solar: true}`. Without it the fallback is idle.

The current slot's conditions are judged live, on the battery SoC and the live solar sensor:
- A condition has to hold for 2 minutes before its action starts. The first check in a slot is immediate.
- Solar and surplus have to drop 200 W below the threshold before the action stops, so passing clouds don't toggle it.
- `ha_ems_action_changed` fires whenever what runs changes, within a slot too.

---

## Lovelace Card

```yaml
type: custom:ems-dashboard-card
device_id: <your_ems_device_id>
```

| Feature | Description |
|---------|-------------|
| Price bar chart | Colour-coded bars (blue = cheap → red = expensive) |
| Action strip | Per-slot action indicator with colour coding |
| 24 h brush | Compact timeline — click to jump |
| Slot popup | Edit any slot's action and parameters inline |
| Keyboard | ← / → step a slot (continuing onto the next or previous day), Shift+← / → step a day, Home / End first or last slot, N now; 1–5 pick an action, L toggles lock, Ctrl+S (or Enter in a field) applies, Ctrl+C / Ctrl+V copy and paste-and-save a slot, B bulk edit, P plan, Esc close. In bulk edit and the planner, Backspace goes back to the slot and Ctrl+S applies the bulk edit. |
| Day switch | Today / Tomorrow buttons in the slot dialog; switching keeps the time of day |
| Solar & load | Solar forecast (yellow) and predicted house load (purple) behind the bars; `layout.show_forecast: false` hides them |
| Layer toggles | Solar, house load and battery icon buttons next to Today / Tomorrow show or hide each overlay |
| Devices legend | `layout.show_device_legend: false` hides the scheduled devices legend |
| Conditions | "+ Only when…" in the slot editor and bulk edit adds up to two conditions and picks the fallback. The dialog header shows the slot as one sentence; conditional slots show their fallback in the lower half of the action strip, and slots where the car is expected to charge on excess solar get a yellow edge |
| Phone | Below 600 px the dialogs fill the screen, with the header and the Apply bar always in view |
| Plan | The ⚡ Plan button schedules the car on the cheapest slots before a time (by kWh or number of slots, with a preview of the slots it will take) and sets or clears the battery goal. The goal shows as a bar on the battery line |
| Locking | Edits made in the slot editor or bulk edit are locked by default (untick to leave them to the optimizer); bulk edit also has Lock / Unlock buttons |

---

## How the optimizer works

The optimizer runs when you press **Optimize** or call `ha_ems.planning_optimize`. For example, call it from an automation that fires when tomorrow's prices are published. It never re-plans on its own.

1. **Slots** come from the price entity attribute. 15-min or 60-min intervals are detected automatically.
2. **Forecast per slot:**
   - solar output, from the Energy dashboard's forecast;
   - house load, from the learned weekly profile plus any scheduled devices.

   The profile has a value per weekday and hour. Recent weeks weigh more, and one-off spikes are ignored. A busier or quieter day than usual scales the next six hours.
3. **Energy model per action:**
   - **idle**: self-consumption. The battery covers what solar doesn't, and solar surplus charges it.
   - **car_charge**: the car takes its grid power and, with **Use Solar** on, any solar surplus beyond it. Only the battery budget moves the battery.
   - **use_net**: the battery is never discharged, and the house runs on solar and grid. Solar surplus (solar minus house and devices) charges the battery; with **Use Solar** off it is exported instead.
   - **charge**: the grid delivers the kWp power until the target SoC. The battery gets what the house leaves of it, plus any solar surplus.
   - **discharge**: the battery delivers the given power (or the house load, if larger) down to the target SoC. What the house doesn't use is exported.
   - Round-trip loss is split evenly between charging and discharging.
4. **Planning:** a dynamic program picks the cheapest plan over all unlocked future slots.
   - Cost per slot = grid import × price − export × injection price, plus the **Battery cycle cost** per kWh discharged.
   - It never plans below **Min Battery** if that can be avoided.
   - It grid-charges only up to **Max Battery**.
   - Energy left at the end is valued at what it costs to put back: the cheapest quarter of the prices, losses included. Stored energy is only used or sold when that beats buying it again, and the battery isn't emptied just because tomorrow's prices are still unknown.
   - Nothing is bought just to have more in the battery at the end than there is now.
   - Idle can also stop at a floor: "idle while the battery is above X %, otherwise use the grid". That spends part of the battery now and keeps the rest for a dearer slot later.
   - Discharge slots may use up to **Max discharge power**. Similar-priced slots share a discharge; a slot that stands out gets full power.
   - **Allow Discharge** enables discharge slots; **Allow Idle (Optimizer)** off means non-charge slots use the grid.
5. **Locked and car-charge slots** are kept as they are and planned around. A slot with a condition is simulated with it: SoC conditions switch at the moment the battery crosses the threshold, solar and surplus conditions are judged on the forecast.
6. **Car on excess solar:** with the switch on, the battery forecast assumes the car takes the surplus in slots where the battery is full enough and the forecast surplus is large enough. The optimizer itself doesn't count on it; it only happens once the battery is (nearly) full anyway.
7. **Battery goal:** with a goal set, the plan must have the battery at the target by the deadline, and gets there as cheaply as it can. A deadline beyond the published prices is ignored until they are in.

The battery forecast on the card (`battery_prediction`) uses the same model and updates on every refresh. The slot that is already running only counts for the time left in it. The plan, and the learned profile, are persisted to HA storage and restored on restart.

---

## License

[MIT](LICENSE) © lieven121

Issues & feature requests: [GitHub Issues](https://github.com/lieven121/HA-EMS/issues)
