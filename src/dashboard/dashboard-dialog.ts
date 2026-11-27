import { DeviceAvailable, Slot, CardConfig } from '../shared/types';
import { esc, priceColor, priceScore, priceScoreColor, slotAction, slotTimeStr, slotEndTimeStr } from '../shared/utils';
import { FormFields, actionFormHtml, slotSummary, wireActionForm } from '../shared/action-form';

interface SlotClipboard {
  fields: FormFields;
  locked: boolean;
}

let _clipboard: SlotClipboard | null = null;

function pasteTitle(cb: SlotClipboard | null): string {
  return cb ? `Paste & Save (${slotSummary(cb.fields.action, cb.fields)}) (Ctrl+V)` : 'Paste & Save (Ctrl+V)';
}

// Shown at the foot of the dialog; the card's key handler implements them.
// The editing ones only apply when the card can call the integration.
const NAV_SHORTCUTS: [string, string][] = [
  ['← →', 'slot'], ['Shift ← →', 'day'], ['Home End', 'first / last'], ['N', 'now'], ['Esc', 'close'],
];
const EDIT_SHORTCUTS: [string, string][] = [
  ['1–5', 'action'], ['L', 'lock'], ['Ctrl S', 'apply'], ['Ctrl C / V', 'copy / paste'],
  ['B', 'bulk'], ['P', 'plan'],
];

export interface DialogContext {
  sr: ShadowRoot;
  slots: Slot[];
  slotIdx: number;
  nowIdx: number;
  config: CardConfig;
  hass: any;
  kwpEntityId: string | null;
  planningEntityId: string | null;
  devColors: Record<string, string>;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onBulkEdit: () => void;
  onPlan: () => void;
  /** Days the dialog can switch between; hidden when there is only one. */
  days: { label: string; active: boolean }[];
  onSwitchDay: (dayIdx: number) => void;
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

  // Schedulable devices come from the planning entity resolved by the card.
  const planEntity = ctx.planningEntityId || config.integration?.planning_entity;
  const devicesAvailable: DeviceAvailable[] =
    (planEntity ? hass?.states[planEntity]?.attributes?.devices_available : null) ?? [];

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
  const allPrices = slots.map(s => s.price);
  const trio = [{label:'Prev',idx:i-1},{label:'Now',idx:i,cur:true},{label:'Next',idx:i+1}] as any[];
  const trioHtml = trio.map(({label, idx, cur}: any, ti: number) => {
    const arrow = ti < 2 ? `<div class="pt-arrow">›</div>` : '';
    const isNav = !cur && idx >= 0 && idx < n;
    const isNow = idx === ns;
    if (idx < 0 || idx >= n) return `<div class="pt-slot${cur?' cur':''}${isNow?' is-now':''}">\
      <div class="pt-label">${label}</div><div class="pt-time">–</div>\
      <div class="pt-price" style="color:#4a5568">–</div></div>${arrow}`;
    const p = slots[idx].price, c = priceColor(p), w = Math.min(100, Math.max(5, p/52*100));
    const score = priceScore(p, allPrices);
    const scoreCol = priceScoreColor(score);
    const scoreLine = cur ? `<div class="pt-score" style="color:${scoreCol}">Score: ${score}/10</div>` : '';
    return `<div class="pt-slot${cur?' cur':''}${isNav?' nav':''}${isNow?' is-now':''}"${isNav?` data-nav="${idx}"`:''}
      title="${isNav?'Click to navigate':''}">
      <div class="pt-label">${label}</div>
      <div class="pt-time">${slotTimeStr(slots[idx])}</div>
      <div class="pt-price" style="color:${c}">${p.toFixed(2)}<span class="pt-unit">ct</span></div>
      ${scoreLine}
      <div class="pt-bar" style="background:${c};width:${w}%"></div>
    </div>${arrow}`;
  }).join('');

  // Action editor
  const curAction = slot.action || (slot.battery_manual_override_w! > 0 ? 'charge' : slot.battery_manual_override_w! < 0 ? 'discharge' : 'idle');
  const aCfg = slot.action_config || {};
  const kwpW = Math.round((parseFloat(hass?.states[kwpEntityId!]?.state) || 3) * 1000);
  const canEdit = !!(deviceId || entryId);
  const showEditor = canEdit && config.layout?.show_actions !== false;
  const editHtml = showEditor ? `<div class="action-section" id="action-section">
      ${actionFormHtml('sd', curAction, aCfg, kwpW)}
    </div>` : canEdit ? '' : `<div class="edit-hint">
      💡 To enable slot editing, configure <strong style="color:var(--text-bright)">integration.device_id</strong>
      (or legacy <strong style="color:var(--text-bright)">integration.entry_id</strong>)
      in your card config. Find it in Settings → Devices &amp; Services → EMS → (⋮) → Information.
    </div>`;

  // Everything known about the slot, on one wrapping line.
  const chips = [
    slot.battery_prediction != null ? ['Predicted battery', `🔋 ${slot.battery_prediction.toFixed(0)} %`, ''] : null,
    slot.solar_w != null ? ['Predicted solar', `☀ ${Math.round(slot.solar_w)} W`, '#eab308'] : null,
    slot.load_w != null ? ['Predicted house load', `⌂ ${Math.round(slot.load_w)} W`, '#a855f7'] : null,
    slot._injPrice ? ['Injection price', `↑ ${slot._injPrice.toFixed(2)} ct`, ''] : null,
    slot.car_surplus ? ['The car is expected to charge on excess solar', '☀🚗 surplus', '#ca8a04'] : null,
    slot.locked ? ['Locked: the optimizer leaves this slot alone', '🔒', ''] : null,
  ].filter(Boolean) as [string, string, string][];
  const chipsHtml = chips.length ? `<div class="pop-chips">${chips.map(([title, text, color]) =>
    `<span class="pop-chip" title="${title}"${color ? ` style="color:${color}"` : ''}>${text}</span>`).join('')}</div>` : '';

  sr.getElementById('popup')!.innerHTML = `
    <div class="ph">
      <button class="ph-nav-btn" id="pop-prev" title="Previous slot (←)" ${i===0?'disabled':''}>‹</button>
      <div class="ph-mid">
        <div class="ph-time">${slotTimeStr(slot)} – ${slotEndTimeStr(slots, i)}</div>
        <div class="ph-sum" style="color:${act.key === 'idle' ? 'var(--text-dim)' : act.color}">${esc(slotSummary(curAction, aCfg))}</div>
      </div>
      <button class="ph-nav-btn" id="pop-next" title="Next slot (→)" ${i===n-1?'disabled':''}>›</button>
      <div class="ph-actions">
        ${canEdit ? `<button class="ph-bulk-btn" id="pop-plan" title="Schedule the car or set a battery goal (P)"><ha-icon icon="mdi:calendar-clock"></ha-icon></button>` : ''}
        ${canEdit ? `<button class="ph-bulk-btn" id="pop-bulk" title="Bulk edit slots (B)">⊞</button>` : ''}
        <button class="ph-close" id="pop-close" title="Close (Esc)">✕</button>
      </div>
    </div>

    <div class="pop-body">
      <div class="pop-nav-wrap">
        ${ctx.days.length > 1 ? `<div class="pop-day-btns">${ctx.days.map((d, di) =>
          `<button class="pop-day-btn${d.active ? ' active' : ''}" data-day="${di}">${esc(d.label)}</button>`
        ).join('')}</div>` : ''}
        <div class="pop-nav-track" id="pop-nav-track" title="Jump to slot">
          <div class="pop-nav-segs">${navSegs}</div>
          <div class="pop-nav-dots">${navDots}</div>
          <div class="pop-nav-cursor" style="left:${(i+0.5)/n*100}%"></div>
          <div class="pop-nav-now"    style="left:${ns>=0?(ns+0.5)/n*100:50}%;${ns<0?'display:none':''}"></div>
        </div>
      </div>

      <div class="price-trio">${trioHtml}</div>
      ${chipsHtml}
      ${editHtml}
      ${canEdit && devicesAvailable.length > 0 ? (() => {
        const slotDevices = slot.devices || [];
        const devToggles = devicesAvailable.map((d, di) => {
          const existing = slotDevices.find(sd => sd.name === d.name);
          const isOn = !!existing;
          // Only wattage devices get a number field. On/off devices get no input
          // at all, mode devices get a mode picker.
          let control = '';
          if (d.control === 'modes') {
            const modes = d.modes || [];
            const sel = existing?.mode ?? modes[0];
            control = `<select class="dev-toggle-select" data-dev-sched-mode="${di}">
              ${modes.map(m => `<option value="${esc(m)}"${m === sel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
            </select>`;
          } else if (d.control !== 'switch') {
            const watt = existing?.manual_override_w ?? existing?.allocated_wattage_w ?? d.default_wattage;
            control = `<input class="dev-toggle-input" data-dev-sched-input="${di}" type="number" min="0" max="100000" step="100" value="${watt}">
              <span class="dev-toggle-unit">W</span>`;
          }
          return `<div class="dev-toggle-card${isOn ? ' on' : ''}" data-dev-sched="${di}">
            <div class="dev-toggle-dot" style="background:${devColors[d.name] || '#3b82f6'}"></div>
            <span class="dev-toggle-name">${esc(d.name)}</span>
            ${control}
          </div>`;
        }).join('');
        return `<div class="dev-toggle-section">
          <div class="dev-toggle-title">Devices</div>
          <div class="dev-toggle-list">${devToggles}</div>
        </div>`;
      })() : ''}
      <div class="pop-keys">${[...NAV_SHORTCUTS, ...(canEdit ? EDIT_SHORTCUTS : [])]
        .map(([k, label]) => `<span><kbd>${k}</kbd> ${label}</span>`).join('')}</div>
    </div>

    ${showEditor ? `<div class="pop-foot">
      <label class="pop-lock" title="Keep the optimizer off this slot (L)">
        <input type="checkbox" id="action-locked" checked>🔒 Lock
      </label>
      <button class="action-copy-btn" id="action-copy" title="Copy slot config (Ctrl+C)"><ha-icon icon="mdi:content-copy"></ha-icon></button>
      <button class="action-paste-btn" id="action-paste" ${_clipboard ? '' : 'disabled'} title="${esc(pasteTitle(_clipboard))}"><ha-icon icon="mdi:content-paste"></ha-icon></button>
      <button class="action-apply-btn" id="action-apply" title="Apply (Ctrl+S)">Apply</button>
    </div>` : ''}`;

  // Wire up popup events
  sr.getElementById('pop-close')!.addEventListener('click', () => ctx.onClose());
  sr.getElementById('pop-bulk')?.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onBulkEdit(); });
  sr.getElementById('pop-plan')?.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onPlan(); });
  sr.getElementById('pop-prev')!.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(i-1); });
  sr.getElementById('pop-next')!.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(i+1); });

  sr.querySelectorAll('.pop-day-btn[data-day]').forEach(el => {
    el.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      if (!el.classList.contains('active')) ctx.onSwitchDay(+(el as HTMLElement).dataset.day!);
    });
  });
  sr.querySelectorAll('.pop-nav-seg').forEach(el => {
    el.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(+(el as HTMLElement).dataset.i!); });
  });
  sr.querySelectorAll('.pt-slot.nav[data-nav]').forEach(el => {
    el.addEventListener('click', (e: Event) => { e.stopPropagation(); ctx.onNavigate(+(el as HTMLElement).dataset.nav!); });
  });

  if (canEdit) {
    const form = showEditor ? wireActionForm(sr, 'sd', curAction, aCfg, kwpW) : null;
    const slotTime = slot.start ?? slot.time;

    /** Save *fields* for this slot as one planning_bulk entry, like bulk edit. */
    const save = (fields: FormFields, locked: boolean, btn: HTMLButtonElement, label?: string) => {
      hass.callService('ha_ems', 'planning_bulk', {
        device_id: deviceId || entryId,
        slots: [{ time: slotTime, locked, ...fields }],
      }).then(() => {
        if (label) btn.textContent = '✓ Applied';
        btn.classList.add('success');
        setTimeout(() => { if (label) btn.textContent = label; btn.classList.remove('success'); }, 2000);
      }).catch((err: any) => {
        if (label) btn.textContent = '✕ Error';
        btn.classList.add('error');
        console.error('EMS card error:', err);
      });
    };
    const lockedChk = () => sr.getElementById('action-locked') as HTMLInputElement | null;

    sr.getElementById('action-apply')?.addEventListener('click', (e: Event) => {
      if (form) save(form.read(), lockedChk()?.checked ?? false, e.currentTarget as HTMLButtonElement, 'Apply');
    });

    // Copy: snapshot the form into the module-level clipboard
    sr.getElementById('action-copy')?.addEventListener('click', (e: Event) => {
      if (!form) return;
      _clipboard = { fields: form.read(), locked: lockedChk()?.checked ?? false };
      const pasteBtn = sr.getElementById('action-paste') as HTMLButtonElement | null;
      if (pasteBtn) {
        pasteBtn.removeAttribute('disabled');
        pasteBtn.title = pasteTitle(_clipboard);
      }
      const copyBtn = e.currentTarget as HTMLButtonElement;
      copyBtn.classList.add('success');
      setTimeout(() => copyBtn.classList.remove('success'), 1500);
    });

    // Paste: load the clipboard into the form and save it
    sr.getElementById('action-paste')?.addEventListener('click', (e: Event) => {
      if (!form || !_clipboard) return;
      form.load(_clipboard.fields);
      const chk = lockedChk();
      if (chk) chk.checked = _clipboard.locked;
      save(_clipboard.fields, _clipboard.locked, e.currentTarget as HTMLButtonElement);
    });

    // Device toggle cards — scheduling
    const devSlotTime = slot.start ?? slot.time;

    /** Per-slot payload for a device, shaped by how that device is controlled. */
    const deviceParams = (di: number): Record<string, any> => {
      const d = devicesAvailable[di];
      if (d.control === 'modes') {
        const sel = sr.querySelector(`[data-dev-sched-mode="${di}"]`) as HTMLSelectElement | null;
        const mode = sel?.value ?? (d.modes || [])[0];
        return mode ? { mode } : {};
      }
      if (d.control === 'switch') return {};
      const inp = sr.querySelector(`[data-dev-sched-input="${di}"]`) as HTMLInputElement | null;
      const watt = inp ? parseFloat(inp.value) : NaN;
      return { wattage: isNaN(watt) ? d.default_wattage : watt };
    };

    const scheduleDevice = (di: number, on: boolean): Promise<any> =>
      hass.callService(
        'ha_ems',
        on ? 'planning_device_slot' : 'planning_device_clear',
        {
          device_id: deviceId || entryId,
          time: devSlotTime,
          device_name: devicesAvailable[di].name,
          ...(on ? deviceParams(di) : {}),
        },
      );

    sr.querySelectorAll('.dev-toggle-card[data-dev-sched]').forEach(card => {
      card.addEventListener('click', (e: Event) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'OPTION') return;
        e.stopPropagation();
        card.classList.toggle('on');
        const isOn = card.classList.contains('on');
        const di = parseInt((card as HTMLElement).dataset.devSched!);
        if (!devicesAvailable[di]) return;
        scheduleDevice(di, isOn).catch((err: any) => {
          // Put the card back in sync with the backend if the call failed.
          card.classList.toggle('on', !isOn);
          console.error('Device schedule error:', err);
        });
      });
    });

    // Editing a wattage or picking a mode schedules the device too, so you do
    // not have to toggle the card first.
    sr.querySelectorAll('[data-dev-sched-input], [data-dev-sched-mode]').forEach(el => {
      el.addEventListener('click', (e: Event) => e.stopPropagation());
      el.addEventListener('change', (e: Event) => {
        e.stopPropagation();
        const ds = (el as HTMLElement).dataset;
        const di = parseInt((ds.devSchedInput ?? ds.devSchedMode)!);
        if (!devicesAvailable[di]) return;
        sr.querySelector(`[data-dev-sched="${di}"]`)?.classList.add('on');
        scheduleDevice(di, true).catch((err: any) => console.error('Device schedule error:', err));
      });
    });
  }
}
