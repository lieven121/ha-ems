// ems-dashboard-card.js — EMS Dashboard Custom Card for Home Assistant
// Place this file in your HA config's www/ folder, then add as a resource:
//   url: /local/ems-dashboard-card.js  type: module
//
// Card config:
//   type: custom:ems-dashboard-card
//   entity: sensor.ems_schedule
//   entry_id: <your_config_entry_id>   (optional — enables slot editing)

const CHART_H = 220;
const Y_STEPS = [0, 10, 20, 30, 40, 50];
const DEVICE_PALETTE = [
  '#3b82f6','#8b5cf6','#06b6d4','#f59e0b',
  '#ec4899','#10b981','#f43f5e','#a3e635',
];

// ── Price → colour interpolation ────────────────────────────────────────────
function priceColor(p) {
  const stops = [
    {v:-10,r:59,g:130,b:246},{v:5,r:59,g:130,b:246},
    {v:8,r:34,g:197,b:94},{v:20,r:34,g:197,b:94},
    {v:25,r:249,g:115,b:22},{v:32,r:220,g:38,b:38},
    {v:40,r:127,g:29,b:29},{v:55,r:14,g:14,b:14},
  ];
  if (p <= stops[0].v) return 'rgb(59,130,246)';
  if (p >= stops[stops.length-1].v) return 'rgb(14,14,14)';
  let lo = stops[0], hi = stops[1];
  for (let i = 0; i < stops.length-1; i++) {
    if (p >= stops[i].v && p <= stops[i+1].v) { lo = stops[i]; hi = stops[i+1]; break; }
  }
  const t = (p - lo.v) / (hi.v - lo.v);
  return `rgb(${Math.round(lo.r+(hi.r-lo.r)*t)},${Math.round(lo.g+(hi.g-lo.g)*t)},${Math.round(lo.b+(hi.b-lo.b)*t)})`;
}

// ── Derive action from slot data ─────────────────────────────────────────────
function slotAction(slot) {
  const ov = slot.battery_manual_override_w;
  if (ov != null) {
    if (ov > 0)  return { key: 'charge',    label: 'Charge',    color: '#16a34a' };
    if (ov < 0)  return { key: 'discharge', label: 'Discharge', color: '#dc2626' };
  }
  if (slot.devices?.length > 0) return { key: 'devices', label: 'Devices', color: '#2563eb' };
  return { key: 'idle', label: 'Idle', color: '#374151' };
}

function slotTimeStr(slot) {
  const d = new Date(slot.time);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function slotEndTimeStr(slots, idx) {
  if (idx + 1 < slots.length) return slotTimeStr(slots[idx + 1]);
  const d   = new Date(slots[idx].time);
  const dur = idx > 0 ? (d - new Date(slots[idx - 1].time)) : 3600000;
  const end = new Date(d.getTime() + dur);
  return `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
}

// ── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `

:host { display: block; }

.root {
  --bg:#0a0c10; --surface:#111418; --surface2:#1a1e26; --border:#252a35;
  --text:#e2e8f0; --text-dim:#64748b; --text-bright:#f8fafc;
  --accent:#3b82f6; --now:#facc15;
  background:var(--bg); color:var(--text);
  font-family:inherit;
  padding:16px; border-radius:12px;
  user-select:none;
  container-type:inline-size;
}
*{margin:0;padding:0;box-sizing:border-box;}

header{display:flex;align-items:baseline;gap:16px;margin-bottom:20px;}
header h1{font-family:var(--code-font-family, monospace);font-size:16px;font-weight:600;color:var(--text-bright);letter-spacing:.05em;text-transform:uppercase;}
header span{font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);letter-spacing:.1em;}

.stats{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;flex:1;min-width:140px;}
@container(max-width:360px){.stat-card{flex:1 1 100%;min-width:unset;}}
.stat-label{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;}
.stat-value{font-family:var(--code-font-family, monospace);font-size:18px;font-weight:700;color:var(--text-bright);}
.stat-unit{font-size:10px;font-weight:400;color:var(--text-dim);margin-left:2px;}
.stat-sub{font-family:var(--code-font-family,monospace);font-size:9px;color:var(--text-dim);margin-top:2px;}
.stat-price-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.stat-inj{font-family:var(--code-font-family,monospace);font-size:12px;font-weight:600;color:var(--text-dim);white-space:nowrap;}
.stat-action{font-family:var(--code-font-family,monospace);font-size:10px;font-weight:600;margin-top:6px;}
.stat-sep{color:var(--text-dim);margin:0 3px;font-weight:400;}
.stat-value.compound{font-size:14px;}

.controls{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;}
.btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:6px;cursor:pointer;font-family:var(--code-font-family, monospace);font-size:10px;font-weight:500;letter-spacing:.05em;transition:all .15s;}
.btn:hover{border-color:var(--accent);color:var(--accent);}
.btn.active{background:var(--accent);border-color:var(--accent);color:white;}
.date-label{font-family:var(--code-font-family, monospace);font-size:11px;color:var(--text-dim);margin-left:auto;}

/* Chart layout */
.chart-card{display:flex;flex-direction:row;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.chart-card:has(+ .brush-wrap:not([hidden])){border-radius:12px 12px 0 0;}
.y-axis{width:30px;flex-shrink:0;padding:16px 4px 0 0;position:relative;background:var(--surface);z-index:5;border-right:1px solid var(--border);}
.y-label{position:absolute;right:4px;font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);transform:translateY(-50%);white-space:nowrap;}
.chart-right{flex:1;display:flex;flex-direction:column;min-width:0;}
.chart-wrap{overflow-x:auto;overflow-y:visible;padding:16px 16px 0;flex-shrink:0;}
.chart-body{min-width:640px;position:relative;display:flex;flex-direction:column;}
.grid-lines{position:absolute;top:0;left:0;right:0;height:220px;pointer-events:none;z-index:0;}
.grid-line{position:absolute;left:0;right:0;height:1px;background:var(--border);opacity:.45;}

.now-line{position:absolute;top:0;width:2px;background:var(--now);opacity:.85;pointer-events:none;z-index:15;transform:translateX(-50%);border-radius:1px;box-shadow:0 0 6px rgba(250,204,21,.45);}
.now-label{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-family:var(--code-font-family, monospace);font-size:8px;color:var(--now);white-space:nowrap;background:var(--surface);padding:1px 4px;border-radius:3px;letter-spacing:.05em;}

.bars{display:flex;align-items:flex-end;height:220px;gap:1px;position:relative;z-index:1;}
.slot{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative;cursor:pointer;min-width:0;}
.slot:hover .price-bar{filter:brightness(1.3);}
.slot.hl .price-bar{filter:brightness(1.6);outline:2px solid rgba(255,255,255,.4);outline-offset:1px;}
.slot.now-slot .price-bar{outline:1px solid rgba(250,204,21,.3);}
.price-bar{width:100%;border-radius:2px 2px 0 0;transition:filter .1s;}

#tooltip{position:fixed;z-index:10000;background:#0d1017;border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:var(--code-font-family,monospace);font-size:10px;color:var(--text-bright);white-space:nowrap;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.6);transition:opacity .1s;opacity:0;}
#tooltip.visible{opacity:1;}
.tip-time{color:var(--text-dim);margin-bottom:2px;}
.tip-act{margin-top:2px;}

.action-strip{display:flex;gap:1px;height:14px;margin-top:3px;}
.ac{flex:1;border-radius:2px;cursor:pointer;transition:filter .1s;}
.ac:hover{filter:brightness(1.4);}

.x-axis{display:flex;margin-top:4px;padding-bottom:8px;}
.x-lbl{flex:1;font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-align:center;}

/* Brush */
.brush-wrap{flex-shrink:0;padding:8px 16px 12px;border:1px solid var(--border);border-top:none;background:var(--surface);border-radius:0 0 12px 12px;margin-bottom:2px;}
.brush-wrap.brush-solo{border:none;background:transparent;padding:4px 0 8px;border-radius:0;margin-bottom:0;}
.brush-label-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.brush-label{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;}
.brush-track{position:relative;height:22px;border-radius:4px;overflow:visible;cursor:pointer;user-select:none;}
.brush-segs{display:flex;height:100%;border-radius:4px;overflow:hidden;}
.brush-seg{flex:1;height:100%;transition:filter .08s;}
.brush-seg:hover{filter:brightness(1.3);}
.brush-dots{position:absolute;top:100%;left:0;right:0;height:8px;pointer-events:none;}
.brush-dot{position:absolute;width:3px;height:3px;border-radius:50%;transform:translate(-50%,2px);}
.brush-now{position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--now);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 5px rgba(250,204,21,.5);}
.brush-cursor{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;background:#fff;transform:translateX(-50%);pointer-events:none;box-shadow:0 0 6px rgba(255,255,255,.5);display:none;}

/* Legend */
.legend-wrap{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap;}
.legend-title{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;}
.legend-items{display:flex;gap:10px;flex-wrap:wrap;}
.li{display:flex;align-items:center;gap:5px;font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);}
.ls{width:14px;height:9px;border-radius:2px;flex-shrink:0;}

/* Empty / loading state */
.empty{padding:40px;text-align:center;font-family:var(--code-font-family, monospace);font-size:12px;color:var(--text-dim);}

/* ── Popup ───────────────────────────────────────────────────────────────── */
#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;}
#overlay.open{display:flex;}
#popup{background:var(--bg);border:1px solid var(--border);border-radius:14px;width:380px;max-width:calc(100vw - 32px);box-shadow:0 32px 80px rgba(0,0,0,.85);overflow:hidden;animation:popIn .17s cubic-bezier(.34,1.56,.64,1);}
@keyframes popIn{from{opacity:0;transform:scale(.92) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}

.ph{padding:14px 16px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;}
.ph-nav{display:flex;align-items:center;gap:10px;}
.ph-nav-btn{background:none;border:1px solid var(--border);color:var(--text-dim);width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;font-family:var(--code-font-family, monospace);}
.ph-nav-btn:hover{border-color:var(--text-bright);color:var(--text-bright);}
.ph-nav-btn:disabled{opacity:.2;cursor:default;}
.ph-title{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.12em;margin-bottom:3px;}
.ph-time{font-family:var(--code-font-family, monospace);font-size:17px;font-weight:700;color:var(--text-bright);}
.ph-close{background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;}
.ph-close:hover{border-color:var(--text-bright);color:var(--text-bright);}

/* Popup mini nav bar */
.pop-nav-wrap{padding:10px 16px 12px;border-bottom:1px solid var(--border);}
.pop-nav-label{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;}
.pop-nav-track{position:relative;height:14px;border-radius:3px;overflow:visible;cursor:pointer;user-select:none;}
.pop-nav-segs{display:flex;height:100%;border-radius:3px;overflow:hidden;}
.pop-nav-seg{flex:1;height:100%;}
.pop-nav-dots{position:absolute;top:100%;left:0;right:0;height:8px;pointer-events:none;}
.pop-nav-dot{position:absolute;width:3px;height:3px;border-radius:50%;transform:translate(-50%,2px);}
.pop-nav-cursor{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;background:var(--text-bright);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 6px rgba(255,255,255,.5);}
.pop-nav-now{position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--now);transform:translateX(-50%);pointer-events:none;opacity:.85;}

/* Price trio */
.price-trio{display:flex;align-items:center;gap:4px;padding:12px 16px;border-bottom:1px solid var(--border);}
.pt-slot{flex:1;background:var(--surface2);border-radius:8px;padding:9px 10px 7px;min-width:0;}
.pt-slot.cur{background:var(--surface);outline:1px solid var(--border);}
.pt-slot.is-now{outline:1px solid var(--now);box-shadow:0 0 10px rgba(250,204,21,.25);}
.pt-slot.nav{cursor:pointer;transition:background .12s;}
.pt-slot.nav:hover{background:var(--surface);}
.pt-label{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;}
.pt-time{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);margin-bottom:4px;}
.pt-price{font-family:var(--code-font-family, monospace);font-size:15px;font-weight:700;line-height:1;white-space:nowrap;}
.pt-unit{font-size:9px;font-weight:400;opacity:.7;margin-left:1px;}
.pt-bar{height:3px;border-radius:2px;margin-top:5px;}
.pt-arrow{color:var(--border);font-size:16px;flex-shrink:0;padding-bottom:6px;}

/* Popup detail section */
.pop-detail{padding:12px 16px 16px;}
.pop-section-title{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;}
.pop-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--surface2);}
.pop-row:last-child{border-bottom:none;}
.pop-row-label{font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);}
.pop-row-value{font-family:var(--code-font-family, monospace);font-size:11px;font-weight:600;color:var(--text-bright);}

.device-list{margin-top:8px;display:flex;flex-direction:column;gap:5px;}
.device-item{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border-radius:7px;border:1px solid var(--border);}
.device-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.device-name{font-family:var(--code-font-family, monospace);font-size:11px;color:var(--text-bright);flex:1;}
.device-watt{font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);}

/* Edit section */
.edit-section{padding:0 16px 16px;}
.edit-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
.edit-label{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;min-width:80px;}
.edit-input{background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text-bright);font-family:var(--code-font-family, monospace);font-size:11px;padding:5px 8px;width:100%;transition:border-color .12s;}
.edit-input:focus{outline:none;border-color:var(--accent);}
.edit-unit{font-family:var(--code-font-family, monospace);font-size:9px;color:var(--text-dim);white-space:nowrap;}
.edit-btn{margin-top:10px;background:var(--accent);border:none;border-radius:6px;color:white;font-family:var(--code-font-family, monospace);font-size:10px;font-weight:600;padding:7px 14px;cursor:pointer;transition:opacity .12s;width:100%;letter-spacing:.05em;}
.edit-btn:hover{opacity:.85;}
.edit-hint{font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);margin-top:8px;line-height:1.5;padding:6px 8px;background:var(--surface2);border-radius:4px;border:1px solid var(--border);}

.action-strip[hidden]{display:none;}
.brush-wrap[hidden]{display:none;}
header[hidden]{display:none;}
#chart-card[hidden]{display:none;}
#stats[hidden]{display:none;}
#day-btns[hidden]{display:none;}
.legend-wrap[hidden]{display:none;}

/* Light theme */
.root.theme-light {
  --bg:#f8fafc; --surface:#ffffff; --surface2:#f1f5f9; --border:#e2e8f0;
  --text:#1e293b; --text-dim:#94a3b8; --text-bright:#0f172a;
  --accent:#3b82f6; --now:#ca8a04;
}
/* System theme: use light vars when OS is set to light */
@media (prefers-color-scheme: light) {
  .root.theme-system {
    --bg:#f8fafc; --surface:#ffffff; --surface2:#f1f5f9; --border:#e2e8f0;
    --text:#1e293b; --text-dim:#94a3b8; --text-bright:#0f172a;
    --accent:#3b82f6; --now:#ca8a04;
  }
}
/* Home Assistant theme: inherit from HA CSS custom properties */
.root.theme-ha {
  --bg:var(--card-background-color, #fff);
  --surface:var(--secondary-background-color, #f5f5f5);
  --surface2:var(--primary-background-color, #fafafa);
  --border:var(--divider-color, #e0e0e0);
  --text:var(--primary-text-color, #212121);
  --text-dim:var(--secondary-text-color, #727272);
  --text-bright:var(--primary-text-color, #212121);
  --accent:var(--primary-color, #3b82f6);
  --now:var(--warning-color, #ff9800);
  border-radius:var(--ha-card-border-radius, 12px);
  box-shadow:var(--ha-card-box-shadow, none);
}
`;

// ── Card class ───────────────────────────────────────────────────────────────
class EmsDashboardCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._slots         = [];
    this._filteredSlots = [];
    this._days          = [];
    this._dayIdx        = 0;
    this._activeIdx     = null;
    this._devColors     = {};
    this._lastSer       = '';
    this._config        = {};
    this._hass          = null;
    this._initialScroll = false;
  }

  // ── HA card lifecycle ──────────────────────────────────────────────────────
  setConfig(config) {
    if (!config.entity && !config.price?.entity)
      throw new Error('ems-dashboard-card: set entity or price.entity');
    this._config = config;
    this._buildDOM();
  }

  set hass(hass) {
    this._hass = hass;
    const slots = this._buildSlots(hass);
    const ser = JSON.stringify(slots);
    if (ser !== this._lastSer) {
      this._lastSer = ser;
      this._slots   = slots;
      this._parseData();
      this._render();
    }
  }

  static getConfigElement() {
    return document.createElement('ems-dashboard-card-editor');
  }

  static getStubConfig() {
    return {
      price: {
        entity:    'sensor.nordpool_kwh_xx_xx',
        attribute: 'prices_today',
        start_key: 'start',
        price_key: 'price',
      },
    };
  }

  // ── Data helpers ───────────────────────────────────────────────────────────

  // Build slot array from whichever data source is configured.
  // Priority: price.entity (direct price feed) → entity (EMS schedule sensor)
  _buildSlots(hass) {
    const pCfg = this._config.price;

    if (pCfg?.entity) {
      const stateObj = hass.states[pCfg.entity];
      if (!stateObj) return [];
      const list     = stateObj.attributes[pCfg.attribute || 'prices_today'] ?? [];
      const startKey = pCfg.start_key          || 'start';
      const priceKey = pCfg.price_key          || 'price';
      const injKey   = pCfg.injection_price_key || null;
      return list.map(entry => {
        const base = parseFloat(entry[priceKey]) || 0;
        const inj  = injKey ? (parseFloat(entry[injKey]) || 0) : 0;
        return {
          time:                      entry[startKey],
          price:                     base,
          _injPrice:                 inj,
          devices:                   [],
          battery_manual_override_w: null,
          battery_soc_predicted_pct: null,
          solar_wh_predicted:        null,
        };
      });
    }

    if (this._config.entity) {
      const stateObj = hass.states[this._config.entity];
      return stateObj?.attributes?.schedule ?? [];
    }

    return [];
  }
  _parseData() {
    const groups = {};
    for (const slot of this._slots) {
      const d   = new Date(slot.time);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
    }
    this._days = Object.keys(groups).sort().map(k => ({ date: k, slots: groups[k] }));

    // If a fixed day is configured, select it; otherwise keep current dayIdx
    const fixedDay = this._config.layout?.day;
    if (fixedDay) {
      const today    = new Date().toLocaleDateString('en-CA');
      const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
      const target   = fixedDay === 'tomorrow' ? tomorrow : today;
      const idx      = this._days.findIndex(d => d.date === target);
      this._dayIdx   = idx >= 0 ? idx : 0;
    } else if (this._dayIdx >= this._days.length) {
      this._dayIdx = 0;
    }

    this._filteredSlots = this._days[this._dayIdx]?.slots ?? this._slots;
    this._buildDevColors();
  }

  _buildDevColors() {
    const names = new Set();
    for (const slot of this._filteredSlots)
      for (const d of slot.devices ?? []) names.add(d.name);
    let i = 0;
    const map = {};
    for (const n of names) map[n] = DEVICE_PALETTE[i++ % DEVICE_PALETTE.length];
    this._devColors = map;
  }

  _nowSlotIdx() {
    const now = new Date();
    const s = this._filteredSlots;
    for (let i = 0; i < s.length; i++) {
      const t0 = new Date(s[i].time);
      const t1 = s[i+1] ? new Date(s[i+1].time) : new Date(t0.getTime() + 3600000);
      if (now >= t0 && now < t1) return i;
    }
    return -1;
  }

  // ── DOM bootstrap ──────────────────────────────────────────────────────────
  _buildDOM() {
    this.shadowRoot.innerHTML = `
      <style>${CSS}
        .debug {
          font-family: var(--code-font-family, monospace);
          font-size: 11px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 10px 12px;
          margin-top: 16px;
          white-space: pre-wrap;
          word-break: break-all;
          color: var(--text-dim);
        }
        .debug[hidden] { display: none; }
        .debug b { color: var(--text-bright); }
        .dbg-table { margin-top: 12px; width: 100%; border-collapse: collapse; font-size: 11px; }
        .dbg-table th { text-align:left; padding:5px 8px; border-bottom:2px solid var(--border); color:var(--text-dim); font-size:9px; text-transform:uppercase; letter-spacing:.05em; }
        .dbg-table td { padding:4px 8px; border-bottom:1px solid var(--border); }
        .dbg-table tr.now td { background:rgba(250,204,21,.06); }
      </style>
      <div class="root">
        <header>
          <h1>EMS Schedule</h1>
          <span id="header-date"></span>
        </header>
        <div class="stats" id="stats"></div>
        <div class="controls" id="day-btns"></div>
        <div class="chart-card" id="chart-card">
          <div class="y-axis" id="y-axis" style="height:${CHART_H + 24}px"></div>
          <div class="chart-right">
            <div class="chart-wrap" id="chart-wrap">
              <div class="chart-body" id="chart-body">
                <div class="grid-lines" id="grid-lines"></div>
                <div class="bars" id="bars" style="height:${CHART_H}px"></div>
                <div class="action-strip" id="action-strip"></div>
                <div class="x-axis" id="x-axis"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="brush-wrap" id="brush-wrap">
          <div class="brush-label-row">
            <span class="brush-label">Overview</span>
            <span class="brush-label" id="brush-now-label"></span>
          </div>
          <div class="brush-track" id="brush-track">
            <div class="brush-segs" id="brush-segs"></div>
            <div class="brush-dots" id="brush-dots"></div>
            <div class="brush-now"    id="brush-now"    style="display:none"></div>
            <div class="brush-cursor" id="brush-cursor" style="display:none"></div>
          </div>
        </div>
        <div class="legend-wrap" id="legend"></div>
        <div id="debug" class="debug" hidden></div>
        <div id="overlay"><div id="popup"></div></div>
        <div id="tooltip"></div>
      </div>`;

    this.shadowRoot.getElementById('overlay').addEventListener('click', e => {
      if (e.target.id === 'overlay') this._closePopup();
    });
    document.addEventListener('keydown', this._onKey.bind(this));
  }

  // ── Main render ────────────────────────────────────────────────────────────
  _render() {
    const sr    = this.shadowRoot;
    if (!sr) return;
    const theme = this._config.layout?.theme || 'dark';
    const root  = sr.querySelector('.root');
    root.classList.toggle('theme-light',  theme === 'light');
    root.classList.toggle('theme-system', theme === 'system');
    root.classList.toggle('theme-ha',     theme === 'ha');
    const slots = this._filteredSlots;
    const n     = slots.length;

    // ── Debug panel (only when debug:true) ──────────────────────────────────
    const debugEl = sr.getElementById('debug');
    if (this._config.debug || this._config.advanced?.debug) {
      debugEl.hidden = false;
      const pCfg = this._config.price;
      const lines = [];
      if (pCfg?.entity) {
        const stateObj = this._hass?.states[pCfg.entity];
        lines.push(`<b>price.entity:</b> ${pCfg.entity}`);
        lines.push(`<b>state exists:</b> ${!!stateObj}`);
        if (stateObj) {
          const attrKey = pCfg.attribute || 'prices_today';
          const raw = stateObj.attributes[attrKey];
          lines.push(`<b>attribute "${attrKey}" exists:</b> ${raw !== undefined}`);
          lines.push(`<b>entry count:</b> ${Array.isArray(raw) ? raw.length : 'not an array'}`);
          if (Array.isArray(raw) && raw.length > 0) {
            lines.push(`<b>first entry keys:</b> ${Object.keys(raw[0]).join(', ')}`);
            lines.push(`<b>first entry:</b> ${JSON.stringify(raw[0])}`);
          }
        }
      } else if (this._config.entity) {
        const stateObj = this._hass?.states[this._config.entity];
        lines.push(`<b>entity:</b> ${this._config.entity}`);
        lines.push(`<b>state exists:</b> ${!!stateObj}`);
        if (stateObj) {
          const schedule = stateObj.attributes.schedule;
          lines.push(`<b>schedule attribute exists:</b> ${Array.isArray(schedule)}`);
          lines.push(`<b>slot count:</b> ${Array.isArray(schedule) ? schedule.length : '–'}`);
        }
      } else {
        lines.push('<b>No entity configured</b>');
      }
      lines.push(`<b>parsed slots:</b> ${slots.length}`);

      const ns2 = this._nowSlotIdx();
      const tableHtml = slots.length ? `
        <table class="dbg-table">
          <thead><tr><th>Time</th><th>Price</th><th>Battery SoC</th><th>Devices</th></tr></thead>
          <tbody>${slots.map((slot, i) => `
            <tr${i === ns2 ? ' class="now"' : ''}>
              <td>${slotTimeStr(slot)}</td>
              <td style="color:${priceColor(slot.price)};font-weight:600">${slot.price.toFixed(2)} ct</td>
              <td>${slot.battery_soc_predicted_pct != null ? slot.battery_soc_predicted_pct + ' %' : '–'}</td>
              <td>${slot.devices?.map(d => d.name).join(', ') || '–'}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '';
      debugEl.innerHTML = lines.join('\n') + tableHtml;
    } else {
      debugEl.hidden = true;
      debugEl.innerHTML = '';
    }

    // ── Chart ────────────────────────────────────────────────────────────────
    if (!n) {
      sr.getElementById('bars').innerHTML = '<div class="empty">No schedule data available</div>';
      sr.getElementById('stats').innerHTML = '';
      sr.getElementById('day-btns').innerHTML = '';
      return;
    }

    const prices = slots.map(s => s.price);
    const maxP   = Math.max(...prices, 45);
    const ns     = this._nowSlotIdx();

    // Day buttons — hidden when a fixed day is configured
    const today    = new Date().toLocaleDateString('en-CA');
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
    const fixedDay = this._config.layout?.day; // 'today' | 'tomorrow' | undefined
    sr.getElementById('day-btns').hidden = !!fixedDay;
    if (!fixedDay) {
      sr.getElementById('day-btns').innerHTML = this._days.map((d, i) => {
        const label = d.date === today ? 'Today' : d.date === tomorrow ? 'Tomorrow' : d.date;
        return `<button class="btn${i === this._dayIdx ? ' active' : ''}" data-day="${i}">${label}</button>`;
      }).join('');
      sr.getElementById('day-btns').querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._dayIdx        = +btn.dataset.day;
          this._filteredSlots = this._days[this._dayIdx].slots;
          this._buildDevColors();
          this._render();
        });
      });
    }

    // Y-axis & grid lines
    const ySteps = Y_STEPS.filter(v => v <= maxP + 5);
    sr.getElementById('y-axis').innerHTML = ySteps.map(v =>
      `<div class="y-label" style="bottom:${v / maxP * CHART_H}px">${v}</div>`
    ).join('');
    sr.getElementById('grid-lines').innerHTML = ySteps.map(v =>
      `<div class="grid-line" style="bottom:${v / maxP * CHART_H}px"></div>`
    ).join('');

    // Now line
    let nowLineHtml = '';
    if (ns >= 0) {
      const now  = new Date();
      const t0   = new Date(slots[ns].time);
      const t1   = ns + 1 < n ? new Date(slots[ns + 1].time) : new Date(t0.getTime() + 3600000);
      const frac = Math.min(1, Math.max(0, (now - t0) / (t1 - t0)));
      const pct  = ((ns + frac) / n * 100).toFixed(2);
      nowLineHtml = `<div class="now-line" style="left:${pct}%;height:${CHART_H}px">
        <div class="now-label">Now</div></div>`;
    }

    // Bars
    sr.getElementById('bars').innerHTML = nowLineHtml + slots.map((slot, i) => {
      const h   = Math.max(2, slot.price / maxP * CHART_H);
      const col = priceColor(slot.price);
      return `<div class="slot${i === ns ? ' now-slot' : ''}" data-i="${i}">
        <div class="price-bar" style="height:${h}px;background:${col}"></div>
      </div>`;
    }).join('');
    const tooltipEl = sr.getElementById('tooltip');
    sr.getElementById('bars').querySelectorAll('.slot').forEach(el => {
      const i = +el.dataset.i;
      el.addEventListener('click', () => this._openPopup(i));
      el.addEventListener('mouseenter', () => {
        const slot = slots[i];
        const col  = priceColor(slot.price);
        const act  = slotAction(slot);
        tooltipEl.innerHTML = `<div class="tip-time">${slotTimeStr(slot)}–${slotEndTimeStr(slots, i)}</div><div style="color:${col};font-weight:700">${slot.price.toFixed(2)} ct</div><div class="tip-act" style="color:${act.color}">${act.label}</div>`;
        const rect = el.getBoundingClientRect();
        const top  = rect.top - tooltipEl.offsetHeight - 8;
        const left = rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2;
        tooltipEl.style.top  = `${Math.max(4, top)}px`;
        tooltipEl.style.left = `${Math.min(window.innerWidth - tooltipEl.offsetWidth - 4, Math.max(4, left))}px`;
        tooltipEl.classList.add('visible');
      });
      el.addEventListener('mousemove', () => {
        const rect = el.getBoundingClientRect();
        const top  = rect.top - tooltipEl.offsetHeight - 8;
        const left = rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2;
        tooltipEl.style.top  = `${Math.max(4, top)}px`;
        tooltipEl.style.left = `${Math.min(window.innerWidth - tooltipEl.offsetWidth - 4, Math.max(4, left))}px`;
      });
      el.addEventListener('mouseleave', () => tooltipEl.classList.remove('visible'));
    });

    // Action strip
    sr.getElementById('action-strip').innerHTML = slots.map((slot, i) => {
      const act = slotAction(slot);
      return `<div class="ac" data-i="${i}" style="background:${act.color}" title="${act.label}"></div>`;
    }).join('');
    sr.getElementById('action-strip').querySelectorAll('.ac').forEach(el => {
      el.addEventListener('click', () => this._openPopup(+el.dataset.i));
    });

    // X-axis labels
    const every = Math.max(1, Math.floor(n / 12));
    sr.getElementById('x-axis').innerHTML = slots.map((slot, i) =>
      `<div class="x-lbl">${i % every === 0 ? slotTimeStr(slot) : ''}</div>`
    ).join('');

    // Stats
    const avg = prices.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    {
      const curSlot = ns >= 0 ? slots[ns] : null;
      const hasInj  = !!(this._config.price?.injection_price_key);
      const curCard = curSlot
        ? `<div class="stat-card">
            <div class="stat-label">Current</div>
            <div class="stat-price-row">
              <span class="stat-value">${curSlot.price.toFixed(2)}<span class="stat-unit">ct</span></span>
              ${hasInj ? `<span class="stat-inj">↑ ${curSlot._injPrice.toFixed(2)} ct</span>` : ''}
            </div>
            <div class="stat-action" style="color:${slotAction(curSlot).color}">● ${slotAction(curSlot).label}</div>
          </div>`
        : `<div class="stat-card">
            <div class="stat-label">Current</div>
            <div class="stat-value">–</div>
          </div>`;
      const mmCard = `<div class="stat-card">
        <div class="stat-label">Min / Avg / Max</div>
        <div class="stat-value compound">${min.toFixed(2)}<span class="stat-sep">/</span>${avg.toFixed(2)}<span class="stat-sep">/</span>${max.toFixed(2)}<span class="stat-unit">ct</span></div>
      </div>`;
      sr.getElementById('stats').innerHTML = curCard + mmCard;
      if (ns >= 0) {
        sr.querySelector('#stats .stat-card').style.cursor = 'pointer';
        sr.querySelector('#stats .stat-card').addEventListener('click', () => this._openPopup(ns));
      }
    }

    // Legend
    const devNames = Object.keys(this._devColors);
    const showPriceLegend  = this._config.layout?.show_price_legend  !== false;
    const showActionLegend = this._config.layout?.show_action_legend !== false;
    const legendEl = sr.getElementById('legend');
    legendEl.innerHTML = `
      ${showPriceLegend ? `<div>
        <div class="legend-title">Price</div>
        <div class="legend-items">
          ${[{c:'#3b82f6',l:'Low'},{c:'#22c55e',l:'Normal'},{c:'#f97316',l:'High'},{c:'#dc2626',l:'Peak'}]
            .map(e => `<div class="li"><div class="ls" style="background:${e.c}"></div>${e.l}</div>`).join('')}
        </div>
      </div>` : ''}
      ${showActionLegend ? `<div>
        <div class="legend-title">Action</div>
        <div class="legend-items">
          ${[{c:'#16a34a',l:'Charge'},{c:'#dc2626',l:'Discharge'},{c:'#2563eb',l:'Devices'},{c:'#374151',l:'Idle'}]
            .map(e => `<div class="li"><div class="ls" style="background:${e.c}"></div>${e.l}</div>`).join('')}
        </div>
      </div>` : ''}
      ${devNames.length ? `<div>
        <div class="legend-title">Devices</div>
        <div class="legend-items">
          ${devNames.map(n => `<div class="li"><div class="ls" style="background:${this._devColors[n]}"></div>${n}</div>`).join('')}
        </div>
      </div>` : ''}`;
    legendEl.hidden = !showPriceLegend && !showActionLegend && !devNames.length;
    sr.getElementById('action-strip').hidden = this._config.layout?.show_actions === false;
    sr.getElementById('brush-wrap').hidden   = this._config.layout?.show_brush === false;
    sr.querySelector('header').hidden        = this._config.layout?.show_header === false;
    sr.getElementById('chart-card').hidden   = this._config.layout?.show_chart === false;
    sr.getElementById('stats').hidden        = this._config.layout?.show_stats === false;
    sr.getElementById('brush-wrap').classList.toggle('brush-solo', this._config.layout?.show_chart === false);
    this._renderBrush();
    if (ns >= 0) {
      const isFirst = !this._initialScroll;
      this._initialScroll = true;
      this._scrollToSlot(ns, isFirst);
    }
  }
  // ── Brush ──────────────────────────────────────────────────────────────────
  _renderBrush() {
    const sr    = this.shadowRoot;
    const slots = this._filteredSlots;
    const n     = slots.length;
    const ns    = this._nowSlotIdx();

    sr.getElementById('brush-segs').innerHTML = slots.map((slot, i) =>
      `<div class="brush-seg" data-i="${i}" style="background:${priceColor(slot.price)}"></div>`
    ).join('');

    sr.getElementById('brush-dots').innerHTML = slots.map((slot, i) => {
      const act = slotAction(slot);
      if (act.key === 'idle') return '';
      return `<div class="brush-dot" style="left:${(i+0.5)/n*100}%;background:${act.color}"></div>`;
    }).join('');

    const brushNow = sr.getElementById('brush-now');
    if (ns >= 0) {
      brushNow.style.left    = `${(ns+0.5)/n*100}%`;
      brushNow.style.display = 'block';
      sr.getElementById('brush-now-label').textContent = `Now ${slotTimeStr(slots[ns])}`;
    } else {
      brushNow.style.display = 'none';
    }

    const cur = sr.getElementById('brush-cursor');
    if (this._activeIdx !== null) {
      cur.style.display = 'block';
      cur.style.left    = `${(this._activeIdx+0.5)/n*100}%`;
    } else {
      cur.style.display = 'none';
    }

    // Brush click — opens popup when chart is hidden, otherwise scroll
    const chartHidden = this._config.layout?.show_chart === false;
    const track = sr.getElementById('brush-track');
    track.onclick = e => {
      const rect = track.getBoundingClientRect();
      const idx  = Math.floor((e.clientX - rect.left) / rect.width * n);
      if (idx >= 0 && idx < n) {
        if (chartHidden || this._activeIdx !== null) this._openPopup(idx);
        else this._scrollToSlot(idx);
      }
    };
    sr.querySelectorAll('.brush-seg').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const i = +el.dataset.i;
        if (chartHidden || this._activeIdx !== null) this._openPopup(i);
        else this._scrollToSlot(i);
      });
    });
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────
  _scrollToSlot(i, instant = false) {
    const wrap  = this.shadowRoot.getElementById('chart-wrap');
    const body  = this.shadowRoot.getElementById('chart-body');
    const doScroll = () => {
      const slotW = body.scrollWidth / this._filteredSlots.length;
      if (slotW === 0) return; // layout not ready yet
      wrap.scrollTo({ left: Math.max(0, (i + 0.5) * slotW - wrap.clientWidth / 2), behavior: instant ? 'instant' : 'smooth' });
    };
    if (instant || body.scrollWidth > 0) {
      requestAnimationFrame(doScroll);
    } else {
      // First paint: wait two frames for layout to settle
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    }
  }

  // ── Popup ──────────────────────────────────────────────────────────────────
  _openPopup(i) {
    this._activeIdx = i;
    this.shadowRoot.querySelectorAll('.slot').forEach(el =>
      el.classList.toggle('hl', +el.dataset.i === i)
    );
    this._renderBrush();
    this._renderPopup(i);
    this.shadowRoot.getElementById('overlay').classList.add('open');
  }

  _closePopup() {
    this.shadowRoot.getElementById('overlay').classList.remove('open');
    this.shadowRoot.querySelectorAll('.slot').forEach(el => el.classList.remove('hl'));
    this._activeIdx = null;
    this._renderBrush();
  }

  _navigateSlot(i) {
    if (i < 0 || i >= this._filteredSlots.length) return;
    this._activeIdx = i;
    this.shadowRoot.querySelectorAll('.slot').forEach(el =>
      el.classList.toggle('hl', +el.dataset.i === i)
    );
    this._scrollToSlot(i);
    this._renderPopup(i);
    this._renderBrush();
  }

  _renderPopup(i) {
    this._activeIdx = i;
    const slots = this._filteredSlots;
    const n     = slots.length;
    const slot  = slots[i];
    const ns    = this._nowSlotIdx();
    const act   = slotAction(slot);
    const hasEntry = !!this._config.entry_id;

    // Mini nav bar HTML
    const navSegs = slots.map((s, si) =>
      `<div class="pop-nav-seg" data-i="${si}" style="background:${priceColor(s.price)};cursor:pointer"></div>`
    ).join('');
    const navDots = slots.map((s, si) => {
      const a = slotAction(s);
      if (a.key === 'idle') return '';
      return `<div class="pop-nav-dot" style="left:${(si+0.5)/n*100}%;background:${a.color}"></div>`;
    }).join('');

    // Price trio
    const trio = [{label:'Prev',idx:i-1},{label:'Now',idx:i,cur:true},{label:'Next',idx:i+1}];
    const trioHtml = trio.map(({label, idx, cur}, ti) => {
      const arrow = ti < 2 ? `<div class="pt-arrow">›</div>` : '';
      const isNav = !cur && idx >= 0 && idx < n;
      const isNow = idx === ns;
      if (idx < 0 || idx >= n) return `<div class="pt-slot${cur?' cur':''}${isNow?' is-now':''}">\
        <div class="pt-label">${label}</div><div class="pt-time">–</div>\
        <div class="pt-price" style="color:#4a5568">–</div></div>${arrow}`;
      const p = slots[idx].price, c = priceColor(p), w = Math.min(100, Math.max(5, p/52*100));
      return `<div class="pt-slot${cur?' cur':''}${isNav?' nav':''}${isNow?' is-now':''}"${isNav?` data-nav="${idx}"`:''}
        title="${isNav?'Click to navigate':''}">
        <div class="pt-label">${label}</div>
        <div class="pt-time">${slotTimeStr(slots[idx])}</div>
        <div class="pt-price" style="color:${c}">${p.toFixed(2)}<span class="pt-unit">ct</span></div>
        <div class="pt-bar" style="background:${c};width:${w}%"></div>
      </div>${arrow}`;
    }).join('');

    // Devices
    const devHtml = (slot.devices || []).length
      ? `<div class="device-list">${slot.devices.map(d => `
          <div class="device-item">
            <div class="device-dot" style="background:${this._devColors[d.name]||'#3b82f6'}"></div>
            <div class="device-name">${d.name}</div>
            <div class="device-watt">${d.manual_override_w ?? d.allocated_wattage_w} W</div>
          </div>`).join('')}</div>`
      : `<div style="font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);margin-top:4px">No devices scheduled</div>`;

    // Edit section
    const editHtml = hasEntry
      ? `<div class="edit-section">
          <div class="pop-section-title">Override Battery</div>
          <div class="edit-row">
            <span class="edit-label">Wattage</span>
            <input class="edit-input" id="edit-bat-w" type="number" min="-100000" max="100000" step="100"
              placeholder="${slot.battery_manual_override_w ?? 'auto'}"
              value="${slot.battery_manual_override_w ?? ''}">
            <span class="edit-unit">W</span>
          </div>
          <div style="font-family:var(--code-font-family, monospace);font-size:8px;color:var(--text-dim);margin-top:4px;padding:0 0 0 80px">
            + = charge · − = discharge · 0 = off · empty = auto
          </div>
          <button class="edit-btn" id="edit-apply">Apply Override</button>
        </div>`
      : `<div style="padding:0 16px 16px">
          <div class="edit-hint">
            💡 To enable slot editing, add <strong style="color:var(--text-bright)">entry_id</strong>
            to your card config. Find it in Settings → Devices & Services → EMS → (⋮) → Information.
          </div>
        </div>`;

    this.shadowRoot.getElementById('popup').innerHTML = `
      <div class="ph">
        <div class="ph-nav">
          <button class="ph-nav-btn" id="pop-prev" ${i===0?'disabled':''}>‹</button>
          <div>
            <div class="ph-title">Slot Details</div>
            <div class="ph-time">${slotTimeStr(slot)} – ${slotEndTimeStr(slots, i)}</div>
          </div>
          <button class="ph-nav-btn" id="pop-next" ${i===n-1?'disabled':''}>›</button>
        </div>
        <button class="ph-close" id="pop-close">✕</button>
      </div>

      <div class="pop-nav-wrap">
        <div class="pop-nav-label">Jump to slot</div>
        <div class="pop-nav-track" id="pop-nav-track">
          <div class="pop-nav-segs">${navSegs}</div>
          <div class="pop-nav-dots">${navDots}</div>
          <div class="pop-nav-cursor" style="left:${(i+0.5)/n*100}%"></div>
          <div class="pop-nav-now"    style="left:${ns>=0?(ns+0.5)/n*100:50}%;${ns<0?'display:none':''}"></div>
        </div>
      </div>

      <div class="price-trio">${trioHtml}</div>

      <div class="pop-detail">
        <div class="pop-section-title">Slot Info</div>
        <div class="pop-row">
          <span class="pop-row-label">Battery SoC</span>
          <span class="pop-row-value">${slot.battery_soc_predicted_pct ?? '–'} %</span>
        </div>
        <div class="pop-row">
          <span class="pop-row-label">Action</span>
          <span class="pop-row-value" style="color:${act.color}">${act.label}${slot.battery_manual_override_w != null ? ' (' + slot.battery_manual_override_w + ' W)' : ''}</span>
        </div>
        <div class="pop-row">
          <span class="pop-row-label">Solar pred.</span>
          <span class="pop-row-value">${slot.solar_wh_predicted != null ? slot.solar_wh_predicted + ' Wh' : '–'}</span>
        </div>
        <div style="margin-top:10px">
          <div class="pop-section-title">Devices</div>
          ${devHtml}
        </div>
      </div>

      ${editHtml}`;

    // Wire up popup events
    const sr = this.shadowRoot;
    sr.getElementById('pop-close').addEventListener('click', () => this._closePopup());
    sr.getElementById('pop-prev').addEventListener('click', e => { e.stopPropagation(); this._navigateSlot(i-1); });
    sr.getElementById('pop-next').addEventListener('click', e => { e.stopPropagation(); this._navigateSlot(i+1); });

    sr.querySelectorAll('.pop-nav-seg').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); this._navigateSlot(+el.dataset.i); });
    });
    sr.querySelectorAll('.pt-slot.nav[data-nav]').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); this._navigateSlot(+el.dataset.nav); });
    });

    if (hasEntry) {
      sr.getElementById('edit-apply')?.addEventListener('click', e => {
        e.stopPropagation();
        this._applyBatteryOverride(slot, sr.getElementById('edit-bat-w')?.value);
      });
      sr.getElementById('edit-bat-w')?.addEventListener('click', e => e.stopPropagation());
    }
  }

  // ── Service call ───────────────────────────────────────────────────────────
  _applyBatteryOverride(slot, rawValue) {
    if (!this._hass || !this._config.entry_id) return;
    const watts = rawValue === '' || rawValue == null ? null : parseFloat(rawValue);
    const serviceData = {
      entry_id: this._config.entry_id,
      time:     slot.time,
    };
    if (watts !== null && !isNaN(watts)) serviceData.battery_wattage_w = watts;
    this._hass.callService('ha_ems', 'edit_schedule', serviceData)
      .then(() => {
        // Briefly flash the button green to indicate success
        const btn = this.shadowRoot.getElementById('edit-apply');
        if (btn) { btn.textContent = '✓ Applied'; btn.style.background = '#16a34a'; }
      })
      .catch(err => {
        const btn = this.shadowRoot.getElementById('edit-apply');
        if (btn) { btn.textContent = '✕ Error'; btn.style.background = '#dc2626'; console.error('EMS card error:', err); }
      });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  _onKey(e) {
    const overlay = this.shadowRoot?.getElementById('overlay');
    if (!overlay?.classList.contains('open')) return;
    if (e.key === 'Escape')     this._closePopup();
    if (e.key === 'ArrowLeft')  this._navigateSlot(this._activeIdx - 1);
    if (e.key === 'ArrowRight') this._navigateSlot(this._activeIdx + 1);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey.bind(this));
  }
}

customElements.define('ems-dashboard-card', EmsDashboardCard);

// ── Card editor ───────────────────────────────────────────────────────────────
// Uses HA's native ha-form with type:'expandable' sections — this is the only
// reliable pattern; custom innerHTML editors often fail HA's editor detection.

const EDITOR_SCHEMA = [
  {
    name: 'entity',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'entry_id',
    selector: { text: {} },
  },
  {
    type: 'expandable',
    name: 'price',
    title: 'Price',
    icon: 'mdi:lightning-bolt',
    schema: [
      { name: 'entity',              selector: { entity: {} } },
      { name: 'attribute',           selector: { text: {} } },
      { name: 'start_key',           selector: { text: {} } },
      { name: 'price_key',           selector: { text: {} } },
      { name: 'injection_price_key', selector: { text: {} } },
    ],
  },
  {
    type: 'expandable',
    name: 'layout',
    title: 'Layout',
    icon: 'mdi:view-dashboard-outline',
    schema: [
      { name: 'theme',        selector: { select: { options: [
        { value: 'dark',   label: 'Dark' },
        { value: 'light',  label: 'Light' },
        { value: 'system', label: 'System (follow OS)' },
        { value: 'ha',     label: 'Home Assistant (follow card theme)' },
      ] } } },
      { name: 'day',          selector: { select: { options: [
        { value: 'today',    label: 'Today' },
        { value: 'tomorrow', label: 'Tomorrow' },
      ], custom_value: false } } },
      { name: 'show_stats',        selector: { boolean: {} } },
      { name: 'show_brush',        selector: { boolean: {} } },
      { name: 'show_header',       selector: { boolean: {} } },
      { name: 'show_chart',        selector: { boolean: {} } },
      { name: 'show_actions',      selector: { boolean: {} } },
      { name: 'show_price_legend',  selector: { boolean: {} } },
      { name: 'show_action_legend', selector: { boolean: {} } },
    ],
  },
  {
    type: 'expandable',
    name: 'advanced',
    title: 'Advanced',
    icon: 'mdi:cog-outline',
    schema: [
      { name: 'debug', selector: { boolean: {} } },
    ],
  },
];

function _editorLabel(schema) {
  if (schema.name === 'entity') {
    return schema.selector?.entity?.domain === 'sensor' ? 'EMS Schedule Sensor' : 'Price Entity';
  }
  return {
    entry_id:              'Entry ID',
    attribute:             'Data Attribute',
    start_key:             'Start Key',
    price_key:             'Price Key',
    injection_price_key:   'Injection Price Key (optional)',
    debug:                 'Debug Mode',
    theme:                 'Theme',
    show_brush:            'Show Overview Brush',
    show_header:           'Show Header Title',
    show_stats:            'Show Stats Cards',
    show_chart:            'Show Chart',
    show_actions:          'Show Action Strip',
    show_price_legend:     'Show Price Legend',
    show_action_legend:    'Show Action Legend',
    day:                   'Fixed Day',
  }[schema.name] ?? schema.name;
}

function _editorHelper(schema) {
  return {
    entity:              'Optional — EMS schedule sensor. Only needed when using the full HA-EMS integration.',
    entry_id:            'Optional — enables battery override editing. Find in Settings → Devices & Services → HA-EMS → ⋮ → Information.',
    attribute:           'Attribute on the entity that contains the price list array (e.g. prices_today).',
    start_key:           'Key name for the start time in each price entry (e.g. "start").',
    price_key:           'Key name for the price value in each price entry (e.g. "price").',
    injection_price_key: 'Optional. Key name for the injection (sell-back) price per entry. Displayed separately — not added to the buy price.',
    debug:               'Show debug panel below the chart with entity state, attribute info, and a data table.',
    theme:               'Colour scheme: Dark (default), Light, System (follow OS), or Home Assistant (uses your HA card theme).',
    show_brush:          'Show the colour overview bar below the chart (default: true).',
    show_header:         'Show the EMS Schedule header title (default: true).',
    show_stats:          'Show the stats cards (Current, Min/Avg/Max) above the chart (default: true).',
    show_chart:          'Show the bar chart. When hidden, clicking the brush opens the slot popup instead (default: true).',
    show_actions:        'Show the action colour strip below the bars (default: true).',
    show_price_legend:   'Show the price colour legend below the chart (default: true).',
    show_action_legend:  'Show the action colour legend below the chart (default: true).',
    day:                 'Fix the displayed day. When set, the Today/Tomorrow buttons are hidden.',
  }[schema.name] ?? '';
}

class EmsDashboardCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass   = null;
    this._form   = null;
  }

  // Called by HA before the element is attached to DOM, so we must not rely
  // on connectedCallback having already fired — _buildForm() is idempotent.
  setConfig(config) {
    this._config = config || {};
    this._buildForm();
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    this._sync();
  }

  // Also build on connectedCallback in case HA attaches before calling setConfig.
  connectedCallback() {
    this._buildForm();
    this._sync();
  }

  _buildForm() {
    if (this._form) return;

    this.shadowRoot.innerHTML =
      '<style>:host{display:block} ha-form{display:block;padding:4px 0}</style>';

    const form = document.createElement('ha-form');
    form.schema        = EDITOR_SCHEMA;
    form.computeLabel  = _editorLabel;
    form.computeHelper = _editorHelper;

    form.addEventListener('value-changed', e => {
      this._config = e.detail.value;
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }));
    });

    this.shadowRoot.appendChild(form);
    this._form = form;
  }

  _sync() {
    if (!this._form) return;
    if (this._hass) this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

customElements.define('ems-dashboard-card-editor', EmsDashboardCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'ems-dashboard-card',
  name:        'EMS Dashboard Card',
  description: 'Energy Management System — price chart, action strip & schedule editor',
  preview:     false,
});


