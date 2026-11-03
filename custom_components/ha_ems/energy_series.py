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

    *periods* maps a period start to the energy in that period. A period lasts
    until the next key (the last one as long as the one before it, or an hour
    when there is only one), and its energy is spread evenly over it, so hourly
    forecasts split cleanly into 15-minute slots and vice versa. Slots no
    period covers get 0.
    """
    if not periods or not slot_starts or slot_hours <= 0:
        return [0.0] * len(slot_starts)

    starts = sorted(periods)
    spans: list[tuple[datetime, datetime, float]] = []
    for i, start in enumerate(starts):
        if i + 1 < len(starts):
            end = starts[i + 1]
        elif i > 0:
            end = start + (start - starts[i - 1])
        else:
            end = start + timedelta(hours=1)
        if end > start:
            spans.append((start, end, float(periods[start])))

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
