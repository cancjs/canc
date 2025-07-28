// Cancel-aware concurrency pool. A seed for a future @cancjs/* p-limit port. Copy this file into
// your own project freely; it has no dependency on this example beyond @cancjs/promise.
//
// Runs at most `limit` jobs at once. Every job and every returned handle is a CancelablePromise,
// so cancellation composes both ways:
// - Cancel a returned handle: if the job already started, its cancel() runs; if it is still
// queued, it is removed from the queue and never starts (born-canceled).
// - Cancel the whole pool via cancelAll(): actives are canceled and the queue is drained, so
// queued jobs never start.

import { CancelablePromise, CancelError } from '@cancjs/promise';

export interface Pool {
 /** Schedule a job. Resolves/rejects with the job's result once it gets a slot and runs. */
 run<T>(job: () => CancelablePromise<T>): CancelablePromise<T>;
 /** Cancel every active job and drop every queued job. Queued jobs never start. */
 cancelAll(reason?: unknown): void;
}

export function createPool(limit: number): Pool {
 let active = 0;
 const queue: Array<() => void> = [];
 const running = new Set<CancelablePromise<unknown>>();

 const pump = (): void => {
 while (active < limit && queue.length > 0) {
 const start = queue.shift();
 start?.();
 }
 };

 const run = <T>(job: () => CancelablePromise<T>): CancelablePromise<T> => {
 return new CancelablePromise<T>((resolve, reject, handleCancel) => {
 const next = (): void => {
 active--;
 pump();
 };

 const start = (): void => {
 active++;
 const p = job();
 running.add(p as CancelablePromise<unknown>);
 // handleCancel now targets the in-flight job so canceling the handle cancels the job.
 handleCancel((r) => p.cancel(r));
 // finally-equivalent via then(f, f): free the slot and pump whether the job settled or not.
 p.then(resolve, reject).then(
 () => {
 running.delete(p as CancelablePromise<unknown>);
 next();
 },
 () => {
 running.delete(p as CancelablePromise<unknown>);
 next();
 }
 );
 };

 // While queued, canceling the handle removes the job from the queue so it never starts.
 handleCancel((r) => {
 const index = queue.indexOf(start);
 if (index !== -1) {
 queue.splice(index, 1);
 reject(r instanceof CancelError ? r : new CancelError('Canceled while queued'));
 }
 });

 queue.push(start);
 pump();
 });
 };

 const cancelAll = (reason?: unknown): void => {
 // Drop queued jobs first so nothing new starts, then cancel what is already running.
 queue.length = 0;
 for (const p of running) p.cancel(reason);
 running.clear();
 };

 return { run, cancelAll };
}
