import { CSS } from '../shared/styles';
import { CHART_H, DEVICE_PALETTE } from '../shared/constants';
import { Slot, CardConfig } from '../shared/types';
import { localDateStr, slotAction, slotTimeStr, priceColor } from '../shared/utils';
import { renderMainChart, renderBatteryOverlay, renderBrush, scrollToSlot } from './dashboard-graph';
import { DialogContext, renderPopup } from './dashboard-dialog';

export class EmsDashboardCard extends HTMLElement {
  private _slots: Slot[];
  private _filteredSlots: Slot[];
  private _days: { date: string; slots: Slot[] }[];
  private _dayIdx: number;
  private _activeIdx: number | null;
  private _devColors: Record<string, string>;
  private _lastSer: string;
  private _config: CardConfig;
  private _hass: any;
  private _initialScroll: boolean;
  private _planningEntityId: string | null;
  private _kwpEntityId: string | null;
  private _entityRegistry: any;

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
    this._planningEntityId = null;
    this._kwpEntityId      = null;
    this._entityRegistry   = null;
  }

  setConfig(config: CardConfig) {
    if (!config.entity && !config.price?.entity)
      throw new Error('ems-dashboard-card: set entity or price.entity');
    this._config = config;
    this._buildDOM();
  }

  set hass(hass: any) {
    this._hass = hass;
    const deviceId = this._config?.integration?.device_id;
    if (deviceId && !this._planningEntityId) {
      this._resolveDeviceEntities(deviceId);
    }
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

  async _resolveDeviceEntities(deviceId: string) {
    if (!this._hass) return;
    try {
      if (!this._entityRegistry) {
        this._entityRegistry = await this._hass.callWS({ type: 'config/entity_registry/list' });
      }
      const entry = (this._entityRegistry || []).find(
        (e: any) => e.device_id === deviceId && e.entity_id.includes('ems_planning')
      );
      if (entry) this._planningEntityId = entry.entity_id;

      const kwpEntry = (this._entityRegistry || []).find(
        (e: any) => e.device_id === deviceId && e.entity_id.includes('ems_kwp')
      );
      if (kwpEntry) this._kwpEntityId = kwpEntry.entity_id;
    } catch (err) {
      // Non-fatal: falls back to planning_entity config key / hardcoded default
    }
  }

  _buildSlots(hass: any): Slot[] {
    const pCfg  = this._config.price;
    const iCfg  = this._config.integration;

    let slots: Slot[] = [];
    if (pCfg?.entity) {
      const stateObj = hass.states[pCfg.entity];
      if (!stateObj) return [];
      const list     = stateObj.attributes[pCfg.attribute || 'prices_today'] ?? [];
      const startKey = pCfg.start_key           || 'start';
      const priceKey = pCfg.price_key           || 'price';
      const injKey   = pCfg.injection_price_key || null;
      slots = list.map((entry: any) => {
        const base = parseFloat(entry[priceKey]) || 0;
        const inj  = injKey ? (parseFloat(entry[injKey]) || 0) : 0;
        return {
          time:      entry[startKey],
          start:     entry[startKey],
          price:     base,
          _injPrice: inj,
          action:    'idle',
          locked:    false,
          action_config: {},
          car:       {},
          battery_prediction: null,
        };
      });
    } else if (this._config.entity) {
      const stateObj = hass.states[this._config.entity];
      slots = stateObj?.attributes?.schedule ?? [];
    }

    const planEntity = this._planningEntityId || iCfg?.planning_entity;
    if (planEntity && slots.length > 0) {
      const planState = hass.states[planEntity];
      const planList  = planState?.attributes?.planning ?? [];
      if (planList.length > 0) {
        const planMap: Record<number, any> = {};
        for (const p of planList) {
          const ts = new Date(p.start).getTime();
          if (!isNaN(ts)) planMap[ts] = p;
        }
        slots = slots.map(slot => {
          const ts = new Date(slot.start ?? slot.time!).getTime();
          const p  = isNaN(ts) ? null : planMap[ts];
          if (!p) return slot;
          return {
            ...slot,
            action:             p.action        ?? slot.action,
            locked:             p.locked        ?? slot.locked,
            action_config:      p.action_config ?? slot.action_config,
            car:                p.car           ?? slot.car,
            battery_prediction: p.battery_prediction ?? slot.battery_prediction,
            price:     slot.price || p.price || 0,
            _injPrice: slot._injPrice || p.injection_price || 0,
          };
        });
      }
    }

    return slots;
  }

  _parseData() {
    const groups: Record<string, Slot[]> = {};
    for (const slot of this._slots) {
      const key = localDateStr(new Date(slot.start ?? slot.time!));
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
    }
    this._days = Object.keys(groups).sort().map(k => ({ date: k, slots: groups[k] }));

    const fixedDay = this._config.layout?.day;
    if (fixedDay) {
      const today    = localDateStr(new Date());
      const tomorrow = localDateStr(new Date(Date.now() + 86400000));
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
    const names = new Set<string>();
    for (const slot of this._filteredSlots)
      for (const d of slot.devices ?? []) names.add(d.name);
    let i = 0;
    const map: Record<string, string> = {};
    for (const n of names) map[n] = DEVICE_PALETTE[i++ % DEVICE_PALETTE.length];
    this._devColors = map;
  }

  _nowSlotIdx(): number {
    const now = new Date();
    const s = this._filteredSlots;
    for (let i = 0; i < s.length; i++) {
      const t0 = new Date(s[i].start ?? s[i].time!);
      const t1 = s[i+1] ? new Date(s[i+1].start ?? s[i+1].time!) : new Date(t0.getTime() + 3600000);
      if (now >= t0 && now < t1) return i;
    }
    return -1;
  }

  _buildDOM() {
    this.shadowRoot!.innerHTML = `
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
                <svg class="battery-svg" id="battery-svg" style="position:absolute;top:0;left:0;width:100%;height:${CHART_H}px;pointer-events:none;overflow:visible;" hidden></svg>
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

    this.shadowRoot!.getElementById('overlay')!.addEventListener('click', (e: Event) => {
      if ((e.target as HTMLElement).id === 'overlay') this._closePopup();
    });
    document.addEventListener('keydown', this._onKey.bind(this));
  }

  _render() {
    const sr = this.shadowRoot;
    if (!sr) return;
    const theme = this._config.layout?.theme || 'dark';
    const root  = sr.querySelector('.root') as HTMLElement;
    root.classList.toggle('theme-light',  theme === 'light');
    root.classList.toggle('theme-system', theme === 'system');
    root.classList.toggle('theme-ha',     theme === 'ha');
    const slots = this._filteredSlots;
    const n     = slots.length;

    // ── Debug panel (only when debug:true) ──────────────────────────────────
    const debugEl = sr.getElementById('debug') as HTMLElement;
    if (this._config.debug || this._config.advanced?.debug) {
      debugEl.hidden = false;
      const pCfg = this._config.price;
      const iCfg = this._config.integration;
      const lines: string[] = [];

      if (pCfg?.entity) {
        const stateObj = this._hass?.states[pCfg.entity];
        lines.push(`<b>price.entity:</b> ${pCfg.entity}`);
        lines.push(`<b>  state exists:</b> ${!!stateObj}`);
        if (stateObj) {
          const attrKey = pCfg.attribute || 'prices_today';
          const raw = stateObj.attributes[attrKey];
          lines.push(`<b>  attribute "${attrKey}":</b> ${raw !== undefined ? (Array.isArray(raw) ? `array[${raw.length}]` : typeof raw) : 'missing'}`);
          if (Array.isArray(raw) && raw.length > 0) {
            lines.push(`<b>  first entry keys:</b> ${Object.keys(raw[0]).join(', ')}`);
            lines.push(`<b>  first entry:</b> ${JSON.stringify(raw[0])}`);
          }
        }
      } else if (this._config.entity) {
        const stateObj = this._hass?.states[this._config.entity];
        lines.push(`<b>entity:</b> ${this._config.entity}`);
        lines.push(`<b>  state exists:</b> ${!!stateObj}`);
        if (stateObj) {
          const schedule = stateObj.attributes.schedule;
          lines.push(`<b>  schedule attribute:</b> ${Array.isArray(schedule) ? `array[${schedule.length}]` : 'missing'}`);
        }
      } else {
        lines.push('<b>⚠ No price entity configured</b>');
      }

      lines.push('');
      const planEntity = this._planningEntityId || iCfg?.planning_entity;
      const deviceId = iCfg?.device_id;
      if (deviceId) {
        lines.push(`<b>integration.device_id:</b> ${deviceId}`);
        lines.push(`<b>  resolved planning entity:</b> ${this._planningEntityId || '(pending…)'}`);
      }
      if (planEntity) {
        const planState = this._hass?.states[planEntity];
        lines.push(`<b>integration.planning_entity (effective):</b> ${planEntity}`);
        lines.push(`<b>  state exists:</b> ${!!planState}`);
        if (planState) {
          const planList = planState.attributes?.planning;
          lines.push(`<b>  state value:</b> ${planState.state}`);
          lines.push(`<b>  planning attribute:</b> ${Array.isArray(planList) ? `array[${planList.length}]` : (planList === undefined ? 'missing' : typeof planList)}`);
          if (Array.isArray(planList) && planList.length > 0) {
            lines.push(`<b>  first slot keys:</b> ${Object.keys(planList[0]).join(', ')}`);
            lines.push(`<b>  first slot:</b> ${JSON.stringify(planList[0])}`);
            if (slots.length > 0) {
              const priceStart  = slots[0].start ?? slots[0].time;
              const planStart   = planList[0].start;
              const priceTs     = new Date(priceStart!).getTime();
              const planTs      = new Date(planStart).getTime();
              lines.push(`<b>  price slot[0].start:</b> "${priceStart}"`);
              lines.push(`<b>  plan  slot[0].start:</b> "${planStart}"`);
              lines.push(`<b>  timestamp match:</b> ${priceTs === planTs} (${priceTs} vs ${planTs})`);
            }
          }
        } else {
          lines.push(`<b>  ⚠ entity not found in hass.states</b>`);
        }
      } else {
        lines.push('<b>integration.planning_entity:</b> not configured (no device_id or planning_entity set)');
      }

      lines.push('');
      lines.push(`<b>parsed slots (this day):</b> ${slots.length}`);
      const actionCounts: Record<string, number> = {};
      for (const s of slots) { const a = (s.action || 'idle'); actionCounts[a] = (actionCounts[a] || 0) + 1; }
      lines.push(`<b>action counts:</b> ${Object.entries(actionCounts).map(([k,v]) => `${k}×${v}`).join(', ') || '–'}`);
      lines.push(`<b>locked slots:</b> ${slots.filter(s => s.locked).length}`);

      const ns2 = this._nowSlotIdx();
      const ACTION_COLORS: Record<string, string> = { idle:'#374151', charge:'#16a34a', discharge:'#dc2626', use_net:'#2563eb', car_charge:'#ca8a04' };
      const tableHtml = slots.length ? `
        <table class="dbg-table">
          <thead><tr><th>Time</th><th>Price</th><th>Action</th><th>Locked</th><th>Battery%</th></tr></thead>
          <tbody>${slots.map((slot, i) => {
            const act = slotAction(slot);
            const col = ACTION_COLORS[act.key] || '#888';
            return `<tr${i === ns2 ? ' class="now"' : ''}>
              <td>${slotTimeStr(slot)}</td>
              <td style="color:${priceColor(slot.price)};font-weight:600">${slot.price.toFixed(2)} ct</td>
              <td style="color:${col};font-weight:600">${act.label}</td>
              <td>${slot.locked ? '🔒' : '–'}</td>
              <td>${slot.battery_prediction != null ? slot.battery_prediction!.toFixed(1) + '%' : '–'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>` : '';
      debugEl.innerHTML = lines.join('\n') + tableHtml;
    } else {
      debugEl.hidden = true;
      debugEl.innerHTML = '';
    }

    // ── Chart ────────────────────────────────────────────────────────────────
    if (!n) {
      sr.getElementById('bars')!.innerHTML = '<div class="empty">No schedule data available</div>';
      sr.getElementById('stats')!.innerHTML = '';
      sr.getElementById('day-btns')!.innerHTML = '';
      return;
    }

    const prices = slots.map(s => s.price);
    const ns     = this._nowSlotIdx();

    // Day buttons — hidden when a fixed day is configured
    const today    = localDateStr(new Date());
    const tomorrow = localDateStr(new Date(Date.now() + 86400000));
    const fixedDay = this._config.layout?.day;
    (sr.getElementById('day-btns') as HTMLElement).hidden = !!fixedDay;
    if (!fixedDay) {
      sr.getElementById('day-btns')!.innerHTML = this._days.map((d, i) => {
        const label = d.date === today ? 'Today' : d.date === tomorrow ? 'Tomorrow' : d.date;
        return `<button class="btn${i === this._dayIdx ? ' active' : ''}" data-day="${i}">${label}</button>`;
      }).join('');
      sr.getElementById('day-btns')!.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._dayIdx        = +(btn as HTMLElement).dataset.day!;
          this._filteredSlots = this._days[this._dayIdx].slots;
          this._buildDevColors();
          this._render();
        });
      });
    }

    renderMainChart(sr, slots, this._config, this._hass, ns, (i) => this._openPopup(i));
    renderBatteryOverlay(sr, slots, this._config, this._hass);

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
              ${hasInj ? `<span class="stat-inj">↑ ${curSlot._injPrice!.toFixed(2)} ct</span>` : ''}
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
      sr.getElementById('stats')!.innerHTML = curCard + mmCard;
      if (ns >= 0) {
        (sr.querySelector('#stats .stat-card') as HTMLElement).style.cursor = 'pointer';
        sr.querySelector('#stats .stat-card')!.addEventListener('click', () => this._openPopup(ns));
      }
    }

    // Legend
    const devNames = Object.keys(this._devColors);
    const showPriceLegend  = this._config.layout?.show_price_legend  !== false;
    const showActionLegend = this._config.layout?.show_action_legend !== false;
    const legendEl = sr.getElementById('legend')!;
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
          ${[{c:'#374151',l:'Idle'},{c:'#16a34a',l:'Charge'},{c:'#2563eb',l:'Use Net'},{c:'#dc2626',l:'Discharge'},{c:'#ca8a04',l:'Car'}]
            .map(e => `<div class="li"><div class="ls" style="background:${e.c}"></div>${e.l}</div>`).join('')}
        </div>
      </div>` : ''}
      ${devNames.length ? `<div>
        <div class="legend-title">Devices</div>
        <div class="legend-items">
          ${devNames.map(n => `<div class="li"><div class="ls" style="background:${this._devColors[n]}"></div>${n}</div>`).join('')}
        </div>
      </div>` : ''}`;
    (legendEl as HTMLElement).hidden = !showPriceLegend && !showActionLegend && !devNames.length;
    (sr.getElementById('action-strip') as HTMLElement).hidden = this._config.layout?.show_actions === false;
    (sr.getElementById('brush-wrap') as HTMLElement).hidden   = this._config.layout?.show_brush === false;
    (sr.querySelector('header') as HTMLElement).hidden        = this._config.layout?.show_header === false;
    (sr.getElementById('chart-card') as HTMLElement).hidden   = this._config.layout?.show_chart === false;
    (sr.getElementById('stats') as HTMLElement).hidden        = this._config.layout?.show_stats === false;
    sr.getElementById('brush-wrap')!.classList.toggle('brush-solo', this._config.layout?.show_chart === false);

    this._renderBrush();
    if (ns >= 0) {
      const isFirst = !this._initialScroll;
      this._initialScroll = true;
      this._scrollToSlot(ns, isFirst);
    }
  }

  _renderBrush() {
    renderBrush(
      this.shadowRoot!,
      this._filteredSlots,
      this._activeIdx,
      this._nowSlotIdx(),
      this._config,
      (i) => this._openPopup(i),
      (i) => this._scrollToSlot(i),
    );
  }

  _scrollToSlot(i: number, instant = false) {
    scrollToSlot(this.shadowRoot!, this._filteredSlots.length, i, instant);
  }

  _openPopup(i: number) {
    this._activeIdx = i;
    this.shadowRoot!.getElementById('tooltip')!.classList.remove('visible');
    this.shadowRoot!.querySelectorAll('.slot').forEach(el =>
      el.classList.toggle('hl', +(el as HTMLElement).dataset.i! === i)
    );
    this._renderBrush();
    this._renderPopup(i);
    this.shadowRoot!.getElementById('overlay')!.classList.add('open');
  }

  _closePopup() {
    this.shadowRoot!.getElementById('overlay')!.classList.remove('open');
    this.shadowRoot!.querySelectorAll('.slot').forEach(el => el.classList.remove('hl'));
    this._activeIdx = null;
    this._renderBrush();
  }

  _navigateSlot(i: number) {
    if (i < 0 || i >= this._filteredSlots.length) return;
    this._activeIdx = i;
    this.shadowRoot!.querySelectorAll('.slot').forEach(el =>
      el.classList.toggle('hl', +(el as HTMLElement).dataset.i! === i)
    );
    this._scrollToSlot(i);
    this._renderPopup(i);
    this._renderBrush();
  }

  _renderPopup(i: number) {
    this._activeIdx = i;
    renderPopup({
      sr: this.shadowRoot!,
      slots: this._filteredSlots,
      slotIdx: i,
      nowIdx: this._nowSlotIdx(),
      config: this._config,
      hass: this._hass,
      kwpEntityId: this._kwpEntityId,
      devColors: this._devColors,
      onClose: () => this._closePopup(),
      onNavigate: (j) => this._navigateSlot(j),
    });
  }

  _onKey(e: KeyboardEvent) {
    const overlay = this.shadowRoot?.getElementById('overlay');
    if (!overlay?.classList.contains('open')) return;
    if (e.key === 'Escape')     this._closePopup();
    if (e.key === 'ArrowLeft')  this._navigateSlot(this._activeIdx! - 1);
    if (e.key === 'ArrowRight') this._navigateSlot(this._activeIdx! + 1);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey.bind(this));
  }
}
