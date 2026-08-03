import { Component } from '@angular/core';

import { DetailPaneComponent } from './detail-pane.component-obs';
import { OrdersTableComponent } from './orders-table.component-obs';

// Admin dashboard: an orders table beside a detail pane. Clicking a row loads its detail; clicking
// another row cancels the previous load by unsubscribing from it (see
// detail-pane.component-obs.ts).
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [OrdersTableComponent, DetailPaneComponent],
  template: `
    <div class="dashboard">
      <app-orders-table (selectedIdChange)="selectedId = $event"></app-orders-table>
      <app-detail-pane [orderId]="selectedId"></app-detail-pane>
    </div>
  `,
})
export class DashboardComponent {
  selectedId: string | null = null;
}
