"""Fixtures for the tests that run inside Home Assistant.

These need pytest-homeassistant-custom-component (and so Home Assistant
itself, which only runs on Linux/macOS); the tests in tests/ don't. Run with:

    pytest tests_ha -o asyncio_mode=auto
"""

import sys
from pathlib import Path

import pytest

# HA's loader finds custom integrations through the `custom_components`
# package. pytest-homeassistant-custom-component ships its own (for its test
# integrations), which shadows ours, so add our folder to its search path.
_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO))

import custom_components  # noqa: E402

if str(_REPO / "custom_components") not in list(custom_components.__path__):
    custom_components.__path__.append(str(_REPO / "custom_components"))


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(recorder_mock, enable_custom_integrations):
    """Let HA load custom_components/ha_ems in every test.

    The recorder has to start before hass, so it is requested first.
    """
    return
