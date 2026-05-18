import { cancAsync, cancForAwait, BreakError } from './coroutine';
import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';

// Deterministic microtask flush (mirrors coroutine-each.spec): drains the microtask queue N times
// so chained then-callbacks all run, no arbitrary sleeps (testing doctrine).
const flush = async (times = 12) => {
 for (let i = 0; i < times; i++) {
 await Promise.resolve();
 }
};

// Controllable async source: each pull blocks on an externally-resolved deferred. A test can hold
// the coroutine mid-stream and cancel it deterministically. `finallyRan` records cleanup.
// `rejectPendingOnReturn` makes an outstanding pull's promise REJECT when `.return()` is called
// (models a source whose in-flight I/O is aborted on cleanup).
function makeControllableSource<T>(opts: { rejectPendingOnReturn?: boolean; returnRejects?: boolean } = {}) {
 const gate: Array<{ resolve: (v: T) => void; reject: (e: any) => void; settled: boolean }> = [];
 const state = { finallyRan: false, pulls: 0 };

 const source = {
 [Symbol.asyncIterator]() {
 return this;
 },
 next(): Promise<IteratorResult<T>> {
 state.pulls++;
 let resolve!: (v: T) => void;
 let reject!: (e: any) => void;
 const promise = new Promise<T>((res, rej) => {
 resolve = res;
 reject = rej;
 });
 const entry = { resolve, reject, settled: false };
 gate.push(entry);

 return promise.then((value) => ({ value, done: false }));
 },
 return(): Promise<IteratorResult<T>> {
 state.finallyRan = true;

 // Optionally abort any still-pending pull, modeling a source that rejects in-flight I/O when
 // the consumer bails out.
 if (opts.rejectPendingOnReturn) {
 for (const g of gate) {
 if (!g.settled) {
 g.settled = true;
 g.reject(new Error('pull aborted by return'));
 }
 }
 }

 if (opts.returnRejects) {
 return Promise.reject(new Error('return cleanup failed'));
 }

 return Promise.resolve({ value: undefined as any, done: true });
 },
 };

 const deliver = (index: number, value: T) => {
 gate[index].settled = true;
 gate[index].resolve(value);
 };

 return { source, deliver, state };
}

// Records process-level unhandled rejections for the duration of a test.
function trackUnhandled() {
 const rejections: any[] = [];
 const onUnhandled = (reason: any) => rejections.push(reason);
 process.on('unhandledRejection', onUnhandled);

 return {
 rejections,
 stop: () => process.off('unhandledRejection', onUnhandled),
 };
}

describe('cancForAwait / cancForAwait.toArray — cancel semantics (bugs 1-4)', () => {
 // BUG 1: finally-drain must preserve return-unwind. Code AFTER the `yield* each(...)` in the
 // coroutine body must NOT execute when the coroutine is canceled mid-stream.
 it('bug1: code after yield* each does not run on cancel (return-unwind preserved)', async () => {
 const { source, deliver, state } = makeControllableSource<number>();
 let completed = false;

 const co = cancAsync(function* () {
 yield* cancForAwait(source, () => {
 /* consume */
 });
 // This line represents parent code after the delegated loop. On cancel it MUST NOT run.
 completed = true;
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
 // The core assertion: post-loop code stayed dormant.
 expect(completed).toBe(false);
 });

 // BUG 2 (regression guard): a source that aborts its still-suspended in-flight `.next()` when
 // `.return()` is called (rejecting the pull promise the driver handed off) must not orphan that
 // rejection nor turn it into the coroutine outcome. The driver already keeps a handler on the
 // yielded pull and goes inert on cancel, and `returnStepIterator` now swallows the cleanup
 // rejection (bug 3) — together these subsume the old manual `pending.catch(() => undefined)`.
 it('bug2: in-flight pull rejected by return() on cancel does not go unhandled', async () => {
 const tracker = trackUnhandled();
 try {
 const { source, deliver, state } = makeControllableSource<number>({ rejectPendingOnReturn: true });

 const co = cancAsync(function* () {
 yield* cancForAwait(source, () => {
 /* consume */
 });
 });

 const p = co();
 p.catch(suppressCancel);

 deliver(0, 1);
 await flush();
 // A second pull is now outstanding (suspended, waiting).
 expect(state.pulls).toBeGreaterThanOrEqual(2);

 p.cancel();
 await flush();

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 expect(state.finallyRan).toBe(true);

 // Let any orphaned rejection surface.
 await flush();
 expect(tracker.rejections).toEqual([]);
 } finally {
 tracker.stop();
 }
 });

 // BUG 3: a source whose `.return()` returns a REJECTED promise must not orphan, and must not
 // clobber the cancel outcome (coroutine still rejects CancelError, not the cleanup error).
 it('bug3: rejected promise from it.return() is swallowed (sync + async parity)', async () => {
 const tracker = trackUnhandled();
 try {
 const { source, deliver, state } = makeControllableSource<number>({ returnRejects: true });

 const co = cancAsync(function* () {
 yield* cancForAwait(source, () => {
 /* consume */
 });
 });

 const p = co();
 p.catch(suppressCancel);

 deliver(0, 1);
 await flush();

 p.cancel();
 await flush();

 expect(state.finallyRan).toBe(true);
 const err = await p.catch((e: any) => e);
 // Cancel outcome preserved; cleanup rejection did not become the coroutine outcome.
 expect(isCancelError(err)).toBe(true);

 await flush();
 expect(tracker.rejections).toEqual([]);
 } finally {
 tracker.stop();
 }
 });

 // BUG 4: calling .cancel() synchronously from inside an each callback must reject with
 // CancelError and run cleanup, not throw TypeError / skip the coroutine finally.
 it('bug4: re-entrant cancel from inside callback rejects CancelError and runs finally', async () => {
 let coroutineFinallyRan = false;
 let sourceReturnRan = false;

 const source = (async function* () {
 try {
 yield 1;
 yield 2;
 yield 3;
 } finally {
 sourceReturnRan = true;
 }
 })();

 let p: CancelablePromise<any>;
 const co = cancAsync(function* () {
 try {
 yield* cancForAwait(source, (value: number) => {
 if (value === 1) {
 // Re-entrant cancel: synchronous, during a driver step.
 p.cancel();
 }
 });
 } finally {
 coroutineFinallyRan = true;
 }
 });

 p = co();
 p.catch(suppressCancel);

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 expect(err).toBeInstanceOf(CancelError);
 expect(coroutineFinallyRan).toBe(true);
 expect(sourceReturnRan).toBe(true);
 });

 // bug1 for toArray: code after a `yield* cancForAwait.toArray` must also stay dormant on cancel.
 it('bug1/toArray: code after yield* cancForAwait.toArray does not run on cancel', async () => {
 const { source, deliver, state } = makeControllableSource<number>();
 let completed = false;

 const co = cancAsync(function* () {
 yield* cancForAwait.toArray(source);
 completed = true;
 });

 const p = co();
 p.catch(suppressCancel);

 deliver(0, 1);
 await flush();
 p.cancel();
 await flush();

 expect(state.finallyRan).toBe(true);
 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 expect(completed).toBe(false);
 });

 // The bug1 fix must still run the PARENT's own yield-in-finally cleanup on cancel (return-unwind
 // re-assertion must not skip real coroutine cleanup surrounding the loop).
 it('bug1: parent yield-in-finally still runs on cancel through each', async () => {
 const { source, deliver, state } = makeControllableSource<number>();
 const order: string[] = [];

 const co = cancAsync(function* () {
 try {
 yield* cancForAwait(source, () => {
 /* consume */
 });
 order.push('post-loop'); // must NOT run
 } finally {
 order.push('finally-start');
 yield Promise.resolve('cleanup');
 order.push('finally-end');
 }
 });

 const p = co();
 p.catch(suppressCancel);

 deliver(0, 1);
 await flush();
 p.cancel();
 await flush();

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 expect(state.finallyRan).toBe(true);
 // Parent finally ran fully (both sides of its yield), post-loop code did not.
 expect(order).toEqual(['finally-start', 'finally-end']);
 });

 // Regression guard: the bug1 fix (return-unwind resume) must NOT break normal completion — code
 // after a `yield* each` that drains fully MUST still run.
 it('regression: code after yield* each runs on normal completion', async () => {
 let completed = false;
 const co = cancAsync(function* () {
 yield* cancForAwait(
 (async function* () {
 yield 1;
 yield 2;
 })(),
 () => {
 /* consume */
 },
 );
 completed = true;
 return 'ok';
 });

 await expect(co()).resolves.toBe('ok');
 expect(completed).toBe(true);
 });
});
