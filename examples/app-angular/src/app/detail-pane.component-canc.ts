import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges } from '@angular/core';

import { cancelableResource } from '../lib/cancelable-resource';
import { CANCELABLE_ORDERS_SERVICE, type OrderDetail } from './orders.types';

// superseding or unmounting cancels in-flight load at network boundary
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
    // clearing selection cancels load in flight
    if (!this.orderId) {
      this.orderDetail.reset();
      return;
    }

    this.orderDetail.run(this.orders.detail(this.orderId));
  }
}
