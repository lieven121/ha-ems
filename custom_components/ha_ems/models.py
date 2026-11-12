"""Plain data types shared by the coordinator, the optimiser and the entities.

No Home Assistant imports, so the optimiser can be tested on its own.
"""

from __future__ import annotations

from dataclasses import dataclass

from .const import (
    DEFAULT_AVG_CONSUMPTION,
    DEFAULT_KWP,
    DEFAULT_MAX_BATTERY,
    DEFAULT_MIN_BATTERY,
)


@dataclass
class EMSSettings:
    """Live-editable planning settings, backed by number/switch entities."""

    min_battery: float = DEFAULT_MIN_BATTERY  # %
    max_battery: float = DEFAULT_MAX_BATTERY  # %
    avg_consumption: float = DEFAULT_AVG_CONSUMPTION  # W, baseline house load
    kwp_w: float = DEFAULT_KWP  # W, max charge power from solar/inverter
    discharge_w: float = DEFAULT_KWP  # W, max battery discharge power
    # Price units per kWh discharged: the battery is only cycled when the
    # gain after losses is larger than this.
    cycle_cost: float = 0.0
    allow_discharge: bool = False
    allow_idle_for_optimize: bool = True  # idle (use battery) on expensive slots

    def validate(self) -> None:
        """Raise ValueError if the settings leave no valid SoC range."""
        if self.min_battery >= self.max_battery:
            raise ValueError(
                f"Min battery ({self.min_battery:g} %) must be below max battery "
                f"({self.max_battery:g} %)"
            )
