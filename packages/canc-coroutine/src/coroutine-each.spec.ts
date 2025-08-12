import { cancAsync, cancAwait, BreakError, isBreakError } from './coroutine';
import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';

// Deterministic microtask flush (mirrors coroutine.spec): drains the microtask queue N times so
// chained then-callbacks all run, no arbitrary sleeps (testing doctrine).
const flush = async (times = 12) => {
 for (let i = 0; i < times; i++) {
 await Promise.resolve();
 }
};

// A finite async generator over `values`, with a spy that fires when its `finally` runs (i.e. when
// the consumer calls `.return()` or the loop drains to completion).
function makeAsyncSource<T>(values: T[], onReturn?: () => void) {
 return (async function* () {
 try {
 for (const v of values) {
 yield v;
 }
 } finally {
 onReturn?.();
 }
 })();
}

// A controllable async source: each pull blocks on an externally-resolved promise, so a test can
// hold the coroutine mid-stream and cancel it deterministically. `finallyRan` records cleanup.
function makeControllableSource<T>() {
 const gate: Array<{ promise: Promise<T>; resolve: (v: T) => void }> = [];
 const state = { finallyRan: false, pulls: 0 };

 const source = {
 [Symbol.asyncIterator]() {
 return this;
 },
 next(): Promise<IteratorResult<T>> {
 state.pulls++;
 let resolve!: (v: T) => void;
 const promise = new Promise<T>((r) => {
 resolve = r;
 });
 gate.push({ promise, resolve });

 return promise.then((value) => ({ value, done: false }));
 },
 return(): Promise<IteratorResult<T>> {
 state.finallyRan = true;

 return Promise.resolve({ value: undefined as any, done: true });
 },
 };

 const deliver = (index: number, value: T) => gate[index].resolve(value);

 return { source, deliver, state };
}

describe('cancAwait.each', () => {
 it('drains a finite async source, callback sees every value in order with index', async () => {
 const seen: Array<[number, number]> = [];
 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource([10, 20, 30]), (value: number, index: number) => {
 seen.push([index, value]);
 });
 return 'done';
 });

 await expect(co()).resolves.toBe('done');
 expect(seen).toEqual([
 [0, 10],
 [1, 20],
 [2, 30],
 ]);
 });

 it('cancel mid-stream runs the source finally/return, rejects CancelError, no further cb calls', async () => {
 const { source, deliver, state } = makeControllableSource<number>();
 const seen: number[] = [];

 const co = cancAsync(function* () {
 yield* cancAwait.each(source, (value: number) => {
 seen.push(value);
 });
 });

 const p = co();
 p.catch(suppressCancel);

 // First value in flight; deliver it so one cb runs, then a second pull is outstanding.
 deliver(0, 1);
 await flush();
 expect(seen).toEqual([1]);
 expect(state.finallyRan).toBe(false);

 p.cancel();
 await flush();

 expect(state.finallyRan).toBe(true);
 // Deliver the outstanding pull after cancel: it must NOT trigger another cb.
 deliver(1, 2);
 await flush();
 expect(seen).toEqual([1]);

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 expect(err).toBeInstanceOf(CancelError);
 });

 it('cb returning false stops the loop cleanly, source return runs, coroutine resolves', async () => {
 let returned = false;
 const seen: number[] = [];

 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource([1, 2, 3, 4], () => {
 returned = true;
 }), (value: number) => {
 seen.push(value);
 if (value === 2) {
 return false;
 }
 });
 return 'after-loop';
 });

 await expect(co()).resolves.toBe('after-loop');
 expect(seen).toEqual([1, 2]);
 expect(returned).toBe(true);
 });

 it('cb throwing BreakError stops the loop cleanly, source return runs, coroutine resolves', async () => {
 let returned = false;
 const seen: number[] = [];

 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource([1, 2, 3, 4], () => {
 returned = true;
 }), (value: number) => {
 seen.push(value);
 if (value === 2) {
 throw new BreakError();
 }
 });
 return 'after-loop';
 });

 await expect(co()).resolves.toBe('after-loop');
 expect(seen).toEqual([1, 2]);
 expect(returned).toBe(true);
 });

 it('cb throwing a non-Break error rejects the coroutine with that error, source return still runs', async () => {
 let returned = false;
 const boom = new Error('boom');

 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource([1, 2, 3], () => {
 returned = true;
 }), (value: number) => {
 if (value === 2) {
 throw boom;
 }
 });
 });

 const err = await co().catch((e: any) => e);
 expect(err).toBe(boom);
 expect(returned).toBe(true);
 });

 it('awaits an async cb (returned promise) before the next pull', async () => {
 const order: string[] = [];

 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource([1, 2]), (value: number) => {
 order.push(`start:${value}`);

 return Promise.resolve().then(() => {
 order.push(`end:${value}`);
 });
 });
 });

 await co();
 // Each cb fully settles (start then end) before the next value's cb starts.
 expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
 });

 it('async cb returning false (via promise) stops the loop', async () => {
 const seen: number[] = [];

 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource([1, 2, 3]), (value: number) => {
 seen.push(value);

 return Promise.resolve(value === 2 ? false : undefined);
 });
 return 'ok';
 });

 await expect(co()).resolves.toBe('ok');
 expect(seen).toEqual([1, 2]);
 });

 it('drives a sync iterable whose members are promises', async () => {
 const seen: number[] = [];

 const co = cancAsync(function* () {
 yield* cancAwait.each([Promise.resolve(1), Promise.resolve(2), 3], (value: number) => {
 seen.push(value);
 });
 });

 await co();
 expect(seen).toEqual([1, 2, 3]);
 });

 it('native parity: visits the same sequence a native for-await would', async () => {
 const values = [5, 6, 7, 8];

 const native: number[] = [];
 for await (const v of makeAsyncSource(values)) {
 native.push(v);
 }

 const viaEach: number[] = [];
 const co = cancAsync(function* () {
 yield* cancAwait.each(makeAsyncSource(values), (value: number) => {
 viaEach.push(value);
 });
 });
 await co();

 expect(viaEach).toEqual(native);
 });
});

describe('cancAwait.iter', () => {
 it('collects a finite async source into an array in order', async () => {
 const co = cancAsync(function* () {
 const items = yield* cancAwait.iter(makeAsyncSource([1, 2, 3]));
 return items;
 });

 await expect(co()).resolves.toEqual([1, 2, 3]);
 });

 it('collects a sync iterable of promises in order', async () => {
 const co = cancAsync(function* () {
 const items = yield* cancAwait.iter([Promise.resolve('a'), Promise.resolve('b')]);
 return items;
 });

 await expect(co()).resolves.toEqual(['a', 'b']);
 });

 it('cancel mid-collect runs the source return, coroutine rejects CancelError', async () => {
 const { source, deliver, state } = makeControllableSource<number>();

 const co = cancAsync(function* () {
 return yield* cancAwait.iter(source);
 });

 const p = co();
 p.catch(suppressCancel);

 deliver(0, 1);
 await flush();
 expect(state.finallyRan).toBe(false);

 p.cancel();
 await flush();

 expect(state.finallyRan).toBe(true);
 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 });
});

describe('BreakError', () => {
 it('isBreakError matches by brand, not by name', () => {
 expect(isBreakError(new BreakError())).toBe(true);
 expect(isBreakError(new BreakError('stop'))).toBe(true);

 const foreign = new Error('nope');
 foreign.name = 'BreakError';
 expect(isBreakError(foreign)).toBe(false);
 });

 it('carries the shared Symbol.for brand', () => {
 const BRAND = Symbol.for('@cancjs/coroutine:BreakError');
 expect((new BreakError() as any)[BRAND]).toBe(true);
 });

 it('is an Error subclass', () => {
 expect(new BreakError()).toBeInstanceOf(Error);
 });
});
