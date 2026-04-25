export const EDITOR_SCHEMA = [
  {
    type: 'expandable',
    name: 'price',
    title: 'Price',
    icon: 'mdi:lightning-bolt',
    schema: [
      { name: 'entity',              selector: { entity: {} } },
      { name: 'attribute',           selector: { text: {} } },
      { name: 'start_key',           selector: { text: {} } },
      { name: 'price_key',           selector: { text: {} } },
      { name: 'injection_price_key', selector: { text: {} } },
    ],
  },
  {
    type: 'expandable',
    name: 'layout',
    title: 'Layout',
    icon: 'mdi:view-dashboard-outline',
    schema: [
      { name: 'theme',        selector: { select: { options: [
        { value: 'dark',   label: 'Dark' },
        { value: 'light',  label: 'Light' },
        { value: 'system', label: 'System (follow OS)' },
        { value: 'ha',     label: 'Home Assistant (follow card theme)' },
      ] } } },
      { name: 'day',          selector: { select: { options: [
        { value: 'today',    label: 'Today' },
        { value: 'tomorrow', label: 'Tomorrow' },
      ], custom_value: false } } },
      { name: 'show_stats',        selector: { boolean: {} } },
      { name: 'show_brush',        selector: { boolean: {} } },
      { name: 'show_header',       selector: { boolean: {} } },
      { name: 'show_chart',        selector: { boolean: {} } },
      { name: 'show_actions',      selector: { boolean: {} } },
      { name: 'show_price_legend',  selector: { boolean: {} } },
      { name: 'show_action_legend', selector: { boolean: {} } },
      { name: 'show_battery',       selector: { boolean: {} } },
    ],
  },
  {
    type: 'expandable',
    name: 'integration',
    title: 'Integration',
    icon: 'mdi:home-automation',
    schema: [
      { name: 'device_id',          selector: { device: { integration: 'ha_ems' } } },
      { name: 'battery_entity',     selector: { entity: {} } },
      { name: 'battery_line_color', selector: { color_rgb: {} } },
    ],
  },
  {
    type: 'expandable',
    name: 'advanced',
    title: 'Advanced',
    icon: 'mdi:cog-outline',
    schema: [
      { name: 'debug', selector: { boolean: {} } },
    ],
  },
];

export function editorLabel(schema: any): string {
  if (schema.name === 'entity') return 'Price Entity';
  return ({
    attribute:             'Data Attribute',
    start_key:             'Start Key',
    price_key:             'Price Key',
    injection_price_key:   'Injection Price Key (optional)',
    debug:                 'Debug Mode',
    theme:                 'Theme',
    show_brush:            'Show Overview Brush',
    show_header:           'Show Header Title',
    show_stats:            'Show Stats Cards',
    show_chart:            'Show Chart',
    show_actions:          'Show Action Strip',
    show_price_legend:     'Show Price Legend',
    show_action_legend:    'Show Action Legend',
    show_battery:          'Show Battery Line',
    day:                   'Fixed Day',
    device_id:             'EMS Device',
    battery_entity:        'Current Battery Entity',
    battery_line_color:    'Battery Line Color',
  } as Record<string, string>)[schema.name] ?? schema.name;
}

export function editorHelper(schema: any): string {
  return ({
    entity:              'The price sensor entity (e.g. Nordpool sensor).',
    attribute:           'Attribute on the entity that contains the price list array (e.g. prices_today).',
    start_key:           'Key name for the start time in each price entry (e.g. "start").',
    price_key:           'Key name for the price value in each price entry (e.g. "price").',
    injection_price_key: 'Optional. Key name for the injection (sell-back) price per entry. Displayed separately — not added to the buy price.',
    debug:               'Show debug panel below the chart with entity state, attribute info, and a data table.',
    theme:               'Colour scheme: Dark (default), Light, System (follow OS), or Home Assistant (uses your HA card theme).',
    show_brush:          'Show the colour overview bar below the chart (default: true).',
    show_header:         'Show the EMS Schedule header title (default: true).',
    show_stats:          'Show the stats cards (Current, Min/Avg/Max) above the chart (default: true).',
    show_chart:          'Show the bar chart. When hidden, clicking the brush opens the slot popup instead (default: true).',
    show_actions:        'Show the action colour strip below the bars (default: true).',
    show_price_legend:   'Show the price colour legend below the chart (default: true).',
    show_action_legend:  'Show the action colour legend below the chart (default: true).',
    day:                 'Fix the displayed day. When set, the Today/Tomorrow buttons are hidden.',
    device_id:           'Select the EMS device. Used to read planning data and send service calls.',
    battery_entity:      'Number or sensor entity for current battery state of charge (0–100). Used to draw the current battery % line on the chart.',
    battery_line_color:  'Color for the battery overlay lines. Defaults to a teal/cyan color.',
    show_battery:        'Overlay current (solid) and predicted (dashed) battery % on the chart (default: true when battery_entity is set).',
  } as Record<string, string>)[schema.name] ?? '';
}

export class EmsDashboardCardEditor extends HTMLElement {
  private _config: any;
  private _hass: any;
  private _form: any;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass   = null;
    this._form   = null;
  }

  setConfig(config: any) {
    this._config = config || {};
    this._buildForm();
    this._sync();
  }

  set hass(hass: any) {
    this._hass = hass;
    this._sync();
  }

  connectedCallback() {
    this._buildForm();
    this._sync();
  }

  _buildForm() {
    if (this._form) return;

    this.shadowRoot!.innerHTML =
      '<style>:host{display:block} ha-form{display:block;padding:4px 0}</style>';

    const form = document.createElement('ha-form') as any;
    form.schema        = EDITOR_SCHEMA;
    form.computeLabel  = editorLabel;
    form.computeHelper = editorHelper;

    form.addEventListener('value-changed', (e: any) => {
      this._config = e.detail.value;
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }));
    });

    this.shadowRoot!.appendChild(form);
    this._form = form;
  }

  _sync() {
    if (!this._form) return;
    if (this._hass) this._form.hass = this._hass;
    this._form.data = this._config;
  }
}
