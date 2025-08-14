import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { sleep } from '../../util/src/sleep';
import { createPool } from '../src/pool';

/** A job that resolves after `ms`, tracking whether it ever started running. */
function makeJob(ms: number, started: { count: number }) {
 return () =>
 new CancelablePromise<void>((resolve, reject, handleCancel) => {
 started.count++;
 const timer = setTimeout(resolve, ms);
 handleCancel((reason) => {
 clearTimeout(timer);
 reject(reason);
 });
 });
}

describe('createPool', () => {
 it('respects the concurrency limit', async () => {
 const pool = createPool(2);
 let concurrent = 0;
 let maxConcurrent = 0;

 const job = () =>
 new CancelablePromise<void>((resolve, reject, handleCancel) => {
 concurrent++;
 maxConcurrent = Math.max(maxConcurrent, concurrent);
 const timer = setTimeout(() => {
 concurrent--;
 resolve();
 }, 20);
 handleCancel((reason) => {
 clearTimeout(timer);
 concurrent--;
 reject(reason);
 });
 });

 await Promise.all([pool.run(job), pool.run(job), pool.run(job), pool.run(job)]);

 expect(maxConcurrent).toBe(2);
 });

 it('cancelAll drains the queue so queued jobs never start, and cancels in-flight jobs', async () => {
 const pool = createPool(1);
 const started = { count: 0 };

 const first = pool.run(makeJob(50, started));
 const queued = pool.run(makeJob(50, started));

 // Let the first job claim its slot before canceling the pool.
 await sleep(5);
 expect(started.count).toBe(1);

 pool.cancelAll('shutdown');

 await expect(first.catch((e) => isCancelError(e))).resolves.toBe(true);
 await expect(queued.catch((e) => isCancelError(e))).resolves.toBe(true);
 // The queued job never got a slot, so it never ran.
 expect(started.count).toBe(1);
 });

 it('a job canceled while still queued never starts', async () => {
 const pool = createPool(1);
 const started = { count: 0 };

 const blocker = pool.run(makeJob(30, started));
 const queued = pool.run(makeJob(30, started));

 queued.cancel('born canceled');

 await expect(queued.catch((e) => isCancelError(e))).resolves.toBe(true);
 expect(started.count).toBe(1);

 blocker.cancel();
 await expect(blocker.catch((e) => isCancelError(e))).resolves.toBe(true);
 });
});
