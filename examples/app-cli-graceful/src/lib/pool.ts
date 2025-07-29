import { CancelablePromise } from '@cancjs/promise';

/**
 * Runs `worker` over `items` with at most `concurrency` in flight at once. The returned promise
 * is a CancelablePromise: canceling it cancels every in-flight `worker` call and never starts a
 * queued one. Results are returned in input order once all items settle.
 */
export function pool<TItem, TResult>(
 items: readonly TItem[],
 concurrency: number,
 worker: (item: TItem) => CancelablePromise<TResult>
): CancelablePromise<TResult[]> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const results: TResult[] = new Array(items.length);
 const running = new Set<CancelablePromise<TResult>>();
 let nextIndex = 0;
 let settledCount = 0;
 let canceled = false;

 handleCancel(() => {
 canceled = true;
 running.forEach((p) => p.cancel());
 });

 const startNext = () => {
 if (canceled || nextIndex >= items.length) return;
 const index = nextIndex++;
 const item = items[index];
 const running_ = worker(item);
 running.add(running_);
 running_.then(
 (value) => {
 running.delete(running_);
 results[index] = value;
 settledCount++;
 if (settledCount === items.length) {
 resolve(results);
 } else {
 startNext();
 }
 },
 (error) => {
 running.delete(running_);
 if (!canceled) reject(error);
 }
 );
 };

 for (let i = 0; i < concurrency && i < items.length; i++) {
 startNext();
 }
 if (items.length === 0) resolve(results);
 });
}
