import { Slot, ActionInfo } from './types';

export function priceColor(p: number): string {
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

export function slotAction(slot: Slot): ActionInfo {
  const ACTION_MAP: Record<string, ActionInfo> = {
    idle:       { key: 'idle',       label: 'Idle',       color: '#374151' },
    charge:     { key: 'charge',     label: 'Charge',     color: '#16a34a' },
    discharge:  { key: 'discharge',  label: 'Discharge',  color: '#dc2626' },
    use_net:    { key: 'use_net',    label: 'Use Net',    color: '#2563eb' },
    car_charge: { key: 'car_charge', label: 'Car Charge', color: '#ca8a04' },
  };
  if (slot.action && ACTION_MAP[slot.action]) return ACTION_MAP[slot.action];
  const ov = slot.battery_manual_override_w;
  if (ov != null) {
    if (ov > 0) return ACTION_MAP.charge;
    if (ov < 0) return ACTION_MAP.discharge;
  }
  return ACTION_MAP.idle;
}

export function slotHasCar(slot: Slot): boolean {
  return slot.action === 'car_charge';
}

export function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function slotTimeStr(slot: Slot): string {
  const d = new Date(slot.start ?? slot.time!);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export function slotEndTimeStr(slots: Slot[], idx: number): string {
  if (idx + 1 < slots.length) return slotTimeStr(slots[idx + 1]);
  const d   = new Date(slots[idx].start ?? slots[idx].time!);
  const dur = idx > 0 ? (d.getTime() - new Date(slots[idx - 1].start ?? slots[idx - 1].time!).getTime()) : 3600000;
  const end = new Date(d.getTime() + dur);
  return `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
}
