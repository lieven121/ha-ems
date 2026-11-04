"""Pure helpers for energy time series (no Home Assistant imports)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta


def resample_energy_to_slots(
    periods: Mapping[datetime, float],
    slot_starts: Sequence[datetime],
    slot_hours: float,
) -> list[float]:
    """Average power (W) in each slot, from energy (Wh) per period.

    *periods* maps a period start to the energy in that period, spread evenly
    over the period, so hourly forecasts split cleanly into 15-minute slots
    and vice versa.

    A period runs until the next key, but no longer than the series' usual
    step (the most common gap between keys; an hour when there is only one
    key). That covers:
    - Forecast.Solar's extra sunrise/sunset keys (07:42, say), which would
      otherwise shrink every hourly period to the shortest gap;
    - missing periods, which count as 0: Forecast.Solar, for one, leaves out
      the zero-energy hours of the night.
    """
    if not periods or not slot_starts or slot_hours <= 0:
        return [0.0] * len(slot_starts)

    starts = sorted(periods)
    gaps = [b - a for a, b in zip(starts, starts[1:], strict=False) if b > a]
    step = (
        max(Counter(gaps).items(), key=lambda kv: (kv[1], -kv[0]))[0]
        if gaps
        else timedelta(hours=1)
    )
    spans = []
    for i, start in enumerate(starts):
        end = start + step
        if i + 1 < len(starts):
            end = min(end, starts[i + 1])
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
