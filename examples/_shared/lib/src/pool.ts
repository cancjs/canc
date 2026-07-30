import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

/**
 * Cancel-aware concurrency pool. Runs at most `limit` jobs at once.
 *
 * A seed for a future `@cancjs/p-limit` package. Copy this file into your own project freely; it
 * has no dependency beyond `@cancjs/promise`.
 */
export interface Pool {
 /**
 * Schedules a job. Resolves or rejects with the job's own result once it gets a slot and runs.
 *
 * The returned handle is a CancelablePromise: canceling it while the job is queued removes the
 * job from the queue so it never starts (born-canceled); canceling it once the job has started
 * cancels the job itself.
 */
 run<T>(job: () => CancelablePromise<T>): CancelablePromise<T>;
 /** Cancels every active job and drops every queued job. Queued jobs never start. */
 cancelAll(reason?: unknown): void;
}

/** Creates a {@link Pool} that runs at most `limit` jobs concurrently. */
interface QueueEntry {
 start(): void;
 /** Rejects the caller's handle without starting the job. Used by cancelAll and queued-cancel. */
 rejectQueued(reason?: unknown): void;
}

export function createPool(limit: number): Pool {
 let active = 0;
 const queue: QueueEntry[] = [];
 const running = new Set<CancelablePromise<unknown>>();

 const pump = (): void => {
 while (active < limit && queue.length > 0) {
 const entry = queue.shift();
 entry?.start();
 }
 };

 const run = <T>(job: () => CancelablePromise<T>): CancelablePromise<T> => {
 return new CancelablePromise<T>((resolve, reject, { handleCancel }) => {
 const release = (): void => {
 active--;
 pump();
 };

 const entry: QueueEntry = {
 start: () => {
 active++;
 const p = job();
 running.add(p as CancelablePromise<unknown>);
 // handleCancel now targets the in-flight job so canceling the handle cancels the job.
 handleCancel((r) => p.cancel(r));
 // finally-equivalent via then(f, f): free the slot and pump whether the job settled or not.
 p.then(resolve, reject).then(
 () => {
 running.delete(p as CancelablePromise<unknown>);
 release();
 },
 () => {
 running.delete(p as CancelablePromise<unknown>);
 release();
 }
 );
 },
 rejectQueued: (r) => {
 reject(isCancelError(r) ? r : new CancelError('Canceled while queued'));
 },
 };

 // While queued, canceling the handle removes the job from the queue so it never starts.
 handleCancel((r) => {
 const index = queue.indexOf(entry);
 if (index !== -1) {
 queue.splice(index, 1);
 entry.rejectQueued(r);
 }
 });

 queue.push(entry);
 pump();
 });
 };

 const cancelAll = (reason?: unknown): void => {
 // Drop queued jobs first so nothing new starts, rejecting each queued handle in turn.
 const queued = queue.splice(0, queue.length);
 for (const entry of queued) entry.rejectQueued(reason);
 // Then cancel what is already running.
 for (const p of running) p.cancel(reason);
 running.clear();
 };

 return { run, cancelAll };
}
