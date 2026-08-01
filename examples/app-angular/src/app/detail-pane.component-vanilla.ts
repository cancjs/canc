import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, Input, OnChanges } from '@angular/core';

import { type OrderDetail, ORDERS_SERVICE } from './orders.types';

// Detail pane. Selecting a different row cannot cancel the previous detail load: the plain promise
// keeps running to completion. A request-id compare and a destroyed flag are threaded by hand so a
// stale response cannot overwrite the current row or touch a destroyed component.
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
        *ngIf="loading"
        data-testid="detail-loading"
      >
        Loading order {{ orderId }}…
      </p>
      <ng-container *ngIf="detail as d">
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

  detail: OrderDetail | null = null;
  loading = false;

  private readonly orders = inject(ORDERS_SERVICE);
  private requestId = 0;
  private destroyed = false;

  constructor() {
    // Destroyed component still applies this patch: the request keeps running, so a flag guards it.
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  ngOnChanges(): void {
    // A new selection cannot cancel the previous load; a request-id compare drops the stale one.
    const id = ++this.requestId;
    this.detail = null;

    if (!this.orderId) {
      this.loading = false;
      return;
    }

    this.loading = true;
    // The previous request keeps running even though its result will be discarded (wasted work).
    this.orders.detail(this.orderId).then((result) => {
      // request-id compare + destroyed guard: drop a response the user has already navigated past.
      if (id === this.requestId && !this.destroyed) {
        this.detail = result;
        this.loading = false;
      }
    });
  }
}
