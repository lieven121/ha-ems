"""Pure helpers for energy time series (no Home Assistant imports)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta


def resample_energy_to_slots(
    periods: Mapping[datetime, float],
    slot_starts: Sequence[datetime],
    slot_hours: float,
) -> list[float]:
    """Average power (W) in each slot, from energy (Wh) per period.

    *periods* maps a period start to the energy in that period. Every period
    is as long as the smallest gap between keys (an hour when there is only
    one), and its energy is spread evenly over it, so hourly forecasts split
    cleanly into 15-minute slots and vice versa. Missing periods count as 0:
    Forecast.Solar, for one, leaves out the zero-energy hours of the night.
    """
    if not periods or not slot_starts or slot_hours <= 0:
        return [0.0] * len(slot_starts)

    starts = sorted(periods)
    gaps = [b - a for a, b in zip(starts, starts[1:], strict=False) if b > a]
    length = min(gaps) if gaps else timedelta(hours=1)
    spans = [(start, start + length, float(periods[start])) for start in starts]

    slot_len = timedelta(hours=slot_hours)
    out: list[float] = []
    for slot_start in slot_starts:
        slot_end = slot_start + slot_len
        wh = 0.0
        for p_start, p_end, p_wh in spans:
            if p_end <= slot_start:
                continue
            if p_start >= slot_end:
                break
            overlap = min(p_end, slot_end) - max(p_start, slot_start)
            wh += p_wh * (overlap / (p_end - p_start))
        out.append(max(wh, 0.0) / slot_hours)
    return out
