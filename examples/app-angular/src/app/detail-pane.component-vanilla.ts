import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges } from '@angular/core';

// (no cancelable promise counterpart, see -canc)
import { promiseResource } from '../lib/promise-resource';
import { type OrderDetail, ORDERS_SERVICE } from './orders.types';

// superseding or unmounting drops late response while request keeps running
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

  orderDetail = promiseResource<OrderDetail>();

  private readonly orders = inject(ORDERS_SERVICE);

  ngOnChanges(): void {
    // clearing selection drops result while request keeps running
    if (!this.orderId) {
      this.orderDetail.reset();
      return;
    }

    // (no cancellation counterpart, see -canc)
    this.orderDetail.run(this.orders.detail(this.orderId));
  }
}
