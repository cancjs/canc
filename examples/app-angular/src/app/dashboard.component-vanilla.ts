import { Component } from '@angular/core';

import { OrdersTableComponent } from './orders-table.component';
import { DetailPaneComponent } from './detail-pane.component-vanilla';

// Admin dashboard: an orders table beside a detail pane. Clicking a row loads its detail; clicking
// another row cannot cancel the previous load, which runs to completion (see
// detail-pane.component-vanilla.ts).
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
