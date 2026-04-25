"""Constants for the HA-EMS integration."""

DOMAIN = "ha_ems"

# Platforms
PLATFORMS = ["sensor", "number", "switch", "button"]

# ---------------------------------------------------------------------------
# Config keys
# ---------------------------------------------------------------------------
CONF_PRICE_ENTITY_ID = "price_entity_id"
CONF_PRICE_ATTRIBUTE = "price_attribute"
CONF_START_KEY = "start_key"
CONF_PRICE_KEY = "price_key"
CONF_INJECTION_PRICE_KEY = "injection_price_key"

CONF_BATTERY_ENTITY_ID = "battery_entity_id"
CONF_BATTERY_SIZE_KWH = "battery_size_kwh"
CONF_ROUNDTRIP_LOSS_PCT = "roundtrip_loss_pct"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_PRICE_ATTRIBUTE = "data"
DEFAULT_START_KEY = "start"
DEFAULT_PRICE_KEY = "price"
DEFAULT_ROUNDTRIP_LOSS_PCT = 20.0

DEFAULT_MIN_BATTERY = 10.0
DEFAULT_MAX_BATTERY = 95.0
DEFAULT_AVG_CONSUMPTION = 300.0
DEFAULT_KWP = 3000.0  # watts — default max charge power from solar/inverter

# ---------------------------------------------------------------------------
# Action strings
# ---------------------------------------------------------------------------
ACTION_IDLE = "idle"
ACTION_CHARGE = "charge"
ACTION_DISCHARGE = "discharge"
ACTION_USE_NET = "use_net"
ACTION_CAR_CHARGE = "car_charge"

ACTION_LABELS: dict[str, str] = {
    ACTION_IDLE: "Idle",
    ACTION_CHARGE: "Charging",
    ACTION_DISCHARGE: "Discharging",
    ACTION_USE_NET: "Using Net",
    ACTION_CAR_CHARGE: "Car Charging",
}

# ---------------------------------------------------------------------------
# Entity unique-id suffixes / names
# ---------------------------------------------------------------------------
ENTITY_MIN_BATTERY = "ems_min_battery"
ENTITY_MAX_BATTERY = "ems_max_battery"
ENTITY_AVG_CONSUMPTION = "ems_avg_consumption"
ENTITY_ALLOW_DISCHARGE = "ems_allow_discharge"
ENTITY_ALLOW_IDLE_FOR_OPTIMIZE = "ems_allow_idle_for_optimize"
ENTITY_KWP = "ems_kwp"
ENTITY_PLANNING = "ems_planning"
ENTITY_CURRENT_ACTION = "ems_current_action"
ENTITY_OPTIMIZE = "ems_optimize"

# ---------------------------------------------------------------------------
# Service names
# ---------------------------------------------------------------------------
SERVICE_PLANNING_IDLE = "planning_idle"
SERVICE_PLANNING_CHARGE = "planning_charge"
SERVICE_PLANNING_DISCHARGE = "planning_discharge"
SERVICE_PLANNING_USE_NET = "planning_use_net"
SERVICE_PLANNING_CHARGE_CAR = "planning_charge_car"
SERVICE_PLANNING_CAR_CHARGE_SLOT = "planning_car_charge_slot"
SERVICE_PLANNING_LOCK = "planning_lock"
SERVICE_PLANNING_CLEAR = "planning_clear"
SERVICE_PLANNING_OPTIMIZE = "planning_optimize"

# ---------------------------------------------------------------------------
# Service field names
# ---------------------------------------------------------------------------
FIELD_DEVICE_ID = "device_id"
FIELD_TIME = "time"
FIELD_LOCKED = "locked"
FIELD_CAR_USE_SOLAR = "car_use_solar"
FIELD_WATTAGE = "wattage"
FIELD_UNTIL_PCT = "until_pct"
FIELD_MAX_WATTAGE = "max_wattage"
FIELD_USE_SOLAR = "use_solar"
FIELD_START_TIME = "start_time"
FIELD_STOP_TIME = "stop_time"
FIELD_MAX_PRICE = "max_price"
FIELD_SLOTS_WANTED = "slots_wanted"
FIELD_START = "start"
FIELD_END = "end"
FIELD_LOCK = "lock"
FIELD_CLEAR_LOCKED = "clear_locked"
FIELD_USE_NET_WATTAGE = "use_net_wattage"
FIELD_USE_BATTERY_WATTAGE = "use_battery_wattage"
FIELD_USE_BATTERY_UNTIL_PCT = "use_battery_until_pct"

# ---------------------------------------------------------------------------
# Event name
# ---------------------------------------------------------------------------
EVENT_ACTION_CHANGED = "ha_ems_action_changed"

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
STORAGE_VERSION = 1

# Optimizer cap: maximum default wattage used when no explicit value given
MAX_DEFAULT_WATTAGE = 10000.0  # 10 kW
