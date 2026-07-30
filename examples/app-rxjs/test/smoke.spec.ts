import { Subject, Observable, EmptyError, firstValueFrom, of } from 'rxjs';
import CancelablePromise, { isCancelError } from '@cancjs/promise';
import { sleep } from '@shared/util';
import { SearchRecord } from '../src/mock/log-source';
import { clickTwoLines } from '../src/viewer';
import { toCancelablePromise, fromCancelablePromise, from } from '../src/lib/canc-rxjs';
import { contextSearches as cancContextSearches } from '../src/search-canc';
import { contextSearches as vanillaContextSearches } from '../src/search-vanilla';

// Runs the two-click scenario against one flavor's contextSearches and returns its search log.
async function runScenario(
 wire: (clicks: Subject<number>, log: SearchRecord[]) => { subscribe(fn: () => void): unknown }
): Promise<SearchRecord[]> {
 const clicks = new Subject<number>();
 const log: SearchRecord[] = [];
 wire(clicks, log).subscribe(() => {});
 await clickTwoLines(clicks);
 await sleep(80);
 return log;
}

describe('app-rxjs smoke', () => {
 it('canc: switching away cancels the abandoned search (1 aborted, 1 completed)', async () => {
 const log = await runScenario(cancContextSearches);

 const completed = log.filter((r) => r.status === 'completed');
 const aborted = log.filter((r) => r.status === 'aborted');
 expect(completed).toHaveLength(1);
 expect(aborted).toHaveLength(1);
 expect(aborted[0].lineSeq).toBe(3); // the abandoned first click
 expect(completed[0].lineSeq).toBe(5); // the surviving second click
 });

 it('vanilla: switching away leaks — both searches complete (the bug we teach)', async () => {
 const log = await runScenario(vanillaContextSearches);

 const completed = log.filter((r) => r.status === 'completed');
 const aborted = log.filter((r) => r.status === 'aborted');
 expect(completed).toHaveLength(2); // both promises ran to completion
 expect(aborted).toHaveLength(0);
 });

 it('toCancelablePromise: cancel() unsubscribes and rejects with CancelError', async () => {
 let torn = false;
 const observable = new Observable<number>(() => {
 // never emits; teardown flips the flag when the subscription is cancelled.
 return () => {
 torn = true;
 };
 });

 const pending = toCancelablePromise<number>(observable);
 pending.cancel();

 let caught: unknown;
 try {
 await pending;
 } catch (error) {
 caught = error;
 }
 expect(isCancelError(caught)).toBe(true);
 expect(torn).toBe(true); // teardown ran because cancel unsubscribed
 });

 it('toCancelablePromise: first value resolves, empty stream rejects with EmptyError', async () => {
 await expect(toCancelablePromise(of(7))).resolves.toBe(7);
 await expect(firstValueFrom(of(7))).resolves.toBe(7);

 await expect(toCancelablePromise(of<number>())).rejects.toBeInstanceOf(EmptyError);
 });

 it('fromCancelablePromise: unsubscribe cancels the promise (teardown -> abort marker)', async () => {
 const log: SearchRecord[] = [];
 const factory = () =>
 new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
 log.push({ lineSeq: 0, status: 'started' });
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 controller.signal.addEventListener('abort', () => {
 log.push({ lineSeq: 0, status: 'aborted' });
 const err = new Error('aborted');
 err.name = 'AbortError';
 reject(err);
 });
 // never resolves on its own within the test window
 setTimeout(() => resolve(1), 1000);
 });

 const subscription = fromCancelablePromise(factory).subscribe({ error: () => {} });
 subscription.unsubscribe();
 await sleep(0);

 expect(log.map((r) => r.status)).toEqual(['started', 'aborted']);
 });

 it('from: for await yields the emitted values in order', async () => {
 const seen = await (async () => {
 const out: number[] = [];
 for await (const value of from<number>(from$([1, 2, 3]))) {
 out.push(value);
 }
 return out;
 })();

 expect(seen).toEqual([1, 2, 3]);
 });

 it('from: canceling the consuming coroutine unsubscribes the source', async () => {
 let unsubscribed = false;
 // Hot source that never completes; teardown flips the flag on unsubscribe.
 const observable = new Observable<number>((subscriber) => {
 subscriber.next(10);
 return () => {
 unsubscribed = true;
 };
 });

 const iterable = from(observable);
 const iterator = iterable[Symbol.asyncIterator]();

 const first = await iterator.next();
 expect(first).toEqual({ value: 10, done: false });
 expect(unsubscribed).toBe(false);

 // A canceling coroutine drives the loop's teardown via the iterator's return(); assert it
 // unsubscribes and drives the bridge promise to a CancelError.
 await iterator.return!();
 expect(unsubscribed).toBe(true);

 let caught: unknown;
 try {
 await iterable.done;
 } catch (error) {
 caught = error;
 }
 expect(isCancelError(caught)).toBe(true);

 // Further pulls report a clean end.
 expect(await iterator.next()).toEqual({ value: undefined, done: true });
 });

 it('from: an error on the observable rejects the iteration', async () => {
 const boom = new Error('stream failed');
 const subject = new Subject<number>();
 const iterator = from(subject)[Symbol.asyncIterator]();

 const pull = iterator.next();
 subject.next(1);
 expect(await pull).toEqual({ value: 1, done: false });

 // Buffer a value, then error: the buffered value drains first, then the error surfaces.
 subject.next(2);
 subject.error(boom);
 expect(await iterator.next()).toEqual({ value: 2, done: false });
 await expect(iterator.next()).rejects.toBe(boom);
 });
});

// Small helper: an Observable of a fixed array, so the ordering test does not lean on `of`'s
// synchronous emission timing.
function from$<T>(items: T[]): Observable<T> {
 return new Observable<T>((subscriber) => {
 for (const item of items) subscriber.next(item);
 subscriber.complete();
 });
}
