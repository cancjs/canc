import { Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { suppressCancel, isCancelError, type CancelablePromise } from '@cancjs/promise';

import { ORDERS_SERVICE, type OrderDetail } from './orders.types';

// Detail pane. Selecting a different row cancels the previous detail load: the in-flight
// CancelablePromise is held on the component and canceled before the next one starts, and again when
// the component is destroyed. A canceled load aborts its request at the fake network boundary.
@Component({
 selector: 'app-detail-pane',
 standalone: true,
 imports: [CommonModule],
 template: `
 <section class="detail" data-testid="detail-pane">
 <p *ngIf="loading" data-testid="detail-loading">Loading order {{ orderId }}…</p>
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
 private pending: CancelablePromise<OrderDetail> | null = null;

 constructor() {
 // Destroy cancels whatever is still pending, aborting the request.
 inject(DestroyRef).onDestroy(() => this.pending?.cancel());
 }

 ngOnChanges(): void {
 // A new selection supersedes the previous load: cancel it before starting the next.
 this.pending?.cancel();
 this.detail = null;

 if (!this.orderId) {
 this.loading = false;
 return;
 }

 this.loading = true;
 const load = this.orders.detail(this.orderId) as CancelablePromise<OrderDetail>;
 this.pending = load;

 // A superseded (or destroyed) load is canceled on purpose — swallow the CancelError.
 suppressCancel(load).then((result) => {
 if (result && !isCancelError(result)) {
 this.detail = result;
 this.loading = false;
 }
 });
 }
}
