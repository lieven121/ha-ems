import { EmsDashboardCard } from './dashboard/dashboard';
import { EmsDashboardCardEditor } from './dashboard/dashboard-config';

customElements.define('ems-dashboard-card', EmsDashboardCard);
customElements.define('ems-dashboard-card-editor', EmsDashboardCardEditor);

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type:        'ems-dashboard-card',
  name:        'EMS Dashboard Card',
  description: 'Energy Management System — price chart, action strip & schedule editor',
  preview:     false,
});
