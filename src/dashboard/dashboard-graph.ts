import { Slot, CardConfig } from '../shared/types';
import { BATT_AXIS_TICKS, CHART_H, Y_STEPS } from '../shared/constants';
import { priceColor, priceScore, priceScoreColor, slotAction, slotHasCar, slotTimeStr, slotEndTimeStr } from '../shared/utils';

export function renderMainChart(
  sr: ShadowRoot,
  slots: Slot[],
  config: CardConfig,
  hass: any,
  nowIdx: number,
  devColors: Record<string, string>,
  onSlotClick: (i: number) => void,
): void {
  const n = slots.length;
  const prices = slots.map(s => s.price);
  const maxP = Math.max(...prices, 45);
  const ns = nowIdx;

  // Y-axis & grid lines
  const ySteps = Y_STEPS.filter(v => v <= maxP + 5);
  sr.getElementById('y-axis')!.innerHTML = ySteps.map(v =>
    `<div class="y-label" style="bottom:${v / maxP * CHART_H}px">${v}</div>`
  ).join('');
  sr.getElementById('grid-lines')!.innerHTML = ySteps.map(v =>
    `<div class="grid-line" style="bottom:${v / maxP * CHART_H}px"></div>`
  ).join('');

  // Now line
  let nowLineHtml = '';
  if (ns >= 0) {
    const now  = new Date();
    const t0   = new Date(slots[ns].start ?? slots[ns].time!);
    const t1   = ns + 1 < n ? new Date(slots[ns + 1].start ?? slots[ns + 1].time!) : new Date(t0.getTime() + 3600000);
    const frac = Math.min(1, Math.max(0, (now.getTime() - t0.getTime()) / (t1.getTime() - t0.getTime())));
    const pct  = ((ns + frac) / n * 100).toFixed(2);
    nowLineHtml = `<div class="now-line" style="left:${pct}%;height:${CHART_H}px">
      <div class="now-label">Now</div></div>`;
  }

  // Bars
  sr.getElementById('bars')!.innerHTML = nowLineHtml + slots.map((slot, i) => {
    const h   = Math.max(2, slot.price / maxP * CHART_H);
    const col = priceColor(slot.price);
    return `<div class="slot${i === ns ? ' now-slot' : ''}" data-i="${i}">
      <div class="price-bar" style="height:${h}px;background:${col}"></div>
    </div>`;
  }).join('');

  const tooltipEl = sr.getElementById('tooltip')!;
  const allPrices = slots.map(s => s.price);
  sr.getElementById('bars')!.querySelectorAll('.slot').forEach(el => {
    const i = +(el as HTMLElement).dataset.i!;
    el.addEventListener('click', () => onSlotClick(i));
    el.addEventListener('mouseenter', () => {
      const slot = slots[i];
      const col  = priceColor(slot.price);
      const act  = slotAction(slot);
      const score = priceScore(slot.price, allPrices);
      const scoreCol = priceScoreColor(score);
      tooltipEl.innerHTML = `<div class="tip-time">${slotTimeStr(slot)}–${slotEndTimeStr(slots, i)}</div><div style="color:${col};font-weight:700">${slot.price.toFixed(2)} ct${slot._injPrice ? ` <span style="color:var(--text-dim);font-weight:400">↑ ${slot._injPrice.toFixed(2)}</span>` : ''}</div><div class="tip-score" style="color:${scoreCol}">Score: ${score}/10</div><div class="tip-act" style="color:${act.color}">${act.label}</div>`;
      const rect = el.getBoundingClientRect();
      const top  = rect.top - (tooltipEl as HTMLElement).offsetHeight - 8;
      const left = rect.left + rect.width / 2 - (tooltipEl as HTMLElement).offsetWidth / 2;
      (tooltipEl as HTMLElement).style.top  = `${Math.max(4, top)}px`;
      (tooltipEl as HTMLElement).style.left = `${Math.min(window.innerWidth - (tooltipEl as HTMLElement).offsetWidth - 4, Math.max(4, left))}px`;
      tooltipEl.classList.add('visible');
    });
    el.addEventListener('mousemove', () => {
      const rect = el.getBoundingClientRect();
      const top  = rect.top - (tooltipEl as HTMLElement).offsetHeight - 8;
      const left = rect.left + rect.width / 2 - (tooltipEl as HTMLElement).offsetWidth / 2;
      (tooltipEl as HTMLElement).style.top  = `${Math.max(4, top)}px`;
      (tooltipEl as HTMLElement).style.left = `${Math.min(window.innerWidth - (tooltipEl as HTMLElement).offsetWidth - 4, Math.max(4, left))}px`;
    });
    el.addEventListener('mouseleave', () => tooltipEl.classList.remove('visible'));
  });

  // Action strip
  sr.getElementById('action-strip')!.innerHTML = slots.map((slot, i) => {
    const act = slotAction(slot);
    const hasCar = slotHasCar(slot);
    let bg: string;
    if (act.key === 'car_charge') {
      bg = '#ca8a04';
    } else if (hasCar) {
      bg = `linear-gradient(to right, ${act.color} 60%, #ca8a04 60%)`;
    } else {
      bg = act.color;
    }
    const title = hasCar && act.key !== 'car_charge' ? `${act.label} + Car` : act.label;
    return `<div class="ac" data-i="${i}" style="background:${bg}" title="${title}"></div>`;
  }).join('');
  sr.getElementById('action-strip')!.querySelectorAll('.ac').forEach(el => {
    el.addEventListener('click', () => onSlotClick(+(el as HTMLElement).dataset.i!));
  });

  // Device strip — one column per slot, one pip per device scheduled in it
  const deviceStrip = sr.getElementById('device-strip') as HTMLElement;
  const anyDevices = slots.some(s => (s.devices || []).length > 0);
  deviceStrip.hidden = !anyDevices || config.layout?.show_actions === false;
  if (!deviceStrip.hidden) {
    deviceStrip.innerHTML = slots.map((slot, i) => {
      const pips = (slot.devices || []).map(d =>
        `<div class="dc-pip" style="background:${devColors[d.name] || '#3b82f6'}"></div>`
      ).join('');
      const names = (slot.devices || []).map(d => d.name).join(', ');
      return `<div class="dc" data-i="${i}" title="${names}">${pips}</div>`;
    }).join('');
    deviceStrip.querySelectorAll('.dc').forEach(el => {
      el.addEventListener('click', () => onSlotClick(+(el as HTMLElement).dataset.i!));
    });
  }

  // X-axis labels
  const every = Math.max(1, Math.floor(n / 12));
  sr.getElementById('x-axis')!.innerHTML = slots.map((slot, i) =>
    `<div class="x-lbl">${i % every === 0 ? slotTimeStr(slot) : ''}</div>`
  ).join('');
}

/** Normalise a card colour option to a CSS colour.
 *
 *  HA's `color_rgb` selector stores `[r, g, b]`, so reading `.r/.g/.b` yields
 *  `rgb(undefined,undefined,undefined)` -- an invalid colour that computes to
 *  `stroke: none`, silently making the overlay unpaintable. Objects and plain
 *  CSS strings are accepted too, and anything unrecognised falls back.
 */
export function rgbToCss(color: any, fallback: string): string {
  if (Array.isArray(color) && color.length >= 3) {
    return `rgb(${color[0]},${color[1]},${color[2]})`;
  }
  if (color && typeof color === 'object' && color.r != null) {
    return `rgb(${color.r},${color.g},${color.b})`;
  }
  if (typeof color === 'string' && color.trim()) return color;
  return fallback;
}

/** Resolve the battery SoC entity: card config first, then whatever the
 *  integration itself was configured with (exposed on the planning entity).
 *  Falling back means the overlay works without duplicating the entity id in
 *  the card config. */
export function resolveBatteryEntity(config: CardConfig, hass: any, planningEntityId: string | null): string | null {
  const fromCard = config.integration?.battery_entity;
  if (fromCard) return fromCard;
  const planEntity = planningEntityId || config.integration?.planning_entity;
  const fromIntegration = planEntity ? hass?.states[planEntity]?.attributes?.battery_entity_id : null;
  return fromIntegration || null;
}

export function renderBatteryOverlay(
  sr: ShadowRoot,
  slots: Slot[],
  config: CardConfig,
  hass: any,
  planningEntityId: string | null,
): void {
  const n = slots.length;
  const battSvg = sr.getElementById('battery-svg') as unknown as SVGElement | null;
  const battAxis = sr.getElementById('batt-axis') as HTMLElement | null;

  const battEntity = resolveBatteryEntity(config, hass, planningEntityId);
  const battState  = battEntity ? hass?.states[battEntity] : null;
  const rawPct     = battState ? parseFloat(battState.state) : NaN;
  const currentPct = isNaN(rawPct) ? null : rawPct;

  // The prediction line comes from the backend and needs no card config, so it
  // is gated only on the data actually being there. The current-SoC line needs
  // a readable entity.
  const predPoints = slots
    .map((s, idx) => s.battery_prediction == null
      ? null
      : { x: (idx + 0.5) / n * 100, y: (1 - s.battery_prediction / 100) * CHART_H })
    .filter(Boolean) as { x: number; y: number }[];

  const enabled     = config.layout?.show_battery !== false && n > 0;
  const showPred    = enabled && predPoints.length > 1;
  const showCurrent = enabled && currentPct != null;

  const lineColor = rgbToCss(config.integration?.battery_line_color, '#06b6d4');

  if (battSvg) {
    if (showPred || showCurrent) {
      // preserveAspectRatio="none" stretches x by chartWidth/100 while leaving y
      // at 1x, so only geometry that tolerates that distortion may live in here.
      // Text belongs in the HTML axis column below.
      battSvg.setAttribute('viewBox', `0 0 100 ${CHART_H}`);
      battSvg.setAttribute('preserveAspectRatio', 'none');

      let svgContent = '';
      if (showPred) {
        const pathD = predPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
        svgContent += `<path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-dasharray="5 4" opacity="0.95" vector-effect="non-scaling-stroke"/>`;
      }
      if (showCurrent) {
        const y = (1 - currentPct! / 100) * CHART_H;
        svgContent += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${lineColor}" stroke-width="1.5" stroke-dasharray="2 3" opacity="0.7" vector-effect="non-scaling-stroke"/>`;
      }
      battSvg.innerHTML = svgContent;
      // Must be the attribute, not the `hidden` property: `hidden` is defined on
      // HTMLElement, not SVGElement, so assigning it here only sets a JS expando
      // and leaves the markup's hidden attribute (and display:none) in place.
      battSvg.removeAttribute('hidden');
    } else {
      battSvg.innerHTML = '';
      battSvg.setAttribute('hidden', '');
    }
  }

  // Battery % axis — a fixed column outside the scrolling chart body, so the
  // readout stays put and is never subject to the SVG's horizontal stretch.
  if (battAxis) {
    if (showPred || showCurrent) {
      let axisHtml = BATT_AXIS_TICKS.map(v =>
        `<div class="batt-tick" style="bottom:${v / 100 * CHART_H}px;color:${lineColor}">${v}</div>`
      ).join('');
      if (showCurrent) {
        const bottom = Math.max(0, Math.min(CHART_H, currentPct! / 100 * CHART_H));
        axisHtml += `<div class="batt-now" style="bottom:${bottom}px;color:${lineColor};border-color:${lineColor}">${currentPct!.toFixed(0)}%</div>`;
      }
      battAxis.innerHTML = axisHtml;
      battAxis.removeAttribute('hidden');
    } else {
      battAxis.innerHTML = '';
      battAxis.setAttribute('hidden', '');
    }
  }
}

export function renderBrush(
  sr: ShadowRoot,
  slots: Slot[],
  activeIdx: number | null,
  nowIdx: number,
  config: CardConfig,
  onOpen: (i: number) => void,
  onScroll: (i: number) => void,
): void {
  const n  = slots.length;
  const ns = nowIdx;

  sr.getElementById('brush-segs')!.innerHTML = slots.map((slot, i) =>
    `<div class="brush-seg" data-i="${i}" style="background:${priceColor(slot.price)}"></div>`
  ).join('');

  sr.getElementById('brush-dots')!.innerHTML = slots.map((slot, i) => {
    const act = slotAction(slot);
    if (act.key === 'idle') return '';
    return `<div class="brush-dot" style="left:${(i+0.5)/n*100}%;background:${act.color}"></div>`;
  }).join('');

  const brushNow = sr.getElementById('brush-now') as HTMLElement;
  if (ns >= 0) {
    brushNow.style.left    = `${(ns+0.5)/n*100}%`;
    brushNow.style.display = 'block';
    sr.getElementById('brush-now-label')!.textContent = `Now ${slotTimeStr(slots[ns])}`;
  } else {
    brushNow.style.display = 'none';
  }

  const cur = sr.getElementById('brush-cursor') as HTMLElement;
  if (activeIdx !== null) {
    cur.style.display = 'block';
    cur.style.left    = `${(activeIdx+0.5)/n*100}%`;
  } else {
    cur.style.display = 'none';
  }

  const chartHidden = config.layout?.show_chart === false;
  const track = sr.getElementById('brush-track') as HTMLElement;
  track.onclick = (e: MouseEvent) => {
    const rect = track.getBoundingClientRect();
    const idx  = Math.floor((e.clientX - rect.left) / rect.width * n);
    if (idx >= 0 && idx < n) {
      if (chartHidden || activeIdx !== null) onOpen(idx);
      else onScroll(idx);
    }
  };
  sr.querySelectorAll('.brush-seg').forEach(el => {
    el.addEventListener('click', e => {
      (e as Event).stopPropagation();
      const i = +(el as HTMLElement).dataset.i!;
      if (chartHidden || activeIdx !== null) onOpen(i);
      else onScroll(i);
    });
  });
}

export function scrollToSlot(
  sr: ShadowRoot,
  totalSlots: number,
  i: number,
  instant?: boolean,
): void {
  const wrap  = sr.getElementById('chart-wrap') as HTMLElement;
  const body  = sr.getElementById('chart-body') as HTMLElement;
  const doScroll = () => {
    const slotW = body.scrollWidth / totalSlots;
    if (slotW === 0) return;
    wrap.scrollTo({ left: Math.max(0, (i + 0.5) * slotW - wrap.clientWidth / 2), behavior: instant ? 'instant' : 'smooth' });
  };
  if (instant || body.scrollWidth > 0) {
    requestAnimationFrame(doScroll);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  }
}
