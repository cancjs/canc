import { Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { suppressCancel, isCancelError, type CancelablePromise } from '@cancjs/promise';

import { toCancelablePromise } from '../lib/to-cancelable-promise';
import type { OrderDetail } from './orders.types';

// Bridge demo. This pane loads the detail through Angular's HttpClient instead of the mock service,
// to show the two cancellation systems cooperating: toCancelablePromise turns the request observable
// into a CancelablePromise, and canceling that promise unsubscribes from the observable, which is how
// Angular aborts an HTTP request. One cancel() therefore tears down both sides.
@Component({
 selector: 'app-http-bridge',
 standalone: true,
 imports: [CommonModule],
 template: `
 <section class="detail" data-testid="bridge-pane">
 <p *ngIf="loading" data-testid="bridge-loading">Loading order {{ orderId }} over HTTP…</p>
 <h3 *ngIf="detail as d" data-testid="bridge-id">{{ d.id }}</h3>
 </section>
 `,
})
export class HttpBridgeComponent implements OnChanges {
 @Input() orderId: string | null = null;

 detail: OrderDetail | null = null;
 loading = false;

 private readonly http = inject(HttpClient);
 private pending: CancelablePromise<OrderDetail> | null = null;

 constructor() {
 inject(DestroyRef).onDestroy(() => this.pending?.cancel());
 }

 ngOnChanges(): void {
 this.pending?.cancel();
 this.detail = null;

 if (!this.orderId) {
 this.loading = false;
 return;
 }

 this.loading = true;
 // HttpClient.get returns a cold observable; toCancelablePromise subscribes and yields a
 // CancelablePromise. cancel() unsubscribes, aborting the request Angular's own way.
 const load = toCancelablePromise(this.http.get<OrderDetail>(`/api/orders/${this.orderId}`));
 this.pending = load;

 suppressCancel(load).then((result) => {
 if (result && !isCancelError(result)) {
 this.detail = result;
 this.loading = false;
 }
 });
 }
}
