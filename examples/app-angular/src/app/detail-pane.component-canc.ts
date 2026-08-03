import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges } from '@angular/core';

import { cancelableResource } from '../lib/cancelable-resource';
import { CANCELABLE_ORDERS_SERVICE, type OrderDetail } from './orders.types';

// Detail pane. Picking another row supersedes the detail load in flight and the resource cancels it,
// which aborts the request at the fake network boundary. Destroy cancels it too. The component keeps
// none of that wiring: it starts a load and reads three fields.
@Component({
  selector: 'app-detail-pane',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section
      class="detail"
      data-testid="detail-pane"
    >
      <p
        *ngIf="orderDetail.status === 'pending'"
        data-testid="detail-loading"
      >
        Loading order {{ orderId }}…
      </p>
      <ng-container *ngIf="orderDetail.value as d">
        <h3 data-testid="detail-id">{{ d.id }}</h3>
        <p>{{ d.customer }} — {{ d.status }} — {{ d.total | number }}</p>
        <ul>
          <li *ngFor="let line of d.lines">{{ line.qty }}× {{ line.name }}</li>
        </ul>
      </ng-container>
    </section>
  `,
})
export class DetailPaneComponent implements OnChanges {
  @Input() orderId: string | null = null;

  orderDetail = cancelableResource<OrderDetail>();

  private readonly orders = inject(CANCELABLE_ORDERS_SERVICE);

  ngOnChanges(): void {
    // Clearing the selection cancels the load in flight, so an empty pane costs nothing and no late
    // response can land on it.
    if (!this.orderId) {
      this.orderDetail.reset();
      return;
    }

    this.orderDetail.run(this.orders.detail(this.orderId));
  }
}
