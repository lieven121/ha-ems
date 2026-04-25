import { Slot, CardConfig } from '../shared/types';
import { CHART_H, Y_STEPS } from '../shared/constants';
import { priceColor, slotAction, slotHasCar, slotTimeStr, slotEndTimeStr } from '../shared/utils';

export function renderMainChart(
  sr: ShadowRoot,
  slots: Slot[],
  config: CardConfig,
  hass: any,
  nowIdx: number,
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
  sr.getElementById('bars')!.querySelectorAll('.slot').forEach(el => {
    const i = +(el as HTMLElement).dataset.i!;
    el.addEventListener('click', () => onSlotClick(i));
    el.addEventListener('mouseenter', () => {
      const slot = slots[i];
      const col  = priceColor(slot.price);
      const act  = slotAction(slot);
      tooltipEl.innerHTML = `<div class="tip-time">${slotTimeStr(slot)}–${slotEndTimeStr(slots, i)}</div><div style="color:${col};font-weight:700">${slot.price.toFixed(2)} ct${slot._injPrice ? ` <span style="color:var(--text-dim);font-weight:400">↑ ${slot._injPrice.toFixed(2)}</span>` : ''}</div><div class="tip-act" style="color:${act.color}">${act.label}</div>`;
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

  // X-axis labels
  const every = Math.max(1, Math.floor(n / 12));
  sr.getElementById('x-axis')!.innerHTML = slots.map((slot, i) =>
    `<div class="x-lbl">${i % every === 0 ? slotTimeStr(slot) : ''}</div>`
  ).join('');
}

export function renderBatteryOverlay(
  sr: ShadowRoot,
  slots: Slot[],
  config: CardConfig,
  hass: any,
): void {
  const n = slots.length;
  const battSvg = sr.getElementById('battery-svg') as SVGElement | null;
  const showBattery = config.layout?.show_battery !== false && !!config.integration?.battery_entity;
  if (battSvg) {
    if (showBattery && n > 0) {
      const battEntity = config.integration!.battery_entity!;
      const battState  = hass?.states[battEntity];
      const currentPct = battState ? parseFloat(battState.state) : null;
      const lineColor  = config.integration?.battery_line_color
        ? `rgb(${config.integration.battery_line_color.r},${config.integration.battery_line_color.g},${config.integration.battery_line_color.b})`
        : '#06b6d4';

      battSvg.setAttribute('viewBox', `0 0 100 ${CHART_H}`);
      battSvg.setAttribute('preserveAspectRatio', 'none');

      const slotW = 100 / n;
      const predPoints = slots.map((s, idx) => {
        if (s.battery_prediction == null) return null;
        return { x: (idx + 0.5) * slotW, y: (1 - s.battery_prediction / 100) * CHART_H };
      }).filter(Boolean) as { x: number; y: number }[];

      let svgContent = '';

      if (predPoints.length > 1) {
        const pathD = predPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
        svgContent += `<path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="0.6" stroke-dasharray="1.5 1" opacity="0.75" vector-effect="non-scaling-stroke"/>`;
      }

      if (currentPct != null && !isNaN(currentPct)) {
        const y = (1 - currentPct / 100) * CHART_H;
        svgContent += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${lineColor}" stroke-width="0.8" opacity="0.9" vector-effect="non-scaling-stroke"/>`;
        svgContent += `<text x="99" y="${Math.max(6, y - 1.5)}" text-anchor="end" fill="${lineColor}" font-size="5" font-family="monospace" opacity="0.9" vector-effect="non-scaling-stroke">${currentPct.toFixed(0)}%</text>`;
      }

      battSvg.innerHTML = svgContent;
      (battSvg as any).hidden = false;
    } else {
      battSvg.innerHTML = '';
      (battSvg as any).hidden = true;
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
