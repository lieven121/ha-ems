import { ActionInfo } from './types';
import { esc } from './utils';

/** The action form shared by the slot dialog and bulk edit: action buttons,
 *  the chosen action's fields and an optional "only when …, otherwise …"
 *  guard. It reads back as one planning_bulk slot entry. */

// Order matters: keys 1–5 in the slot dialog pick these.
export const ACTION_DEFS: ActionInfo[] = [
  { key: 'idle',       label: 'Idle',       color: '#374151' },
  { key: 'charge',     label: 'Charge',     color: '#16a34a' },
  { key: 'use_net',    label: 'Use Net',    color: '#2563eb' },
  { key: 'discharge',  label: 'Discharge',  color: '#dc2626' },
  { key: 'car_charge', label: 'Car Charge', color: '#ca8a04' },
];
const ACTION_BY_KEY: Record<string, ActionInfo> = Object.fromEntries(ACTION_DEFS.map(a => [a.key, a]));

export function actionLabel(key: string): string {
  return ACTION_BY_KEY[key]?.label ?? key;
}

export function actionColor(key: string): string {
  return ACTION_BY_KEY[key]?.color ?? '#374151';
}

/** Idle's strip colour is too dark to show a selected button on a dark card. */
function buttonColor(a: ActionInfo): string {
  return a.key === 'idle' ? '#9ca3af' : a.color;
}

export interface Condition { on: 'soc' | 'solar' | 'surplus'; op: 'above' | 'below'; value: number }

const COND_META: Record<Condition['on'], { name: string; unit: string; step: number; def: number }> = {
  soc:     { name: 'battery', unit: '%', step: 1,   def: 30 },
  solar:   { name: 'solar',   unit: 'W', step: 100, def: 1500 },
  surplus: { name: 'surplus', unit: 'W', step: 100, def: 1500 },
};
const MAX_CONDITIONS = 2;

export function describeConditions(conds: Condition[]): string {
  return conds.map(c => {
    const m = COND_META[c.on];
    return `${m?.name ?? c.on} ${c.op === 'above' ? '≥' : '≤'} ${c.value} ${m?.unit ?? ''}`;
  }).join(' and ');
}

/** One sentence for a slot, the same one the current-action sensor gives. */
export function slotSummary(action: string, cfg: Record<string, any> | undefined): string {
  const when: Condition[] = cfg?.when ?? [];
  if (!when.length) return actionLabel(action);
  return `${actionLabel(action)} while ${describeConditions(when)}, otherwise ${actionLabel(cfg?.otherwise?.action ?? 'idle')}`;
}

/** Service fields of one slot: the action plus its settings, as planning_bulk takes them. */
export type FormFields = Record<string, any> & { action: string };

/** Settings an action gets when nothing else says otherwise. */
function defaultFields(action: string, kwpW: number): Record<string, any> {
  if (action === 'charge' || action === 'discharge') return { wattage: kwpW };
  if (action === 'use_net') return { use_solar: true };
  if (action === 'car_charge') return { use_solar: true, use_net_wattage: 0 };
  return {};
}

function paramRow(label: string, id: string, unit: string, value: unknown,
                  opt: { optional?: boolean; min?: number; max?: number; step?: number; title?: string } = {}): string {
  return `<label class="param-row"${opt.title ? ` title="${esc(opt.title)}"` : ''}>
    <span class="param-label">${label}${opt.optional ? '<span class="param-optional">opt</span>' : ''}</span>
    <input class="param-input" id="${id}" type="number" min="${opt.min ?? 0}" max="${opt.max ?? 100000}" step="${opt.step ?? 100}" value="${value ?? ''}">
    <span class="param-unit">${unit}</span>
  </label>`;
}

function toggle(id: string, label: string, on: boolean): string {
  return `<button class="toggle-btn${on ? ' on' : ''}" id="${id}" style="--tc:#f59e0b">
    <div class="toggle-btn-dot"></div>${label}
  </button>`;
}

/** A card that switches one power source on; its inputs show while it is on. */
function wattCard(id: string, label: string, color: string, on: boolean, body: string): string {
  return `<div class="watt-card${on ? ' on' : ''}" id="${id}" style="--wc-c:${color}">
    <div class="watt-card-header"><div class="watt-card-dot"></div><span class="watt-card-label">${label}</span></div>
    <div class="watt-card-body">${body}</div>
  </div>`;
}

/** Form markup; element ids start with *p* so two forms never clash. */
export function actionFormHtml(p: string, action: string, cfg: Record<string, any>, kwpW: number): string {
  // A slot's stored settings only fill the panel of its own action.
  const v = (a: string, key: string, fallback: unknown) => (a === action ? cfg[key] ?? fallback : fallback);
  const shown = (a: string) => (a === action ? '' : ' hidden');
  // A source is on when it has a non-zero wattage; while off, its field
  // keeps the kWp as a starting value for when it is switched on.
  const carNet = v('car_charge', 'use_net_wattage', 0);
  const carBat = v('car_charge', 'use_battery_wattage', 0);
  const buttons = ACTION_DEFS.map(a =>
    `<button class="ap-btn${action === a.key ? ' sel' : ''}" data-action="${a.key}" style="--btn-c:${buttonColor(a)}">
      <div class="ap-dot" style="background:${a.color}"></div>${a.label}
    </button>`).join('');
  return `<div class="action-editor" id="${p}-af">
    <div class="ap-grid">${buttons}</div>
    <div class="params-panel">
      <div class="action-params" data-params="charge"${shown('charge')}>
        ${paramRow('Power', `${p}-charge-w`, 'W', v('charge', 'wattage', kwpW))}
        ${paramRow('Until', `${p}-charge-until`, '%', v('charge', 'until_pct', ''), { optional: true, max: 100, step: 1 })}
      </div>
      <div class="action-params" data-params="discharge"${shown('discharge')}>
        ${paramRow('Power', `${p}-discharge-w`, 'W', v('discharge', 'wattage', kwpW))}
        ${paramRow('Until', `${p}-discharge-until`, '%', v('discharge', 'until_pct', ''), { optional: true, max: 100, step: 1 })}
      </div>
      <div class="action-params" data-params="use_net"${shown('use_net')}>
        ${paramRow('Max draw', `${p}-net-max`, 'W', v('use_net', 'max_wattage', ''), { optional: true })}
        ${toggle(`${p}-net-solar`, '☀ Use Solar', v('use_net', 'use_solar', true) !== false)}
      </div>
      <div class="action-params" data-params="car_charge"${shown('car_charge')}>
        ${toggle(`${p}-car-solar`, '☀ Use Solar', v('car_charge', 'use_solar', true) !== false)}
        ${wattCard(`${p}-car-net-card`, 'Grid', '#2563eb', carNet !== 0,
          paramRow('Power', `${p}-car-net`, 'W', carNet || kwpW, { min: -100000, title: 'Power the car takes from the grid' }))}
        ${wattCard(`${p}-car-bat-card`, 'Battery', '#7c3aed', carBat !== 0,
          paramRow('Power', `${p}-car-bat`, 'W', carBat || kwpW, { min: -100000, title: '+ the car draws from the house battery · − the house battery charges too' })
          + paramRow('Until', `${p}-car-bat-until`, '%', v('car_charge', 'use_battery_until_pct', ''), { optional: true, max: 100, step: 1 }))}
      </div>
      <div class="af-cond" id="${p}-cond"></div>
    </div>
  </div>`;
}

export interface ActionForm {
  readonly action: string;
  select(action: string): void;
  /** The form as service fields for one slot. */
  read(): FormFields;
  /** Fill the form from fields read earlier (paste). */
  load(fields: FormFields): void;
}

/** Wire up a form rendered by actionFormHtml. */
export function wireActionForm(
  sr: ShadowRoot, p: string, action: string, cfg: Record<string, any>, kwpW: number,
): ActionForm {
  const root = sr.getElementById(`${p}-af`)!;
  const condEl = sr.getElementById(`${p}-cond`)!;
  const input = (id: string) => sr.getElementById(`${p}-${id}`) as HTMLInputElement | null;
  const num = (id: string): number | null => {
    const raw = input(id)?.value ?? '';
    const n = parseFloat(raw);
    return raw === '' || isNaN(n) ? null : n;
  };
  const isOn = (id: string) => sr.getElementById(`${p}-${id}`)?.classList.contains('on') ?? true;

  let selAction = action;
  let conds: Condition[] = (cfg.when ?? []).map((c: Condition) => ({ ...c }));
  let otherAction: string = cfg.otherwise?.action ?? (action === 'idle' ? 'use_net' : 'idle');
  // The stored fallback's own settings, kept while its action stays the same.
  const storedOther = { action: cfg.otherwise?.action, config: cfg.otherwise?.config ?? {} };

  const select = (a: string) => {
    selAction = a;
    root.querySelectorAll('.ap-btn[data-action]').forEach(b =>
      b.classList.toggle('sel', (b as HTMLElement).dataset.action === a));
    root.querySelectorAll('[data-params]').forEach(el => {
      (el as HTMLElement).hidden = (el as HTMLElement).dataset.params !== a;
    });
  };

  const renderConds = () => {
    const rows = conds.map((c, ci) => {
      const m = COND_META[c.on];
      return `<div class="af-cond-row" data-ci="${ci}">
        <select class="af-select" data-cond-on>
          ${(Object.keys(COND_META) as Condition['on'][]).map(k =>
            `<option value="${k}"${k === c.on ? ' selected' : ''}>${COND_META[k].name}</option>`).join('')}
        </select>
        <select class="af-select" data-cond-op>
          <option value="above"${c.op === 'above' ? ' selected' : ''}>≥</option>
          <option value="below"${c.op === 'below' ? ' selected' : ''}>≤</option>
        </select>
        <input class="param-input" data-cond-val type="number" step="${m.step}" value="${c.value}">
        <span class="param-unit">${m.unit}</span>
        <button class="af-x" data-cond-del title="Remove condition">✕</button>
      </div>`;
    }).join('');
    const other = conds.length ? `<div class="af-other">
        <span class="af-label">otherwise</span>
        ${ACTION_DEFS.map(a => `<button class="af-other-btn${a.key === otherAction ? ' sel' : ''}" data-other="${a.key}" style="--btn-c:${buttonColor(a)}">${a.label}</button>`).join('')}
      </div>` : '';
    const add = conds.length < MAX_CONDITIONS
      ? `<button class="af-link" data-cond-add>${conds.length ? '+ and' : '+ Only when…'}</button>` : '';
    condEl.innerHTML = `${conds.length ? '<div class="af-label">Only when</div>' : ''}${rows}${add}${other}`;
  };

  root.querySelectorAll('.ap-btn[data-action]').forEach(btn =>
    btn.addEventListener('click', () => select((btn as HTMLElement).dataset.action!)));
  root.querySelectorAll('.toggle-btn').forEach(btn =>
    btn.addEventListener('click', () => btn.classList.toggle('on')));
  // Tapping a card's header switches it; tapping its inputs doesn't.
  root.querySelectorAll('.watt-card-header').forEach(h =>
    h.addEventListener('click', () => h.parentElement!.classList.toggle('on')));

  // The condition rows are re-rendered, so listen on their container.
  condEl.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    const row = t.closest('[data-ci]') as HTMLElement | null;
    if (t.closest('[data-cond-add]')) {
      conds.push({ on: 'soc', op: 'above', value: COND_META.soc.def });
    } else if (t.closest('[data-cond-del]') && row) {
      conds.splice(+row.dataset.ci!, 1);
    } else if (t.closest('[data-other]')) {
      otherAction = (t.closest('[data-other]') as HTMLElement).dataset.other!;
    } else {
      return;
    }
    renderConds();
  });
  condEl.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const row = t.closest('[data-ci]') as HTMLElement | null;
    if (!row) return;
    const c = conds[+row.dataset.ci!];
    if (t.matches('[data-cond-on]')) {
      c.on = t.value as Condition['on'];
      c.value = COND_META[c.on].def;
      renderConds();
    } else if (t.matches('[data-cond-op]')) {
      c.op = t.value as Condition['op'];
    } else if (t.matches('[data-cond-val]')) {
      const n = parseFloat(t.value);
      if (!isNaN(n)) c.value = n;
    }
  });
  renderConds();

  const read = (): FormFields => {
    const f: FormFields = { action: selAction };
    if (selAction === 'charge' || selAction === 'discharge') {
      f.wattage = num(`${selAction}-w`) ?? kwpW;
      const until = num(`${selAction}-until`);
      if (until != null) f.until_pct = until;
    } else if (selAction === 'use_net') {
      f.use_solar = isOn('net-solar');
      const max = num('net-max');
      if (max != null) f.max_wattage = max;
    } else if (selAction === 'car_charge') {
      f.use_solar = isOn('car-solar');
      f.use_net_wattage = isOn('car-net-card') ? num('car-net') ?? 0 : 0;
      f.use_battery_wattage = isOn('car-bat-card') ? num('car-bat') ?? 0 : 0;
      const until = num('car-bat-until');
      if (until != null && f.use_battery_wattage !== 0) f.use_battery_until_pct = until;
    }
    if (conds.length) {
      f.when = conds.map(c => ({ ...c }));
      f.otherwise = {
        action: otherAction,
        ...(otherAction === storedOther.action ? storedOther.config : defaultFields(otherAction, kwpW)),
      };
    }
    return f;
  };

  const load = (f: FormFields) => {
    select(f.action);
    const set = (id: string, val: unknown) => { const el = input(id); if (el) el.value = val != null ? String(val) : ''; };
    const setOn = (id: string, on: boolean) => sr.getElementById(`${p}-${id}`)?.classList.toggle('on', on);
    if (f.action === 'charge' || f.action === 'discharge') {
      set(`${f.action}-w`, f.wattage);
      set(`${f.action}-until`, f.until_pct);
    } else if (f.action === 'use_net') {
      set('net-max', f.max_wattage);
      setOn('net-solar', f.use_solar !== false);
    } else if (f.action === 'car_charge') {
      setOn('car-solar', f.use_solar !== false);
      setOn('car-net-card', !!f.use_net_wattage);
      setOn('car-bat-card', !!f.use_battery_wattage);
      if (f.use_net_wattage) set('car-net', f.use_net_wattage);
      if (f.use_battery_wattage) set('car-bat', f.use_battery_wattage);
      set('car-bat-until', f.use_battery_until_pct);
    }
    conds = (f.when ?? []).map((c: Condition) => ({ ...c }));
    otherAction = f.otherwise?.action ?? 'idle';
    if (f.otherwise) {
      const { action: a, ...rest } = f.otherwise;
      storedOther.action = a;
      storedOther.config = rest;
    }
    renderConds();
  };

  return { get action() { return selAction; }, select, read, load };
}
