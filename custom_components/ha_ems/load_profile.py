"""Learn a weekly house-load profile from metered history (pure, no HA imports).

The profile is the expected house load per (weekday, hour), learned from the
last few weeks of hourly energy statistics:

- recent weeks count more than older ones (each week back weighs 0.75x),
- one-off spikes are trimmed (samples over 3x the cell's median),
- empty cells fall back to the same hour on weekdays/weekends, then to the
  configured average consumption.

On top of that, a short-term bias factor compares the last few hours with the
profile and scales the next hours by it, fading out over six hours, so a
busier (or quieter) day than usual shows up in the forecast straight away.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

WEEK_DECAY = 0.75
OUTLIER_FACTOR = 3.0
BIAS_LOOKBACK_H = 3
BIAS_FADE_H = 6.0
BIAS_MIN, BIAS_MAX = 0.5, 2.0


def house_load_wh(
    imports: Sequence[Mapping[datetime, float]],
    exports: Sequence[Mapping[datetime, float]],
    solar: Sequence[Mapping[datetime, float]],
    battery_out: Sequence[Mapping[datetime, float]],
    battery_in: Sequence[Mapping[datetime, float]],
) -> dict[datetime, float]:
    """House load (Wh) per hour from metered energy (kWh) per hour.

    load = import - export + solar + battery discharge - battery charge.

    An hour is used only when every meter has a value for it, so a gap in one
    meter can't masquerade as a spike or a dip. Negative results (meter
    timing jitter) are clamped to 0. Without any grid import meter there is
    nothing to learn from.
    """
    groups = [*imports, *exports, *solar, *battery_out, *battery_in]
    if not imports:
        return {}
    hours = set(imports[0])
    for series in groups[1:]:
        hours &= set(series)

    def total(series_list: Sequence[Mapping[datetime, float]], ts: datetime) -> float:
        return sum(s[ts] for s in series_list)

    out: dict[datetime, float] = {}
    for ts in hours:
        kwh = (
            total(imports, ts)
            - total(exports, ts)
            + total(solar, ts)
            + total(battery_out, ts)
            - total(battery_in, ts)
        )
        out[ts] = max(kwh, 0.0) * 1000.0
    return out


def _weighted_mean(samples: Iterable[tuple[float, float]]) -> float | None:
    """Recency-weighted mean of (value, weight) pairs after trimming outliers."""
    samples = list(samples)
    if not samples:
        return None
    median = statistics.median(v for v, _ in samples)
    if median > 0:
        samples = [(v, w) for v, w in samples if v <= OUTLIER_FACTOR * median]
    weight = sum(w for _, w in samples)
    if weight <= 0:
        return None
    return sum(v * w for v, w in samples) / weight


@dataclass
class LoadProfile:
    """Expected house load in W per (weekday, hour), in local time."""

    cells: dict[tuple[int, int], float] = field(default_factory=dict)
    day_type: dict[tuple[bool, int], float] = field(default_factory=dict)
    days: int = 0  # distinct days of history the profile was learned from

    @property
    def empty(self) -> bool:
        return not self.cells and not self.day_type

    def expected_w(self, local_ts: datetime, fallback_w: float) -> float:
        key = (local_ts.weekday(), local_ts.hour)
        if key in self.cells:
            return self.cells[key]
        day_key = (local_ts.weekday() >= 5, local_ts.hour)
        if day_key in self.day_type:
            return self.day_type[day_key]
        return fallback_w

    # Store round trip: JSON has no tuple keys.
    def as_dict(self) -> dict:
        return {
            "cells": {f"{d}-{h}": w for (d, h), w in self.cells.items()},
            "day_type": {f"{int(we)}-{h}": w for (we, h), w in self.day_type.items()},
            "days": self.days,
        }

    @classmethod
    def from_dict(cls, data: Mapping | None) -> LoadProfile:
        if not data:
            return cls()

        def parse(raw: Mapping | None) -> dict[tuple[int, int], float]:
            out = {}
            for key, value in (raw or {}).items():
                try:
                    a, b = (int(x) for x in str(key).split("-"))
                    out[(a, b)] = float(value)
                except (TypeError, ValueError):
                    continue
            return out

        return cls(
            cells=parse(data.get("cells")),
            day_type={(bool(a), b): w for (a, b), w in parse(data.get("day_type")).items()},
            days=int(data.get("days") or 0),
        )


def build_profile(hourly_wh: Mapping[datetime, float], now: datetime) -> LoadProfile:
    """Learn a profile from {local hour start: Wh}; *now* sets the recency weights."""
    cells: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    day_type: dict[tuple[bool, int], list[tuple[float, float]]] = defaultdict(list)
    days = set()
    for ts, wh in hourly_wh.items():
        if ts > now:
            continue
        weeks_ago = (now - ts) // timedelta(weeks=1)
        weight = WEEK_DECAY**weeks_ago
        cells[(ts.weekday(), ts.hour)].append((wh, weight))
        day_type[(ts.weekday() >= 5, ts.hour)].append((wh, weight))
        days.add(ts.date())

    def means(groups: Mapping) -> dict:
        out = {}
        for key, samples in groups.items():
            mean = _weighted_mean(samples)
            if mean is not None:
                out[key] = round(mean, 1)
        return out

    return LoadProfile(cells=means(cells), day_type=means(day_type), days=len(days))


def bias_factor(
    profile: LoadProfile,
    recent_wh: Mapping[datetime, float],
    now: datetime,
    fallback_w: float,
) -> float:
    """Actual / expected load over the last few complete hours, clamped."""
    since = now - timedelta(hours=BIAS_LOOKBACK_H + 1)
    actual = expected = 0.0
    for ts, wh in recent_wh.items():
        if since <= ts and ts + timedelta(hours=1) <= now:
            actual += wh
            expected += profile.expected_w(ts, fallback_w)
    if expected <= 0 or actual <= 0:
        return 1.0
    return min(max(actual / expected, BIAS_MIN), BIAS_MAX)


def predict_load_w(
    profile: LoadProfile,
    slot_starts: Sequence[datetime],
    now: datetime,
    fallback_w: float,
    bias: float = 1.0,
) -> list[float]:
    """Expected house load (W) per slot, with the bias fading out over 6 h."""
    out = []
    for ts in slot_starts:
        hours_ahead = max((ts - now).total_seconds() / 3600.0, 0.0)
        fade = max(0.0, 1.0 - hours_ahead / BIAS_FADE_H)
        factor = 1.0 + (bias - 1.0) * fade
        out.append(profile.expected_w(ts, fallback_w) * factor)
    return out
