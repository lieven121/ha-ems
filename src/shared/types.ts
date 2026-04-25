export interface ActionInfo {
  key: string;
  label: string;
  color: string;
}

export interface Slot {
  start?: string;
  time?: string;
  price: number;
  _injPrice?: number;
  action?: string;
  locked?: boolean;
  action_config?: Record<string, any>;
  car?: Record<string, any>;
  battery_prediction?: number | null;
  battery_manual_override_w?: number;
  devices?: Array<{ name: string; manual_override_w?: number; allocated_wattage_w?: number }>;
}

export interface CardConfig {
  entity?: string;
  debug?: boolean;
  price?: {
    entity?: string;
    attribute?: string;
    start_key?: string;
    price_key?: string;
    injection_price_key?: string;
  };
  integration?: {
    device_id?: string;
    entry_id?: string;
    planning_entity?: string;
    battery_entity?: string;
    battery_line_color?: { r: number; g: number; b: number };
  };
  layout?: {
    theme?: 'dark' | 'light' | 'system' | 'ha';
    day?: 'today' | 'tomorrow';
    show_stats?: boolean;
    show_brush?: boolean;
    show_header?: boolean;
    show_chart?: boolean;
    show_actions?: boolean;
    show_price_legend?: boolean;
    show_action_legend?: boolean;
    show_battery?: boolean;
  };
  advanced?: { debug?: boolean };
}
