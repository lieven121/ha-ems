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

---

## Entities (per device)

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.ems_planning` | Sensor | Full slot plan as `planning` attribute |
| `sensor.ems_current_action` | Sensor | Active slot action + all its parameters |
| `number.ems_min_battery` | Number | Minimum SoC the optimizer won't go below |
| `number.ems_max_battery` | Number | Maximum SoC the optimizer targets |
| `number.ems_avg_consumption` | Number | Average household load in W |
| `number.ems_kwp` | Number | Inverter/charger peak power in kW (sets default charge wattage) |
| `switch.ems_allow_discharge` | Switch | Enable discharge slots in the optimizer |
| `switch.ems_allow_idle_for_optimize` | Switch | Allow idle slots even when grid is cheaper than idle threshold |
| `button.ems_optimize` | Button | Trigger a fresh optimizer run |

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
| `ha_ems.planning_charge_car` | Reserve cheapest slots in a window for car charging |
| `ha_ems.planning_lock` | Lock / unlock a range of slots against the optimizer |
| `ha_ems.planning_clear` | Reset all manual overrides (optionally including locked slots) |
| `ha_ems.planning_optimize` | Re-run the optimizer for all unlocked slots |

Add `locked: true` to any planning service to protect the slot from future optimizer runs.

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
| Keyboard nav | ← / → to step; Esc to close |

---

## How the optimizer works

1. Slots are read from the price entity attribute (auto-detected 15-min or 60-min intervals)
2. Solar generation and battery SoC are simulated forward per slot
3. Unlocked slots are classified as **charge**, **discharge**, **use_net**, or **idle** based on price thresholds and the round-trip loss setting
4. Car-charge windows reserved via service are excluded from the optimizer

The plan is persisted to HA storage and restored on restart.

---

## License

[MIT](LICENSE) © lieven121

Issues & feature requests: [GitHub Issues](https://github.com/lieven121/HA-EMS/issues)
