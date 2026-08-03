import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges } from '@angular/core';

// (no cancelable promise counterpart, see -canc)
import { promiseResource } from '../lib/promise-resource';
import { type OrderDetail, ORDERS_SERVICE } from './orders.types';

// Detail pane. Picking another row supersedes the detail load in flight and the resource drops its
// response, which is all a plain promise allows. The request runs to completion, and so does the one
// left over on destroy. The component keeps the staleness guard out of sight, not the wasted work.
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
    // Clearing the selection invalidates the load in flight. It keeps running, and only its result
    // is thrown away, so an empty pane still costs a full request.
    if (!this.orderId) {
      this.orderDetail.reset();
      return;
    }

    // (no cancelable promise counterpart, see -canc) A plain promise is all the service can hand
    // back, and the resource takes it as is.
    this.orderDetail.run(this.orders.detail(this.orderId));
  }
}
