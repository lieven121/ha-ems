import { Slot, CardConfig } from '../shared/types';
import { priceColor, slotAction, slotTimeStr, slotEndTimeStr } from '../shared/utils';

interface SlotClipboard {
  action: string;
  locked: boolean;
  chargeW: number;
  chargeUntilPct: number | null;
  dischargeW: number;
  dischargeUntilPct: number | null;
  netMaxW: number | null;
  netUseSolar: boolean;
  carUseSolar: boolean;
  carNetOn: boolean;
  carNetW: number;
  carBatOn: boolean;
  carBatW: number;
  carBatUntilPct: number | null;
}

let _clipboard: SlotClipboard | null = null;

const ACTION_LABELS: Record<string, string> = {
  idle: 'Idle', charge: 'Charge', discharge: 'Discharge', use_net: 'Use Net', car_charge: 'Car Charge',
};

export interface DialogContext {
  sr: ShadowRoot;
  slots: Slot[];
  slotIdx: number;
  nowIdx: number;
  config: CardConfig;
  hass: any;
  kwpEntityId: string | null;
  devColors: Record<string, string>;
  onClose: () => void;
  onNavigate: (i: number) => void;
}

export function renderPopup(ctx: DialogContext): void {
  const { sr, slots, config, hass, kwpEntityId, devColors } = ctx;
  const i = ctx.slotIdx;
  const n = slots.length;
  const slot = slots[i];
  const ns = ctx.nowIdx;
  const act = slotAction(slot);
  const entryId  = config.integration?.entry_id;
  const deviceId = config.integration?.device_id;

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
  const trio = [{label:'Prev',idx:i-1},{label:'Now',idx:i,cur:true},{label:'Next',idx:i+1}] as any[];
  const trioHtml = trio.map(({label, idx, cur}: any, ti: number) => {
    const arrow = ti < 2 ? `<div class="pt-arrow">›</div>` : '';
    const isNav = !cur && idx >= 0 && idx < n;
    const isNow = idx === ns;
    if (idx < 0 || idx >= n) return `<div class="pt-slot${cur?' cur':''}${isNow?' is-now':''}">\
      <div class="pt-label">${label}</div><div class="pt-time">–</div>\
      <div class="pt-price" style="color:#4a5568">–</div></div>${arrow}`;
    const p = slots[idx].price, c = priceColor(p), w = Math.min(100, Math.max(5, p/52*100));
    const injLine = cur && slots[idx]._injPrice ? `<div class="pt-inj">↑ ${slots[idx]._injPrice!.toFixed(2)} <span class="pt-unit">ct</span></div>` : '';
    return `<div class="pt-slot${cur?' cur':''}${isNav?' nav':''}${isNow?' is-now':''}"${isNav?` data-nav="${idx}"`:''}
      title="${isNav?'Click to navigate':''}">
      <div class="pt-label">${label}</div>
      <div class="pt-time">${slotTimeStr(slots[idx])}</div>
      <div class="pt-price" style="color:${c}">${p.toFixed(2)}<span class="pt-unit">ct</span></div>
      ${injLine}
      <div class="pt-bar" style="background:${c};width:${w}%"></div>
    </div>${arrow}`;
  }).join('');

  // Devices
  const devHtml = (slot.devices || []).length
    ? `<div class="device-list">${slot.devices!.map(d => `
        <div class="device-item">
          <div class="device-dot" style="background:${devColors[d.name]||'#3b82f6'}"></div>
          <div class="device-name">${d.name}</div>
          <div class="device-watt">${d.manual_override_w ?? d.allocated_wattage_w} W</div>
        </div>`).join('')}</div>`
    : `<div style="font-family:var(--code-font-family, monospace);font-size:10px;color:var(--text-dim);margin-top:4px">No devices scheduled</div>`;

  // Action editor
  const curAction = slot.action || (slot.battery_manual_override_w! > 0 ? 'charge' : slot.battery_manual_override_w! < 0 ? 'discharge' : 'idle');
  const aCfg = slot.action_config || {};
  const kwpW = Math.round((parseFloat(hass?.states[kwpEntityId!]?.state) || 3) * 1000);
  const editHtml = (deviceId || entryId) ? (() => {
    const actions = [
      { key: 'idle',       label: 'Idle',       color: '#374151' },
      { key: 'charge',     label: 'Charge',     color: '#16a34a' },
      { key: 'use_net',    label: 'Use Net',    color: '#2563eb' },
      { key: 'discharge',  label: 'Discharge',  color: '#dc2626' },
      { key: 'car_charge', label: 'Car Charge', color: '#ca8a04' },
    ];
    const actionBtns = actions.map(a =>
      `<button class="ap-btn${curAction === a.key ? ' sel' : ''}" data-action="${a.key}" style="--btn-c:${a.color}">
        <div class="ap-dot" style="background:${a.color}"></div>${a.label}
      </button>`
    ).join('');

    const chargeW = curAction === 'charge' ? (aCfg.wattage ?? kwpW) : kwpW;
    const dischargeW = curAction === 'discharge' ? (aCfg.wattage ?? kwpW) : kwpW;
    const netW = curAction === 'use_net' ? (aCfg.max_wattage ?? kwpW) : kwpW;
    const solarOnUseNet = curAction === 'use_net' ? (aCfg.use_solar !== false) : true;
    const solarOnCar = curAction === 'car_charge' ? (aCfg.use_solar !== false) : true;
    const carNetOn = curAction === 'car_charge' && (aCfg.use_net_wattage ?? 0) > 0;
    const carNetW = curAction === 'car_charge' ? (aCfg.use_net_wattage ?? kwpW) : kwpW;
    const carBatOn = curAction === 'car_charge' && (aCfg.use_battery_wattage ?? 0) > 0;
    const carBatW = curAction === 'car_charge' ? (aCfg.use_battery_wattage ?? kwpW) : kwpW;
    const carBatUntil = curAction === 'car_charge' ? (aCfg.use_battery_until_pct ?? '') : '';

    return `<div class="action-section" id="action-section">
      <div class="action-section-title">Plan Action</div>
      <div class="action-editor">
        <div class="ap-grid">${actionBtns}</div>
        <div class="params-panel">
          <div class="action-params" id="params-charge" style="${curAction === 'charge' ? '' : 'display:none'}">
            <div class="param-row">
              <span class="param-label">Power</span>
              <input class="param-input" id="param-charge-w" type="number" min="0" max="100000" step="100" value="${chargeW}">
              <span class="param-unit">W</span>
            </div>
            <div class="param-row">
              <span class="param-label">Until %<span class="param-optional">opt</span></span>
              <input class="param-input" id="param-charge-until" type="number" min="0" max="100" step="1" value="${curAction === 'charge' ? (aCfg.until_pct ?? '') : ''}">
              <span class="param-unit">%</span>
            </div>
          </div>
          <div class="action-params" id="params-discharge" style="${curAction === 'discharge' ? '' : 'display:none'}">
            <div class="param-row">
              <span class="param-label">Power</span>
              <input class="param-input" id="param-discharge-w" type="number" min="0" max="100000" step="100" value="${dischargeW}">
              <span class="param-unit">W</span>
            </div>
            <div class="param-row">
              <span class="param-label">Until %<span class="param-optional">opt</span></span>
              <input class="param-input" id="param-discharge-until" type="number" min="0" max="100" step="1" value="${curAction === 'discharge' ? (aCfg.until_pct ?? '') : ''}">
              <span class="param-unit">%</span>
            </div>
          </div>
          <div class="action-params" id="params-use_net" style="${curAction === 'use_net' ? '' : 'display:none'}">
            <div class="param-row">
              <span class="param-label">Max draw<span class="param-optional">opt</span></span>
              <input class="param-input" id="param-usenet-max" type="number" min="0" max="100000" step="100" value="${netW}">
              <span class="param-unit">W</span>
            </div>
            <button class="toggle-btn${solarOnUseNet ? ' on' : ''}" id="param-usenet-solar" style="--tc:#f59e0b">
              <div class="toggle-btn-dot"></div>☀ Use Solar
            </button>
          </div>
          <div class="action-params" id="params-car_charge" style="${curAction === 'car_charge' ? '' : 'display:none'}">
            <button class="toggle-btn${solarOnCar ? ' on' : ''}" id="param-car-solar" style="--tc:#f59e0b">
              <div class="toggle-btn-dot"></div>☀ Use Solar
            </button>
            <div class="watt-card${carNetOn ? ' on' : ''}" id="wc-car-net" style="--wc-c:#2563eb">
              <div class="watt-card-header">
                <div class="watt-card-dot"></div>
                <span class="watt-card-label">Net Grid</span>
              </div>
              <div class="watt-card-input-wrap">
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Wattage</span>
                  <input class="param-input" id="param-car-net-w" type="number" min="0" max="100000" step="100" value="${carNetW}">
                  <span class="param-unit">W</span>
                </div>
              </div>
            </div>
            <div class="watt-card${carBatOn ? ' on' : ''}" id="wc-car-bat" style="--wc-c:#7c3aed">
              <div class="watt-card-header">
                <div class="watt-card-dot"></div>
                <span class="watt-card-label">Battery</span>
              </div>
              <div class="watt-card-input-wrap">
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Wattage</span>
                  <input class="param-input" id="param-car-bat-w" type="number" min="0" max="100000" step="100" value="${carBatW}">
                  <span class="param-unit">W</span>
                </div>
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Until %<span class="param-optional">opt</span></span>
                  <input class="param-input" id="param-car-bat-until" type="number" min="0" max="100" step="1" value="${carBatUntil}">
                  <span class="param-unit">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="action-locked-row">
        <input type="checkbox" id="action-locked" ${slot.locked ? 'checked' : ''}>
        <span class="action-locked-label">Locked (prevent auto-replanning)</span>
      </div>
      <div class="action-btn-row">
        <button class="action-apply-btn" id="action-apply">Apply</button>
        <button class="action-copy-btn" id="action-copy" title="Copy slot config"><ha-icon icon="mdi:content-copy"></ha-icon></button>
        <button class="action-paste-btn" id="action-paste" ${_clipboard ? '' : 'disabled'} title="${_clipboard ? `Paste &amp; Save (${ACTION_LABELS[_clipboard.action] ?? _clipboard.action})` : 'Paste &amp; Save'}"><ha-icon icon="mdi:content-paste"></ha-icon></button>
      </div>
    </div>`;
  })() : `<div style="padding:0 16px 16px">
    <div class="edit-hint">
      💡 To enable slot editing, configure <strong style="color:var(--text-bright)">integration.device_id</strong>
      (or legacy <strong style="color:var(--text-bright)">integration.entry_id</strong>)
      in your card config. Find it in Settings → Devices &amp; Services → EMS → (⋮) → Information.
    </div>
  </div>`;

  sr.getElementById('popup')!.innerHTML = `
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
      ${slot._injPrice ? `<div class="pop-row">
        <span class="pop-row-label">Injection</span>
        <span class="pop-row-value" style="color:var(--text-dim)">↑ ${slot._injPrice.toFixed(2)} ct</span>
      </div>` : ''}
      ${slot.battery_prediction != null ? `<div class="pop-row">
        <span class="pop-row-label">Predicted Battery</span>
        <span class="pop-row-value">${slot.battery_prediction!.toFixed(1)} %</span>
      </div>` : ''}
      ${slot.locked ? `<div class="pop-row">
        <span class="pop-row-label">Locked</span>
        <span class="pop-row-value">🔒 Yes</span>
      </div>` : ''}
      ${ /* solar_wh_predicted — will be added in future */ '' }
    </div>

    ${config.layout?.show_actions !== false ? editHtml : ''}`;

  // Wire up popup events
  sr.getElementById('pop-close')!.addEventListener('click', () => ctx.onClose());
  sr.getElementById('pop-prev')!.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(i-1); });
  sr.getElementById('pop-next')!.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(i+1); });

  sr.querySelectorAll('.pop-nav-seg').forEach(el => {
    el.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(+(el as HTMLElement).dataset.i!); });
  });
  sr.querySelectorAll('.pt-slot.nav[data-nav]').forEach(el => {
    el.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(+(el as HTMLElement).dataset.nav!); });
  });

  if (deviceId || entryId) {
    let selAction = curAction;

    const showParams = (action: string) => {
      ['charge', 'discharge', 'use_net', 'car_charge'].forEach(a => {
        const el = sr.getElementById(`params-${a}`) as HTMLElement | null;
        if (el) el.style.display = a === action ? '' : 'none';
      });
    };

    sr.querySelectorAll('.ap-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        selAction = (btn as HTMLElement).dataset.action!;
        sr.querySelectorAll('.ap-btn[data-action]').forEach(b => b.classList.toggle('sel', b === btn));
        showParams(selAction);
      });
    });

    sr.querySelectorAll('.param-input, #action-locked').forEach(el => {
      el.addEventListener('click', (e: Event) => e.stopPropagation());
    });

    // Toggle buttons (use solar)
    const solarToggleIds = ['param-usenet-solar', 'param-car-solar'];
    solarToggleIds.forEach(id => {
      const btn = sr.getElementById(id);
      if (btn) btn.addEventListener('click', (e: Event) => { e.stopPropagation(); btn.classList.toggle('on'); });
    });

    // Watt-cards (car net / car battery)
    ['wc-car-net', 'wc-car-bat'].forEach(id => {
      const card = sr.getElementById(id);
      if (!card) return;
      card.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        card.classList.toggle('on');
      });
      card.querySelectorAll('input').forEach(inp => inp.addEventListener('click', (e: Event) => e.stopPropagation()));
    });

    sr.getElementById('action-apply')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      const lockedValue = (sr.getElementById('action-locked') as HTMLInputElement)?.checked ?? false;
      const slotTime    = slot.start ?? slot.time;
      const commonData  = { device_id: deviceId || entryId, time: slotTime, locked: lockedValue };

      let svcPromise: Promise<any> | undefined;
      if (selAction === 'idle') {
        svcPromise = hass.callService('ha_ems', 'planning_idle', commonData);
      } else if (selAction === 'charge') {
        const watts    = (() => { const v = parseFloat((sr.getElementById('param-charge-w') as HTMLInputElement)?.value); return isNaN(v) ? kwpW : v; })();
        const untilRaw = (sr.getElementById('param-charge-until') as HTMLInputElement)?.value;
        const untilPct = untilRaw ? parseFloat(untilRaw) : null;
        svcPromise = hass.callService('ha_ems', 'planning_charge',
          { ...commonData, wattage: watts, ...(untilPct != null ? { until_pct: untilPct } : {}) });
      } else if (selAction === 'discharge') {
        const watts    = (() => { const v = parseFloat((sr.getElementById('param-discharge-w') as HTMLInputElement)?.value); return isNaN(v) ? kwpW : v; })();
        const untilRaw = (sr.getElementById('param-discharge-until') as HTMLInputElement)?.value;
        const untilPct = untilRaw ? parseFloat(untilRaw) : null;
        svcPromise = hass.callService('ha_ems', 'planning_discharge',
          { ...commonData, wattage: watts, ...(untilPct != null ? { until_pct: untilPct } : {}) });
      } else if (selAction === 'use_net') {
        const maxRaw   = (sr.getElementById('param-usenet-max') as HTMLInputElement)?.value;
        const maxWatts = maxRaw !== '' ? parseFloat(maxRaw) : null;
        const useSolar = sr.getElementById('param-usenet-solar')?.classList.contains('on') ?? true;
        svcPromise = hass.callService('ha_ems', 'planning_use_net',
          { ...commonData, use_solar: useSolar, ...(maxWatts != null ? { max_wattage: maxWatts } : {}) });
      } else if (selAction === 'car_charge') {
        const useSolar   = sr.getElementById('param-car-solar')?.classList.contains('on') ?? true;
        const netCardOn  = sr.getElementById('wc-car-net')?.classList.contains('on') ?? false;
        const batCardOn  = sr.getElementById('wc-car-bat')?.classList.contains('on') ?? false;
        const netW2      = netCardOn ? ((() => { const v = parseFloat((sr.getElementById('param-car-net-w') as HTMLInputElement)?.value); return isNaN(v) ? 0 : v; })()) : 0;
        const batW2      = batCardOn ? ((() => { const v = parseFloat((sr.getElementById('param-car-bat-w') as HTMLInputElement)?.value); return isNaN(v) ? 0 : v; })()) : 0;
        const batUntilR  = (sr.getElementById('param-car-bat-until') as HTMLInputElement)?.value;
        const batUntil   = (batCardOn && batUntilR) ? parseFloat(batUntilR) : null;
        svcPromise = hass.callService('ha_ems', 'planning_car_charge_slot', {
          ...commonData,
          use_solar: useSolar,
          use_net_wattage:     netW2,
          use_battery_wattage: batW2,
          ...(batUntil != null ? { use_battery_until_pct: batUntil } : {}),
        });
      }

      const applyBtn = sr.getElementById('action-apply') as HTMLButtonElement | null;
      if (svcPromise) {
        svcPromise.then(() => {
          if (applyBtn) { applyBtn.textContent = '✓ Applied'; applyBtn.classList.add('success'); }
          setTimeout(() => { if (applyBtn) { applyBtn.textContent = 'Apply'; applyBtn.classList.remove('success'); } }, 2000);
        }).catch((err: any) => {
          if (applyBtn) { applyBtn.textContent = '✕ Error'; applyBtn.classList.add('error'); console.error('EMS card error:', err); }
        });
      }
    });

    // Copy: snapshot the current form state into the module-level clipboard
    sr.getElementById('action-copy')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      const numVal = (id: string, fallback: number) => {
        const v = parseFloat((sr.getElementById(id) as HTMLInputElement)?.value);
        return isNaN(v) ? fallback : v;
      };
      const optNumVal = (id: string): number | null => {
        const v = (sr.getElementById(id) as HTMLInputElement)?.value;
        return v !== '' ? parseFloat(v) : null;
      };
      _clipboard = {
        action:           selAction,
        locked:           (sr.getElementById('action-locked') as HTMLInputElement)?.checked ?? false,
        chargeW:          numVal('param-charge-w', kwpW),
        chargeUntilPct:   optNumVal('param-charge-until'),
        dischargeW:       numVal('param-discharge-w', kwpW),
        dischargeUntilPct: optNumVal('param-discharge-until'),
        netMaxW:          optNumVal('param-usenet-max'),
        netUseSolar:      sr.getElementById('param-usenet-solar')?.classList.contains('on') ?? true,
        carUseSolar:      sr.getElementById('param-car-solar')?.classList.contains('on') ?? true,
        carNetOn:         sr.getElementById('wc-car-net')?.classList.contains('on') ?? false,
        carNetW:          numVal('param-car-net-w', kwpW),
        carBatOn:         sr.getElementById('wc-car-bat')?.classList.contains('on') ?? false,
        carBatW:          numVal('param-car-bat-w', kwpW),
        carBatUntilPct:   optNumVal('param-car-bat-until'),
      };
      // Enable paste button and update its tooltip
      const pasteBtn = sr.getElementById('action-paste') as HTMLButtonElement | null;
      if (pasteBtn) {
        pasteBtn.removeAttribute('disabled');
        pasteBtn.title = `Paste & Save (${ACTION_LABELS[selAction] ?? selAction})`;
      }
      const copyBtn = sr.getElementById('action-copy') as HTMLButtonElement | null;
      if (copyBtn) {
        copyBtn.classList.add('success');
        setTimeout(() => copyBtn.classList.remove('success'), 1500);
      }
    });

    // Paste: load clipboard into form and auto-save
    sr.getElementById('action-paste')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      if (!_clipboard) return;
      const cb = _clipboard;

      // Update action selection
      selAction = cb.action;
      sr.querySelectorAll('.ap-btn[data-action]').forEach(b =>
        b.classList.toggle('sel', (b as HTMLElement).dataset.action === selAction)
      );
      showParams(selAction);

      // Fill form values
      const setVal = (id: string, val: number | null | '') => {
        const el = sr.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = val != null ? String(val) : '';
      };
      const setToggle = (id: string, on: boolean) => {
        sr.getElementById(id)?.classList.toggle('on', on);
      };
      setVal('param-charge-w',        cb.chargeW);
      setVal('param-charge-until',    cb.chargeUntilPct);
      setVal('param-discharge-w',     cb.dischargeW);
      setVal('param-discharge-until', cb.dischargeUntilPct);
      setVal('param-usenet-max',      cb.netMaxW);
      setToggle('param-usenet-solar', cb.netUseSolar);
      setToggle('param-car-solar',    cb.carUseSolar);
      setToggle('wc-car-net',         cb.carNetOn);
      setVal('param-car-net-w',       cb.carNetW);
      setToggle('wc-car-bat',         cb.carBatOn);
      setVal('param-car-bat-w',       cb.carBatW);
      setVal('param-car-bat-until',   cb.carBatUntilPct);
      const lockedChk = sr.getElementById('action-locked') as HTMLInputElement | null;
      if (lockedChk) lockedChk.checked = cb.locked;

      // Auto-save
      const slotTime   = slot.start ?? slot.time;
      const commonData = { device_id: deviceId || entryId, time: slotTime, locked: cb.locked };
      let svcPromise2: Promise<any> | undefined;
      if (cb.action === 'idle') {
        svcPromise2 = hass.callService('ha_ems', 'planning_idle', commonData);
      } else if (cb.action === 'charge') {
        svcPromise2 = hass.callService('ha_ems', 'planning_charge',
          { ...commonData, wattage: cb.chargeW, ...(cb.chargeUntilPct != null ? { until_pct: cb.chargeUntilPct } : {}) });
      } else if (cb.action === 'discharge') {
        svcPromise2 = hass.callService('ha_ems', 'planning_discharge',
          { ...commonData, wattage: cb.dischargeW, ...(cb.dischargeUntilPct != null ? { until_pct: cb.dischargeUntilPct } : {}) });
      } else if (cb.action === 'use_net') {
        svcPromise2 = hass.callService('ha_ems', 'planning_use_net',
          { ...commonData, use_solar: cb.netUseSolar, ...(cb.netMaxW != null ? { max_wattage: cb.netMaxW } : {}) });
      } else if (cb.action === 'car_charge') {
        svcPromise2 = hass.callService('ha_ems', 'planning_car_charge_slot', {
          ...commonData,
          use_solar:           cb.carUseSolar,
          use_net_wattage:     cb.carNetOn ? cb.carNetW : 0,
          use_battery_wattage: cb.carBatOn ? cb.carBatW : 0,
          ...(cb.carBatOn && cb.carBatUntilPct != null ? { use_battery_until_pct: cb.carBatUntilPct } : {}),
        });
      }
      const pasteBtn2 = sr.getElementById('action-paste') as HTMLButtonElement | null;
      if (svcPromise2) {
        svcPromise2.then(() => {
          if (pasteBtn2) { pasteBtn2.classList.add('success'); }
          setTimeout(() => { if (pasteBtn2) pasteBtn2.classList.remove('success'); }, 2000);
        }).catch((err: any) => {
          if (pasteBtn2) { pasteBtn2.classList.add('error'); console.error('EMS card error:', err); }
        });
      }
    });
  }
}
