import { DeviceAvailable, Slot, CardConfig } from '../shared/types';
import { priceColor, slotTimeStr } from '../shared/utils';

export interface BulkEditContext {
  sr: ShadowRoot;
  slots: Slot[];
  config: CardConfig;
  hass: any;
  kwpEntityId: string | null;
  planningEntityId: string | null;
  devColors: Record<string, string>;
  onClose: () => void;
  onBack: () => void;
  onApplied: () => void;
}

/** Per-device intent applied to every matched slot. */
type DeviceIntent = 'ignore' | 'on' | 'off';

const MINI_CHART_H = 46;

const DEV_STATE_LABEL: Record<DeviceIntent, string> = {
  ignore: 'unchanged', on: 'schedule', off: 'clear',
};

function snap15(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const snapped = Math.round(m / 15) * 15;
  const finalM = snapped % 60;
  const finalH = h + Math.floor(snapped / 60);
  return `${String(finalH % 24).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
}

function slotToMinutes(slot: Slot): number {
  const d = new Date(slot.start ?? slot.time!);
  return d.getHours() * 60 + d.getMinutes();
}

export function renderBulkEdit(ctx: BulkEditContext): void {
  const { sr, slots, config, hass, kwpEntityId } = ctx;
  const n = slots.length;
  if (n === 0) return;

  const entryId = config.integration?.entry_id;
  const deviceId = config.integration?.device_id;
  const kwpW = Math.round((parseFloat(hass?.states[kwpEntityId!]?.state) || 3) * 1000);

  // Available devices come from the planning entity resolved by the card.
  const planEntity = ctx.planningEntityId || config.integration?.planning_entity;
  const devicesAvailable: DeviceAvailable[] =
    (planEntity ? hass?.states[planEntity]?.attributes?.devices_available : null) ?? [];

  const prices = slots.map(s => s.price);
  const maxP = Math.max(...prices, 45);

  // ── State ────────────────────────────────────────────────────────────────
  let rangeFrom = 0;
  let rangeTo = n - 1;
  let filterMode: 'all' | 'below' | 'above' = 'all';
  let threshold = Math.round((Math.min(...prices) + Math.max(...prices)) / 2 * 10) / 10;
  let selAction = 'idle';
  let isDraggingRange = false;
  let isDraggingThreshold = false;
  const deviceIntents: Record<string, DeviceIntent> = {};
  const deviceWattage: Record<string, number> = {};
  const deviceMode: Record<string, string | undefined> = {};
  for (const d of devicesAvailable) {
    deviceIntents[d.name] = 'ignore';
    deviceWattage[d.name] = d.default_wattage;
    deviceMode[d.name] = (d.modes || [])[0];
  }

  function getMatchedIndices(): number[] {
    const matched: number[] = [];
    for (let i = rangeFrom; i <= rangeTo; i++) {
      const p = slots[i].price;
      if (filterMode === 'all') matched.push(i);
      else if (filterMode === 'below' && p < threshold) matched.push(i);
      else if (filterMode === 'above' && p > threshold) matched.push(i);
    }
    return matched;
  }

  // ── Partial render: range picker, price filter, preview, apply label ─────
  // Deliberately does not touch the action form, so wattage / until-% values
  // and watt-card toggles survive range and threshold changes.
  function renderRangeUI() {
    const matched = getMatchedIndices();

    const barsHtml = slots.map((slot, i) => {
      const h = Math.max(2, slot.price / maxP * MINI_CHART_H);
      const dimmed = i < rangeFrom || i > rangeTo ? ' dimmed' : '';
      return `<div class="be-mini-bar${dimmed}" style="height:${h}px;background:${priceColor(slot.price)}"></div>`;
    }).join('');

    const leftPct = (rangeFrom / n * 100).toFixed(2);
    const widthPct = ((rangeTo - rangeFrom + 1) / n * 100).toFixed(2);
    const highlightHtml =
      `<div class="be-range-highlight" style="left:${leftPct}%;width:${widthPct}%"></div>`;

    const thresholdHtml = filterMode !== 'all'
      ? `<div class="be-threshold-line" id="be-threshold-line" style="bottom:${(threshold / maxP * 100).toFixed(1)}%">
          <span class="be-threshold-label">${threshold.toFixed(1)} ct</span>
        </div>`
      : '';

    sr.getElementById('be-mini-chart')!.innerHTML =
      `<div class="be-mini-bars">${barsHtml}</div>${highlightHtml}${thresholdHtml}`;

    (sr.getElementById('be-from') as HTMLInputElement).value = slotTimeStr(slots[rangeFrom]);
    (sr.getElementById('be-to') as HTMLInputElement).value = slotTimeStr(slots[rangeTo]);
    sr.getElementById('be-range-count')!.textContent = `${rangeTo - rangeFrom + 1} slots selected`;

    sr.querySelectorAll('.be-filter-btn').forEach(btn =>
      btn.classList.toggle('sel', (btn as HTMLElement).dataset.filter === filterMode)
    );
    (sr.getElementById('be-threshold') as HTMLInputElement).disabled = filterMode === 'all';

    const matchedSet = new Set(matched);
    sr.getElementById('be-preview-strip')!.innerHTML = slots.map((slot, i) =>
      `<div class="be-preview-seg ${matchedSet.has(i) ? 'matched' : 'unmatched'}" style="background:${priceColor(slot.price)}"></div>`
    ).join('');
    sr.getElementById('be-preview-info')!.innerHTML =
      `<b>${matched.length}</b> slot${matched.length !== 1 ? 's' : ''} matched`;

    const applyBtn = sr.getElementById('be-apply') as HTMLButtonElement;
    applyBtn.textContent = `Apply to ${matched.length} slot${matched.length !== 1 ? 's' : ''}`;
    applyBtn.disabled = matched.length === 0;
  }

  // ── Shell: rendered once ─────────────────────────────────────────────────
  const actions = [
    { key: 'idle', label: 'Idle', color: '#374151' },
    { key: 'charge', label: 'Charge', color: '#16a34a' },
    { key: 'use_net', label: 'Use Net', color: '#2563eb' },
    { key: 'discharge', label: 'Discharge', color: '#dc2626' },
    { key: 'car_charge', label: 'Car Charge', color: '#ca8a04' },
  ];
  const actionBtns = actions.map(a =>
    `<button class="ap-btn${selAction === a.key ? ' sel' : ''}" data-action="${a.key}" style="--btn-c:${a.color}">
      <div class="ap-dot" style="background:${a.color}"></div>${a.label}
    </button>`
  ).join('');

  const devicesHtml = devicesAvailable.length > 0 ? `
    <div class="dev-toggle-section">
      <div class="dev-toggle-title">Devices</div>
      <div class="dev-toggle-hint">Click to cycle: unchanged → schedule → clear</div>
      <div class="dev-toggle-list">
        ${devicesAvailable.map((d, di) => {
          // Wattage devices get a number field, mode devices a picker, plain
          // on/off devices neither.
          let control = '';
          if (d.control === 'modes') {
            control = `<select class="dev-toggle-select" data-dev-mode="${di}">
              ${(d.modes || []).map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>`;
          } else if (d.control !== 'switch') {
            control = `<input class="dev-toggle-input" data-dev-input="${di}" type="number" min="0" max="100000" step="100" value="${d.default_wattage}">
              <span class="dev-toggle-unit">W</span>`;
          }
          return `<div class="dev-toggle-card" data-dev="${di}">
            <div class="dev-toggle-dot" style="background:${ctx.devColors[d.name] || '#3b82f6'}"></div>
            <span class="dev-toggle-name">${d.name}</span>
            <span class="dev-toggle-state" data-dev-state="${di}">unchanged</span>
            ${control}
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  sr.getElementById('popup')!.innerHTML = `
    <div class="be-header">
      <div class="be-header-left">
        <button class="be-back" id="be-back" title="Back to slot">‹</button>
        <span class="be-title">⊞ Bulk Edit</span>
      </div>
      <button class="be-close" id="be-close">✕</button>
    </div>

    <div class="be-range-section">
      <div class="be-section-label">Select Time Range</div>
      <div class="be-mini-chart" id="be-mini-chart"></div>
      <div class="be-time-row">
        <div class="be-time-field">
          <span class="be-time-label">From</span>
          <input class="be-time-input" id="be-from" type="text" placeholder="00:00">
        </div>
        <div class="be-time-field">
          <span class="be-time-label">To</span>
          <input class="be-time-input" id="be-to" type="text" placeholder="23:45">
        </div>
        <div style="flex:1"></div>
        <span class="be-range-count" id="be-range-count"></span>
      </div>
    </div>

    <div class="be-filter-section">
      <div class="be-section-label">Price Filter</div>
      <div class="be-filter-row">
        <button class="be-filter-btn" data-filter="all">All</button>
        <button class="be-filter-btn" data-filter="below">Below</button>
        <button class="be-filter-btn" data-filter="above">Above</button>
        <input class="be-filter-input" id="be-threshold" type="number" step="0.1" value="${threshold}">
        <span class="be-filter-unit">ct</span>
      </div>
    </div>

    <div class="be-preview-section">
      <div class="be-preview-info" id="be-preview-info"></div>
      <div class="be-preview-strip" id="be-preview-strip"></div>
    </div>

    <div class="be-action-section">
      <div class="be-section-label">Action</div>
      <div class="action-editor">
        <div class="ap-grid">${actionBtns}</div>
        <div class="params-panel">
          <div class="action-params" id="be-params-charge" style="${selAction === 'charge' ? '' : 'display:none'}">
            <div class="param-row">
              <span class="param-label">Power</span>
              <input class="param-input" id="be-charge-w" type="number" min="0" max="100000" step="100" value="${kwpW}">
              <span class="param-unit">W</span>
            </div>
            <div class="param-row">
              <span class="param-label">Until %<span class="param-optional">opt</span></span>
              <input class="param-input" id="be-charge-until" type="number" min="0" max="100" step="1" value="">
              <span class="param-unit">%</span>
            </div>
          </div>
          <div class="action-params" id="be-params-discharge" style="${selAction === 'discharge' ? '' : 'display:none'}">
            <div class="param-row">
              <span class="param-label">Power</span>
              <input class="param-input" id="be-discharge-w" type="number" min="0" max="100000" step="100" value="${kwpW}">
              <span class="param-unit">W</span>
            </div>
            <div class="param-row">
              <span class="param-label">Until %<span class="param-optional">opt</span></span>
              <input class="param-input" id="be-discharge-until" type="number" min="0" max="100" step="1" value="">
              <span class="param-unit">%</span>
            </div>
          </div>
          <div class="action-params" id="be-params-use_net" style="${selAction === 'use_net' ? '' : 'display:none'}">
            <div class="param-row">
              <span class="param-label">Max draw<span class="param-optional">opt</span></span>
              <input class="param-input" id="be-usenet-max" type="number" min="0" max="100000" step="100" value="${kwpW}">
              <span class="param-unit">W</span>
            </div>
            <button class="toggle-btn on" id="be-usenet-solar" style="--tc:#f59e0b">
              <div class="toggle-btn-dot"></div>☀ Use Solar
            </button>
          </div>
          <div class="action-params" id="be-params-car_charge" style="${selAction === 'car_charge' ? '' : 'display:none'}">
            <button class="toggle-btn on" id="be-car-solar" style="--tc:#f59e0b">
              <div class="toggle-btn-dot"></div>☀ Use Solar
            </button>
            <div class="watt-card" id="be-wc-car-net" style="--wc-c:#2563eb">
              <div class="watt-card-header">
                <div class="watt-card-dot"></div>
                <span class="watt-card-label">Net Grid</span>
              </div>
              <div class="watt-card-input-wrap">
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Wattage</span>
                  <input class="param-input" id="be-car-net-w" type="number" min="0" max="100000" step="100" value="${kwpW}">
                  <span class="param-unit">W</span>
                </div>
              </div>
            </div>
            <div class="watt-card" id="be-wc-car-bat" style="--wc-c:#7c3aed">
              <div class="watt-card-header">
                <div class="watt-card-dot"></div>
                <span class="watt-card-label">Battery</span>
              </div>
              <div class="watt-card-input-wrap">
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Budget</span>
                  <input class="param-input" id="be-car-bat-w" type="number" min="-100000" max="100000" step="100" value="${kwpW}">
                  <span class="param-unit">W</span>
                </div>
                <div class="watt-card-hint">+ car draws from the battery &nbsp;·&nbsp; − charges the battery too</div>
                <div class="watt-card-row">
                  <span class="watt-card-sub-label">Until %<span class="param-optional">opt</span></span>
                  <input class="param-input" id="be-car-bat-until" type="number" min="0" max="100" step="1" value="">
                  <span class="param-unit">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    ${devicesHtml}

    <div class="be-apply-row">
      <button class="be-apply-btn" id="be-apply"></button>
    </div>
  `;

  // ── One-time event wiring ────────────────────────────────────────────────
  sr.getElementById('be-close')!.addEventListener('click', () => ctx.onClose());
  sr.getElementById('be-back')!.addEventListener('click', () => ctx.onBack());

  // Mini chart drag-to-select.
  const miniChart = sr.getElementById('be-mini-chart')!;
  const idxAtClientX = (clientX: number): number => {
    const rect = miniChart.getBoundingClientRect();
    const idx = Math.floor((clientX - rect.left) / rect.width * n);
    return Math.max(0, Math.min(n - 1, idx));
  };
  const beginRange = (clientX: number) => {
    isDraggingRange = true;
    rangeFrom = idxAtClientX(clientX);
    rangeTo = rangeFrom;
    renderRangeUI();
  };
  const extendRange = (clientX: number) => {
    const clamped = idxAtClientX(clientX);
    if (clamped >= rangeFrom) rangeTo = clamped;
    else { rangeTo = rangeFrom; rangeFrom = clamped; }
    renderRangeUI();
  };

  const updateThreshold = (clientY: number) => {
    const rect = miniChart.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    threshold = Math.round(pct * maxP * 10) / 10;
    const input = sr.getElementById('be-threshold') as HTMLInputElement | null;
    if (input) input.value = String(threshold);
    renderRangeUI();
  };

  // Pointer events with capture, rather than separate mouse and touch handlers.
  // renderRangeUI() replaces the element under the pointer on the very first
  // move; touch events stay bound to their original target, so once that node
  // was detached no further touchmove reached the container and the drag died
  // after one frame. Capturing on the container makes DOM churn irrelevant and
  // covers mouse, touch and pen in one path.
  const endDrag = (e: Event) => {
    isDraggingRange = false;
    isDraggingThreshold = false;
    const id = (e as PointerEvent).pointerId;
    if (miniChart.hasPointerCapture?.(id)) miniChart.releasePointerCapture(id);
  };
  miniChart.addEventListener('pointerdown', (e: Event) => {
    const pe = e as PointerEvent;
    if (pe.button !== 0 && pe.pointerType === 'mouse') return;
    pe.preventDefault();
    miniChart.setPointerCapture(pe.pointerId);
    if ((pe.target as HTMLElement).closest('.be-threshold-line')) {
      isDraggingThreshold = true;
    } else {
      beginRange(pe.clientX);
    }
  });
  miniChart.addEventListener('pointermove', (e: Event) => {
    const pe = e as PointerEvent;
    if (isDraggingThreshold) updateThreshold(pe.clientY);
    else if (isDraggingRange) extendRange(pe.clientX);
  });
  miniChart.addEventListener('pointerup', endDrag);
  miniChart.addEventListener('pointercancel', endDrag);

  // From/To manual input
  const closestSlotTo = (mins: number): number => {
    let closest = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(slotToMinutes(slots[i]) - mins) < Math.abs(slotToMinutes(slots[closest]) - mins)) closest = i;
    }
    return closest;
  };
  const parseTimeField = (input: HTMLInputElement): number => {
    const snapped = snap15(input.value);
    input.value = snapped;
    const [h, m] = snapped.split(':').map(Number);
    return h * 60 + m;
  };
  const fromInput = sr.getElementById('be-from') as HTMLInputElement;
  const toInput = sr.getElementById('be-to') as HTMLInputElement;
  fromInput.addEventListener('change', () => {
    rangeFrom = closestSlotTo(parseTimeField(fromInput));
    if (rangeFrom > rangeTo) rangeTo = rangeFrom;
    renderRangeUI();
  });
  toInput.addEventListener('change', () => {
    rangeTo = closestSlotTo(parseTimeField(toInput));
    if (rangeTo < rangeFrom) rangeFrom = rangeTo;
    renderRangeUI();
  });

  // Filter buttons + threshold
  sr.querySelectorAll('.be-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      filterMode = (btn as HTMLElement).dataset.filter as any;
      renderRangeUI();
    });
  });
  const threshInput = sr.getElementById('be-threshold') as HTMLInputElement;
  threshInput.addEventListener('input', () => {
    threshold = parseFloat(threshInput.value) || 0;
    renderRangeUI();
  });

  // Action buttons
  sr.querySelectorAll('.be-action-section .ap-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      selAction = (btn as HTMLElement).dataset.action!;
      sr.querySelectorAll('.be-action-section .ap-btn[data-action]').forEach(b =>
        b.classList.toggle('sel', b === btn));
      ['charge', 'discharge', 'use_net', 'car_charge'].forEach(a => {
        const el = sr.getElementById(`be-params-${a}`) as HTMLElement | null;
        if (el) el.style.display = a === selAction ? '' : 'none';
      });
    });
  });

  // Toggle buttons
  ['be-usenet-solar', 'be-car-solar'].forEach(id => {
    const btn = sr.getElementById(id);
    if (btn) btn.addEventListener('click', (e: Event) => { e.stopPropagation(); btn.classList.toggle('on'); });
  });

  // Watt-cards
  ['be-wc-car-net', 'be-wc-car-bat'].forEach(id => {
    const card = sr.getElementById(id);
    if (!card) return;
    card.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      card.classList.toggle('on');
    });
    card.querySelectorAll('input').forEach(inp => inp.addEventListener('click', (e: Event) => e.stopPropagation()));
  });

  // Device cards cycle unchanged → schedule → clear
  sr.querySelectorAll('.dev-toggle-card[data-dev]').forEach(card => {
    card.addEventListener('click', (e: Event) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'OPTION') return;
      e.stopPropagation();
      const di = parseInt((card as HTMLElement).dataset.dev!);
      const name = devicesAvailable[di].name;
      const next: DeviceIntent =
        deviceIntents[name] === 'ignore' ? 'on' : deviceIntents[name] === 'on' ? 'off' : 'ignore';
      deviceIntents[name] = next;
      card.classList.toggle('on', next === 'on');
      card.classList.toggle('off', next === 'off');
      const label = sr.querySelector(`[data-dev-state="${di}"]`);
      if (label) label.textContent = DEV_STATE_LABEL[next];
    });
  });
  sr.querySelectorAll('.dev-toggle-input[data-dev-input]').forEach(inp => {
    inp.addEventListener('click', (e: Event) => e.stopPropagation());
    inp.addEventListener('change', () => {
      const di = parseInt((inp as HTMLElement).dataset.devInput!);
      deviceWattage[devicesAvailable[di].name] = parseFloat((inp as HTMLInputElement).value) || 0;
    });
  });
  sr.querySelectorAll('.dev-toggle-select[data-dev-mode]').forEach(sel => {
    sel.addEventListener('click', (e: Event) => e.stopPropagation());
    sel.addEventListener('change', () => {
      const di = parseInt((sel as HTMLElement).dataset.devMode!);
      deviceMode[devicesAvailable[di].name] = (sel as HTMLSelectElement).value;
    });
  });

  // Prevent input clicks from closing the overlay
  sr.querySelectorAll('.be-action-section .param-input, .be-time-input, .be-filter-input').forEach(el => {
    el.addEventListener('click', (e: Event) => e.stopPropagation());
  });

  // Apply
  sr.getElementById('be-apply')!.addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    const applyBtn = sr.getElementById('be-apply') as HTMLButtonElement;
    const matched = getMatchedIndices();
    if (matched.length === 0) return;

    applyBtn.disabled = true;
    applyBtn.textContent = `Applying… (0/${matched.length})`;

    const commonBase = { device_id: deviceId || entryId };
    const numVal = (id: string, fallback: number) => {
      const v = parseFloat((sr.getElementById(id) as HTMLInputElement)?.value);
      return isNaN(v) ? fallback : v;
    };
    const optNumVal = (id: string): number | null => {
      const v = (sr.getElementById(id) as HTMLInputElement)?.value;
      return v !== '' && v != null ? parseFloat(v) : null;
    };

    try {
      for (let mi = 0; mi < matched.length; mi++) {
        const slot = slots[matched[mi]];
        const slotTime = slot.start ?? slot.time;
        const commonData = { ...commonBase, time: slotTime, locked: true };

        // Primary action
        if (selAction === 'idle') {
          await hass.callService('ha_ems', 'planning_idle', commonData);
        } else if (selAction === 'charge') {
          const untilPct = optNumVal('be-charge-until');
          await hass.callService('ha_ems', 'planning_charge',
            { ...commonData, wattage: numVal('be-charge-w', kwpW), ...(untilPct != null ? { until_pct: untilPct } : {}) });
        } else if (selAction === 'discharge') {
          const untilPct = optNumVal('be-discharge-until');
          await hass.callService('ha_ems', 'planning_discharge',
            { ...commonData, wattage: numVal('be-discharge-w', kwpW), ...(untilPct != null ? { until_pct: untilPct } : {}) });
        } else if (selAction === 'use_net') {
          const maxWatts = optNumVal('be-usenet-max');
          const useSolar = sr.getElementById('be-usenet-solar')?.classList.contains('on') ?? true;
          await hass.callService('ha_ems', 'planning_use_net',
            { ...commonData, use_solar: useSolar, ...(maxWatts != null ? { max_wattage: maxWatts } : {}) });
        } else if (selAction === 'car_charge') {
          const useSolar = sr.getElementById('be-car-solar')?.classList.contains('on') ?? true;
          const netCardOn = sr.getElementById('be-wc-car-net')?.classList.contains('on') ?? false;
          const batCardOn = sr.getElementById('be-wc-car-bat')?.classList.contains('on') ?? false;
          const batUntil = batCardOn ? optNumVal('be-car-bat-until') : null;
          await hass.callService('ha_ems', 'planning_car_charge_slot', {
            ...commonData,
            use_solar: useSolar,
            use_net_wattage: netCardOn ? numVal('be-car-net-w', 0) : 0,
            use_battery_wattage: batCardOn ? numVal('be-car-bat-w', 0) : 0,
            ...(batUntil != null ? { use_battery_until_pct: batUntil } : {}),
          });
        }

        // Device scheduling
        for (const d of devicesAvailable) {
          const intent = deviceIntents[d.name];
          if (intent === 'ignore') continue;
          // Shape the payload to how the device is controlled: a wattage, a
          // mode, or nothing at all for plain on/off devices.
          let params: Record<string, any> = {};
          if (intent === 'on' && d.control === 'modes') {
            const mode = deviceMode[d.name];
            if (mode) params = { mode };
          } else if (intent === 'on' && d.control !== 'switch') {
            params = { wattage: deviceWattage[d.name] };
          }
          await hass.callService(
            'ha_ems',
            intent === 'on' ? 'planning_device_slot' : 'planning_device_clear',
            { ...commonBase, time: slotTime, device_name: d.name, ...params },
          );
        }

        applyBtn.textContent = `Applying… (${mi + 1}/${matched.length})`;
      }

      applyBtn.textContent = '✓ Applied';
      applyBtn.classList.add('success');
      setTimeout(() => {
        ctx.onApplied();
        ctx.onClose();
      }, 800);
    } catch (err: any) {
      applyBtn.textContent = '✕ Error';
      applyBtn.classList.add('error');
      applyBtn.disabled = false;
      console.error('Bulk edit error:', err);
    }
  });

  renderRangeUI();
}
