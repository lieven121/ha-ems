import { DeviceAvailable, Slot, CardConfig } from '../shared/types';
import { esc, priceColor, slotAction, slotTimeStr } from '../shared/utils';
import { actionFormHtml, wireActionForm } from '../shared/action-form';

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
  let isDraggingRange = false;
  // The slot where the drag started; the range spans from it to the pointer
  // in either direction.
  let dragAnchor = 0;
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
  // and toggles survive range and threshold changes.
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

    // The line is thin, so it carries a handle to grab instead.
    const thresholdHtml = filterMode !== 'all'
      ? `<div class="be-threshold-line" id="be-threshold-line" style="bottom:${(Math.min(threshold, maxP) / maxP * 100).toFixed(1)}%">
          <span class="be-threshold-handle" title="Drag to change the price">${threshold.toFixed(1)} ct</span>
        </div>`
      : '';

    sr.getElementById('be-mini-chart')!.innerHTML =
      `<div class="be-mini-bars">${barsHtml}</div>${highlightHtml}${thresholdHtml}`;

    // What is planned now: one dot per slot that isn't idle.
    sr.getElementById('be-mini-dots')!.innerHTML = slots.map((slot, i) => {
      const a = slotAction(slot);
      if (a.key === 'idle') return '';
      const dimmed = i < rangeFrom || i > rangeTo ? ' dimmed' : '';
      return `<div class="be-mini-dot${dimmed}" style="left:${((i + 0.5) / n * 100).toFixed(2)}%;background:${a.color}"></div>`;
    }).join('');

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
    for (const id of ['be-lock', 'be-unlock']) {
      const btn = sr.getElementById(id) as HTMLButtonElement | null;
      if (btn) btn.disabled = matched.length === 0;
    }
  }

  // ── Shell: rendered once ─────────────────────────────────────────────────
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
              ${(d.modes || []).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
            </select>`;
          } else if (d.control !== 'switch') {
            control = `<input class="dev-toggle-input" data-dev-input="${di}" type="number" min="0" max="100000" step="100" value="${d.default_wattage}">
              <span class="dev-toggle-unit">W</span>`;
          }
          return `<div class="dev-toggle-card" data-dev="${di}">
            <div class="dev-toggle-dot" style="background:${ctx.devColors[d.name] || '#3b82f6'}"></div>
            <span class="dev-toggle-name">${esc(d.name)}</span>
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
      <div class="be-mini-dots" id="be-mini-dots"></div>
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

    <div class="be-action-section action-section">
      <div class="be-section-label">Action</div>
      ${actionFormHtml('be', 'idle', {}, kwpW)}
    </div>

    ${devicesHtml}

    <div class="pop-foot be-foot">
      <label class="pop-lock" title="Keep the optimizer off the edited slots">
        <input type="checkbox" id="be-locked" checked>🔒 Lock
      </label>
      <button class="be-lock-btn" id="be-lock" title="Lock the matched slots without changing them">🔒</button>
      <button class="be-lock-btn" id="be-unlock" title="Unlock the matched slots so the optimizer may re-plan them">🔓</button>
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
    dragAnchor = idxAtClientX(clientX);
    rangeFrom = rangeTo = dragAnchor;
    renderRangeUI();
  };
  const extendRange = (clientX: number) => {
    const idx = idxAtClientX(clientX);
    rangeFrom = Math.min(dragAnchor, idx);
    rangeTo = Math.max(dragAnchor, idx);
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

  const form = wireActionForm(sr, 'be', 'idle', {}, kwpW);

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

  // Apply
  sr.getElementById('be-apply')!.addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    const applyBtn = sr.getElementById('be-apply') as HTMLButtonElement;
    const matched = getMatchedIndices();
    if (matched.length === 0) return;

    applyBtn.disabled = true;
    applyBtn.textContent = `Applying to ${matched.length} slots…`;

    const commonBase = { device_id: deviceId || entryId };

    try {
      // Read the form once; every matched slot gets the same edit.
      const actionFields = form.read();

      // Shape each device to how it is controlled: a wattage, a mode, or
      // nothing at all for plain on/off devices. null unschedules it.
      const devices: Record<string, Record<string, any> | null> = {};
      for (const d of devicesAvailable) {
        const intent = deviceIntents[d.name];
        if (intent === 'ignore') continue;
        if (intent !== 'on') { devices[d.name] = null; continue; }
        if (d.control === 'modes') {
          const mode = deviceMode[d.name];
          devices[d.name] = mode ? { mode } : {};
        } else if (d.control !== 'switch') {
          devices[d.name] = { wattage: deviceWattage[d.name] };
        } else {
          devices[d.name] = {};
        }
      }

      const lockEdited = (sr.getElementById('be-locked') as HTMLInputElement | null)?.checked ?? true;
      const items = matched.map(idx => {
        const slot = slots[idx];
        return { time: slot.start ?? slot.time, locked: lockEdited, ...actionFields, devices };
      });

      // One call: one save and one refresh on the backend, however many slots.
      await hass.callService('ha_ems', 'planning_bulk', { ...commonBase, slots: items });

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

  // Lock / unlock only: the slots keep their action and devices.
  const setLock = async (btn: HTMLButtonElement, locked: boolean) => {
    const matched = getMatchedIndices();
    if (matched.length === 0) return;
    const label = btn.textContent;
    btn.disabled = true;
    try {
      await hass.callService('ha_ems', 'planning_bulk', {
        device_id: deviceId || entryId,
        slots: matched.map(idx => ({ time: slots[idx].start ?? slots[idx].time, locked })),
      });
      btn.textContent = `✓ ${matched.length}`;
      setTimeout(() => {
        ctx.onApplied();
        ctx.onClose();
      }, 800);
    } catch (err: any) {
      btn.textContent = '✕ Error';
      btn.disabled = false;
      console.error('Bulk lock error:', err, label);
    }
  };
  for (const [id, locked] of [['be-lock', true], ['be-unlock', false]] as const) {
    const btn = sr.getElementById(id) as HTMLButtonElement;
    btn.addEventListener('click', (e: Event) => { e.stopPropagation(); setLock(btn, locked); });
  }

  renderRangeUI();
}
