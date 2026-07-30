import { CancelablePromise } from '@cancjs/promise';
import type { Observable, Subscription } from 'rxjs';

/**
 * Bridges an RxJS `Observable` (such as an Angular `HttpClient` request) into a
 * `CancelablePromise`. The promise resolves with the first emitted value and rejects on error, and
 * canceling it unsubscribes from the source.
 *
 * This is the point where two cancellation systems meet. Angular cancels HTTP by unsubscribing from
 * the request observable; canc cancels by rejecting the chain with a `CancelError`. Wiring the
 * cancel handler to `subscription.unsubscribe()` makes a `cancel()` on the promise trigger Angular's
 * own request teardown, so the underlying XHR/fetch is actually aborted rather than merely ignored.
 *
 * Only the first emission is used, mirroring `firstValueFrom`. A source that completes without
 * emitting rejects with the given `emptyError` (default `EmptyError`-shaped).
 */
export function toCancelablePromise<T>(source: Observable<T>, emptyError?: () => unknown): CancelablePromise<T> {
 return new CancelablePromise<T>((resolve, reject, { handleCancel }) => {
 let settled = false;

 const subscription: Subscription = source.subscribe({
 next: (value) => {
 if (settled) return;
 settled = true;
 resolve(value);
 subscription.unsubscribe();
 },
 error: (err) => {
 if (settled) return;
 settled = true;
 reject(err);
 },
 complete: () => {
 if (settled) return;
 settled = true;
 reject(emptyError ? emptyError() : new Error('Observable completed without emitting a value'));
 },
 });

 // Canceling the promise unsubscribes from the source. For an HttpClient request this aborts the
 // request, so Angular's cancellation and canc's cancellation cooperate instead of racing.
 handleCancel(() => {
 settled = true;
 subscription.unsubscribe();
 });
 });
}
