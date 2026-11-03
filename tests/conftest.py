"""Make the integration's pure modules importable without Home Assistant.

``custom_components/ha_ems/__init__.py`` imports Home Assistant, but the
planning logic (const, models, simulation, optimizer) does not. Registering
an empty ``ha_ems`` package that points at the integration folder lets tests
import those submodules without running the package ``__init__``.
"""

import sys
import types
from pathlib import Path

_PKG_DIR = Path(__file__).resolve().parent.parent / "custom_components" / "ha_ems"

if "ha_ems" not in sys.modules:
    _pkg = types.ModuleType("ha_ems")
    _pkg.__path__ = [str(_PKG_DIR)]
    sys.modules["ha_ems"] = _pkg
