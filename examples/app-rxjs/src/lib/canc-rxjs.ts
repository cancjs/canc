// Interop between RxJS Observables and canc CancelablePromises. This is a seed for a future
// @cancjs/rxjs package: it has no example-specific dependencies, so you can copy this file into
// your own project today and adapt it as-is.
//
// Two bridges, one in each direction:
// - toCancelablePromise(observable): take the first value of a stream as a promise, and make
// the promise's cancel() unsubscribe the stream (running its teardown).
// - fromCancelable(factory): wrap a cancelable-promise factory as an Observable, and make the
// Observable's unsubscribe cancel the promise.

import CancelablePromise from '@cancjs/promise';
import { Observable, EmptyError, Subscription, Subscriber } from 'rxjs';
import type { Subscribable } from 'rxjs';

/**
 * Adapt an Observable to a CancelablePromise that settles on the source's first value, mirroring
 * RxJS `firstValueFrom`:
 * - first `next` -> resolve with that value, then unsubscribe.
 * - `error` -> reject with the error.
 * - `complete` with no value emitted -> reject with RxJS `EmptyError` (parity with
 * `firstValueFrom`; it does NOT treat an empty stream as a cancellation).
 *
 * Calling `cancel()` on the returned promise unsubscribes from the source, so the Observable's
 * teardown (the function it returns from `subscribe`) runs. Cancellation is a rejection with a
 * CancelError, so it is caught by an ordinary try/catch on the awaiting side.
 */
export function toCancelablePromise<T>(observable: Subscribable<T>): CancelablePromise<T> {
 return new CancelablePromise<T>((resolve, reject, handleCancel) => {
 let settled = false;
 // Subscriber (rather than a plain observer) can tear itself down from inside next(), which is
 // needed for synchronous sources that emit during subscribe() before a Subscription is bound.
 const subscriber = new Subscriber<T>({
 next(value) {
 settled = true;
 resolve(value);
 subscriber.unsubscribe();
 },
 error(err: unknown) {
 settled = true;
 reject(err);
 },
 complete() {
 // Completed without ever emitting: same contract as firstValueFrom.
 if (!settled) reject(new EmptyError());
 },
 });
 observable.subscribe(subscriber);

 // cancel() tears down the live subscription instead of leaving it running in the background.
 handleCancel(() => subscriber.unsubscribe());
 });
}

/**
 * Adapt a CancelablePromise factory to an Observable that, on subscribe, runs the factory and
 * emits the settled result:
 * - resolve -> `next(value)` then `complete`.
 * - reject -> `error(reason)`.
 *
 * Unsubscribing before the promise settles cancels it, so the promise's cancel handlers run and
 * the underlying work aborts. This is the symmetric counterpart to `toCancelablePromise`: there,
 * cancel unsubscribes; here, unsubscribe cancels.
 *
 * A factory (not a live promise) is required so each subscription owns its own cancelable work.
 */
export function fromCancelable<T>(factory: () => CancelablePromise<T>): Observable<T> {
 return new Observable<T>((subscriber) => {
 const promise = factory();
 promise.then(
 (value) => {
 subscriber.next(value);
 subscriber.complete();
 },
 (reason) => {
 subscriber.error(reason);
 }
 );

 // Unsubscribe cancels the promise; the cancel rejection is swallowed here because the
 // subscriber is already torn down and no longer wants the result.
 return new Subscription(() => {
 promise.cancel();
 });
 });
}
