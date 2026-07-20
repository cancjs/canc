// Interop between RxJS Observables and canc CancelablePromises. This is a seed for a future
// @cancjs/rxjs package: it has no example-specific dependencies, so you can copy this file into
// your own project today and adapt it as-is.
//
// Three bridges:
// - toCancelablePromise(observable): take the first value of a stream as a promise, and make
// the promise's cancel() unsubscribe the stream (running its teardown).
// - fromCancelablePromise(factory): wrap a cancelable-promise factory as an Observable, and make the
// Observable's unsubscribe cancel the promise.
// - from(observable): view a whole stream as a cancelable async-iterable for `for await`, and make
// ending the loop (or canceling the consuming coroutine) unsubscribe the stream.

import CancelablePromise from '@cancjs/promise';
import { Observable, EmptyError, Subscription, Subscriber } from 'rxjs';
import type { Subscribable, Unsubscribable } from 'rxjs';

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
export function fromCancelablePromise<T>(factory: () => CancelablePromise<T>): Observable<T> {
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

// A cancelable async-iterable view of an Observable: every emission becomes an item in a
// `for await` loop, and stopping the loop (break, throw, or a canceling coroutine calling the
// iterator's return()) unsubscribes from the source.
export interface CancelableAsyncIterable<T> extends AsyncIterable<T> {
 // The promise that drives the bridge. Canceling it unsubscribes and ends the iteration, so the
 // whole stream can be torn down without holding the iterator. Rejects with a CancelError on
 // cancel, resolves when the source completes, rejects with the source error otherwise.
 readonly done: CancelablePromise<void>;
}

/**
 * Bridge an Observable to a cancelable async-iterable, so a stream can be consumed with `for await`
 * and fed straight into a canc coroutine (`cancGenForAwait`/`cancGenDelegate`) as a `TEachSource`.
 *
 * This exists for rxjs<7. RxJS 7+ already implements `Observable[Symbol.asyncIterator]`, so on 7+
 * `for await (const x of observable)` works out of the box; this helper is the compat path that
 * behaves the same on both, plus it wires unsubscribe to consumer cancellation.
 *
 * - each `next(value)` -> the value is queued and delivered by the next `for await` step.
 * - `complete` -> the iteration ends (the loop finishes).
 * - `error` -> the current or next step rejects with the source error.
 *
 * Backpressure: values are buffered in a queue while the consumer is slower than the source
 * (RxJS observables are push-based and cannot be paused, so buffering is the honest option; an
 * unbounded-hot source can grow this queue). A consumer pull that outruns the source parks until
 * the next emission.
 *
 * Cancellation: the returned iterable owns a driving CancelablePromise (`.done`). Ending the loop
 * calls the iterator's `return()`, which unsubscribes from the source (running its teardown) and
 * cancels that promise. Canceling `.done` directly does the same from the other side.
 */
export function from<T>(observable: Subscribable<T>): CancelableAsyncIterable<T> {
 // Queue of source emissions awaiting a consumer pull, and the reverse: consumer pulls parked
 // waiting for the next emission. At most one of the two is non-empty at any time.
 const values: T[] = [];
 const pulls: Array<{
 resolve: (result: IteratorResult<T>) => void;
 reject: (reason: unknown) => void;
 }> = [];

 let subscription: Unsubscribable | undefined;
 let finished = false; // source completed or errored, or consumer stopped
 let failure: { error: unknown } | undefined; // set on source error, drained before "done"

 // The driver: its cancel handler tears the subscription down, so canceling it (or the consuming
 // coroutine) unsubscribes. It settles when the source completes/errors.
 let settleDone: () => void = () => {};
 let failDone: (reason: unknown) => void = () => {};
 const done = new CancelablePromise<void>((resolve, reject, handleCancel) => {
 settleDone = resolve;
 failDone = reject;
 handleCancel(() => stop());
 });
 // The bridge tears itself down on cancel; an unconsumed cancel rejection here is expected.
 done.catch(() => {});

 function stop(): void {
 if (finished) return;
 finished = true;
 if (subscription) subscription.unsubscribe();
 // Flush any parked pulls as a clean end so a waiting `for await` terminates.
 while (pulls.length) pulls.shift()!.resolve({ value: undefined, done: true });
 }

 subscription = observable.subscribe({
 next(value: T) {
 if (finished) return;
 const pull = pulls.shift();
 if (pull) pull.resolve({ value, done: false });
 else values.push(value);
 },
 error(error: unknown) {
 if (finished) return;
 // Deliver the error to a parked pull now; otherwise stash it for the next pull that drains
 // the remaining buffered values first.
 const pull = pulls.shift();
 if (pull) {
 stop();
 pull.reject(error);
 } else {
 failure = { error };
 if (!values.length) stop();
 }
 failDone(error);
 },
 complete() {
 settleDone();
 stop();
 },
 });

 // A source that emitted synchronously during subscribe (or completed) may have run before the
 // subscription was assigned; if it already stopped, drop the now-stale handle's teardown.
 if (finished && subscription) subscription.unsubscribe();

 const iterator: AsyncIterableIterator<T> = {
 next(): Promise<IteratorResult<T>> {
 // Drain buffered values first, in emission order.
 if (values.length) {
 return Promise.resolve({ value: values.shift()!, done: false });
 }
 if (failure) {
 const { error } = failure;
 failure = undefined;
 stop();
 return Promise.reject(error);
 }
 if (finished) {
 return Promise.resolve({ value: undefined, done: true });
 }
 return new Promise<IteratorResult<T>>((resolve, reject) => {
 pulls.push({ resolve, reject });
 });
 },
 return(value?: unknown): Promise<IteratorResult<T>> {
 // Consumer stopped (break/throw, or a canceling coroutine): unsubscribe and end.
 stop();
 done.cancel();
 return Promise.resolve({ value, done: true } as IteratorResult<T>);
 },
 [Symbol.asyncIterator]() {
 return this;
 },
 };

 return {
 [Symbol.asyncIterator]() {
 return iterator;
 },
 done,
 };
}
