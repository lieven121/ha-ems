import { Slot, CardConfig, BatteryGoal } from '../shared/types';
import { priceColor, slotTimeStr } from '../shared/utils';

export interface PlannerContext {
  sr: ShadowRoot;
  /** Every known slot, today and tomorrow alike: a plan may cross midnight. */
  slots: Slot[];
  config: CardConfig;
  hass: any;
  kwpEntityId: string | null;
  planningEntityId: string | null;
  onClose: () => void;
  onApplied: () => void;
}

const POWER_KEY = 'ha-ems-car-power-w';

function slotStart(slot: Slot): number {
  return new Date(slot.start ?? slot.time!).getTime();
}

/** The first time the clock shows *hhmm* after *after*. */
function nextOccurrence(hhmm: string, after: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const d = new Date(after);
  d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() <= after.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

function dayTimeLabel(d: Date): string {
  const now = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000,
  );
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : d.toLocaleDateString();
  return `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function storedPower(fallback: number): number {
  try {
    const v = parseFloat(localStorage.getItem(POWER_KEY) || '');
    return v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function storePower(watts: number): void {
  try { localStorage.setItem(POWER_KEY, String(watts)); } catch { /* private mode */ }
}

export function renderPlanner(ctx: PlannerContext): void {
  const { sr, config, hass } = ctx;
  const deviceId = config.integration?.device_id || config.integration?.entry_id;
  const planEntity = ctx.planningEntityId || config.integration?.planning_entity;
  const goal: BatteryGoal | null =
    (planEntity ? hass?.states[planEntity]?.attributes?.battery_goal : null) ?? null;
  const kwpW = Math.round((parseFloat(hass?.states[ctx.kwpEntityId!]?.state) || 3) * 1000);

  const slots = [...ctx.slots].sort((a, b) => slotStart(a) - slotStart(b));
  const durMs = slots.length > 1 ? slotStart(slots[1]) - slotStart(slots[0]) : 3600000;
  const slotHours = durMs / 3600000;
  const now = new Date();
  // Slots that haven't ended yet: the only ones a plan can still use.
  const future = slots.filter(s => slotStart(s) + durMs > now.getTime());
  const horizonEnd = future.length ? slotStart(future[future.length - 1]) + durMs : now.getTime();

  let amountMode: 'kwh' | 'slots' = 'kwh';

  const goalHtml = goal
    ? `<div class="pl-note">Active goal: <b>${goal.target_pct.toFixed(0)} %</b> by <b>${dayTimeLabel(new Date(goal.by))}</b></div>`
    : '<div class="pl-note">No goal set.</div>';

  sr.getElementById('popup')!.innerHTML = `
    <div class="be-header">
      <span class="be-title">⚡ Plan</span>
      <button class="be-close" id="pl-close">✕</button>
    </div>

    <div class="be-range-section">
      <div class="be-section-label">Charge the car on the cheapest slots</div>
      <div class="pl-grid">
        <div class="param-row">
          <span class="param-label">From<span class="param-optional">opt</span></span>
          <input class="param-input" id="pl-car-from" type="time" step="900" value="">
        </div>
        <div class="param-row">
          <span class="param-label">Ready by</span>
          <input class="param-input" id="pl-car-by" type="time" step="900" value="06:00">
        </div>
        <div class="param-row">
          <span class="param-label">Amount</span>
          <input class="param-input" id="pl-car-amount" type="number" min="0" step="0.5" value="10">
          <button class="be-filter-btn sel" data-amount="kwh">kWh</button>
          <button class="be-filter-btn" data-amount="slots">slots</button>
        </div>
        <div class="param-row">
          <span class="param-label">Charger power</span>
          <input class="param-input" id="pl-car-power" type="number" min="100" max="100000" step="100" value="${storedPower(kwpW)}">
          <span class="param-unit">W</span>
        </div>
        <div class="param-row">
          <span class="param-label">Max price<span class="param-optional">opt</span></span>
          <input class="param-input" id="pl-car-max" type="number" step="0.1" value="">
          <span class="param-unit">ct</span>
        </div>
        <button class="toggle-btn on" id="pl-car-solar" style="--tc:#f59e0b">
          <div class="toggle-btn-dot"></div>☀ Use Solar
        </button>
      </div>
      <div class="be-preview-info pl-preview" id="pl-car-info"></div>
      <div class="be-preview-strip" id="pl-car-strip"></div>
      <div class="pl-btn-row">
        <button class="be-apply-btn" id="pl-car-apply">Schedule car</button>
      </div>
    </div>

    <div class="be-range-section">
      <div class="be-section-label">Have the battery charged by a time</div>
      ${goalHtml}
      <div class="pl-grid">
        <div class="param-row">
          <span class="param-label">Target</span>
          <input class="param-input" id="pl-bat-pct" type="number" min="0" max="100" step="1" value="${goal ? goal.target_pct : 80}">
          <span class="param-unit">%</span>
        </div>
        <div class="param-row">
          <span class="param-label">By</span>
          <input class="param-input" id="pl-bat-by" type="time" step="900" value="${goal ? slotTimeStr({ start: goal.by, price: 0 }) : '17:00'}">
        </div>
      </div>
      <div class="be-preview-info pl-preview" id="pl-bat-info"></div>
      <div class="pl-btn-row">
        <button class="be-apply-btn" id="pl-bat-apply">Set goal &amp; optimize</button>
        ${goal ? '<button class="be-lock-btn" id="pl-bat-clear">Clear goal</button>' : ''}
      </div>
    </div>
  `;

  const input = (id: string) => sr.getElementById(id) as HTMLInputElement;
  const num = (id: string): number | null => {
    const v = parseFloat(input(id).value);
    return isNaN(v) ? null : v;
  };

  // ── Car ──────────────────────────────────────────────────────────────────
  /** The window and the slots the backend will pick, by the same rule. */
  function carPlan() {
    const from = input('pl-car-from').value ? nextOccurrence(input('pl-car-from').value, now) : now;
    const by = from ? nextOccurrence(input('pl-car-by').value, from) : null;
    const amount = num('pl-car-amount');
    const power = num('pl-car-power');
    const maxPrice = num('pl-car-max');
    if (!from || !by || !amount || amount <= 0 || !power || power <= 0) return null;

    const wanted = amountMode === 'slots'
      ? Math.max(1, Math.round(amount))
      : Math.max(1, Math.ceil(amount * 1000 / (power * slotHours) - 1e-9));
    const candidates = future.filter(s =>
      slotStart(s) + durMs > from.getTime() && slotStart(s) < by.getTime() &&
      !s.locked && (maxPrice == null || s.price <= maxPrice));
    const picked = [...candidates].sort((a, b) => a.price - b.price).slice(0, wanted);
    return { from, by, amount, power, maxPrice, wanted, picked };
  }

  function renderCar() {
    const plan = carPlan();
    const info = sr.getElementById('pl-car-info')!;
    const strip = sr.getElementById('pl-car-strip')!;
    const apply = sr.getElementById('pl-car-apply') as HTMLButtonElement;
    if (!plan) {
      info.textContent = 'Fill in a time and an amount.';
      strip.innerHTML = '';
      apply.disabled = true;
      return;
    }
    const { by, wanted, picked, power } = plan;
    const pickedSet = new Set(picked);
    const shown = future.filter(s => slotStart(s) < by.getTime());
    strip.innerHTML = shown.map(s =>
      `<div class="be-preview-seg ${pickedSet.has(s) ? 'matched' : 'unmatched'}" style="background:${priceColor(s.price)}"></div>`
    ).join('');

    if (picked.length === 0) {
      info.innerHTML = by.getTime() > horizonEnd
        ? 'No prices published yet for that window.'
        : 'No free slot in that window.';
      apply.disabled = true;
      return;
    }
    const avg = picked.reduce((a, s) => a + s.price, 0) / picked.length;
    const kwh = picked.length * power * slotHours / 1000;
    const times = picked.map(slotStart).sort((a, b) => a - b);
    let text = `<b>${picked.length}</b> slot${picked.length !== 1 ? 's' : ''} ` +
      `(${kwh.toFixed(1)} kWh) between <b>${dayTimeLabel(new Date(times[0]))}</b> and ` +
      `<b>${dayTimeLabel(new Date(times[times.length - 1] + durMs))}</b>, avg <b>${avg.toFixed(2)} ct</b>`;
    if (picked.length < wanted) {
      text += ` — only ${picked.length} of ${wanted} slots available`;
      if (by.getTime() > horizonEnd) text += ' (prices not published to the end of the window)';
    }
    info.innerHTML = text;
    apply.disabled = false;
  }

  ['pl-car-from', 'pl-car-by', 'pl-car-amount', 'pl-car-power', 'pl-car-max'].forEach(id =>
    input(id).addEventListener('input', renderCar));
  sr.querySelectorAll('[data-amount]').forEach(btn => {
    btn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      amountMode = (btn as HTMLElement).dataset.amount as 'kwh' | 'slots';
      sr.querySelectorAll('[data-amount]').forEach(b => b.classList.toggle('sel', b === btn));
      input('pl-car-amount').step = amountMode === 'slots' ? '1' : '0.5';
      renderCar();
    });
  });
  const solarBtn = sr.getElementById('pl-car-solar')!;
  solarBtn.addEventListener('click', (e: Event) => { e.stopPropagation(); solarBtn.classList.toggle('on'); });

  const done = (btn: HTMLButtonElement, label: string) => {
    btn.textContent = label;
    btn.classList.add('success');
    setTimeout(() => { ctx.onApplied(); ctx.onClose(); }, 800);
  };
  const failed = (btn: HTMLButtonElement, err: any) => {
    btn.textContent = `✕ ${err?.message || 'Error'}`;
    btn.classList.add('error');
    btn.disabled = false;
    console.error('Planner error:', err);
  };

  sr.getElementById('pl-car-apply')!.addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const plan = carPlan();
    if (!plan) return;
    btn.disabled = true;
    btn.classList.remove('error');
    btn.textContent = 'Scheduling…';
    storePower(plan.power);
    const data: Record<string, any> = {
      device_id: deviceId,
      stop_time: plan.by.toISOString(),
      use_solar: solarBtn.classList.contains('on'),
      use_net_wattage: plan.power,
    };
    if (input('pl-car-from').value) data.start_time = plan.from.toISOString();
    if (plan.maxPrice != null) data.max_price = plan.maxPrice;
    if (amountMode === 'slots') data.slots_wanted = plan.wanted;
    else data.energy_kwh = plan.amount;
    try {
      await hass.callService('ha_ems', 'planning_charge_car', data);
      done(btn, '✓ Scheduled');
    } catch (err: any) {
      failed(btn, err);
    }
  });

  // ── Battery ──────────────────────────────────────────────────────────────
  function batteryPlan() {
    const pct = num('pl-bat-pct');
    const by = nextOccurrence(input('pl-bat-by').value, now);
    if (pct == null || pct < 0 || pct > 100 || !by) return null;
    return { pct, by };
  }

  function renderBattery() {
    const plan = batteryPlan();
    const info = sr.getElementById('pl-bat-info')!;
    const apply = sr.getElementById('pl-bat-apply') as HTMLButtonElement;
    apply.disabled = !plan;
    if (!plan) { info.textContent = 'Fill in a target and a time.'; return; }
    info.innerHTML = `At least <b>${plan.pct.toFixed(0)} %</b> by <b>${dayTimeLabel(plan.by)}</b>, charged at the cheapest moments before then.` +
      (plan.by.getTime() > horizonEnd
        ? ' Prices for that time are not published yet; the goal takes effect at the first Optimize after they are.'
        : '');
  }

  ['pl-bat-pct', 'pl-bat-by'].forEach(id => input(id).addEventListener('input', renderBattery));

  sr.getElementById('pl-bat-apply')!.addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const plan = batteryPlan();
    if (!plan) return;
    btn.disabled = true;
    btn.classList.remove('error');
    btn.textContent = 'Optimizing…';
    try {
      await hass.callService('ha_ems', 'planning_battery_goal', {
        device_id: deviceId, target_pct: plan.pct, by: plan.by.toISOString(),
      });
      done(btn, '✓ Goal set');
    } catch (err: any) {
      failed(btn, err);
    }
  });

  sr.getElementById('pl-bat-clear')?.addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    try {
      await hass.callService('ha_ems', 'planning_battery_goal', { device_id: deviceId });
      btn.textContent = '✓ Cleared';
      setTimeout(() => { ctx.onApplied(); ctx.onClose(); }, 800);
    } catch (err: any) {
      failed(btn, err);
    }
  });

  sr.getElementById('pl-close')!.addEventListener('click', () => ctx.onClose());
  // Clicks inside the form must not reach the overlay's close handler.
  sr.querySelectorAll('#popup .param-input').forEach(el =>
    el.addEventListener('click', (e: Event) => e.stopPropagation()));

  renderCar();
  renderBattery();
}
