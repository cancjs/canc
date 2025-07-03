import { cancAsync, cancAwait } from './coroutine';
import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';

// Deterministic microtask flush: drains the microtask queue N times so chained
// then-callbacks (each a fresh microtask hop) all run. No arbitrary sleeps (testing doctrine).
const flush = async (times = 12) => {
 for (let i = 0; i < times; i++) {
 await Promise.resolve();
 }
};

describe('cancAsync', () => {
 describe('argument validation + this threading', () => {
 it('throws TypeError for non-function argument', () => {
 expect(() => cancAsync(123 as any)).toThrow(TypeError);
 });

 it('threads explicit ctx into the generator function', async () => {
 const co = cancAsync(function* (this: { v: number }) {
 return this.v;
 }, { v: 42 });

 await expect(co()).resolves.toBe(42);
 });

 it('threads call-site this when no ctx supplied', async () => {
 const holder = {
 v: 7,
 run: cancAsync(function* (this: { v: number }) {
 return this.v;
 }),
 };

 await expect(holder.run()).resolves.toBe(7);
 });

 it('ctx wins over call-site this', async () => {
 const holder = {
 v: 1,
 run: cancAsync(function* (this: { v: number }) {
 return this.v;
 }, { v: 999 }),
 };

 await expect(holder.run()).resolves.toBe(999);
 });

 it('forwards arguments to the generator function', async () => {
 const co = cancAsync(function* (a: number, b: number) {
 return a + b;
 });

 await expect(co(2, 3)).resolves.toBe(5);
 });
 });

 describe('happy path + return value', () => {
 it('resolves with the generator return value', async () => {
 const co = cancAsync(function* () {
 const a = (yield Promise.resolve(2)) as number;
 const b = (yield Promise.resolve(3)) as number;
 return a + b;
 });

 await expect(co()).resolves.toBe(5);
 });

 it('resolves with a plain (non-promise) return value', async () => {
 const co = cancAsync(function* () {
 return 10;
 });

 await expect(co()).resolves.toBe(10);
 });

 it('adopts a thenable return value', async () => {
 const co = cancAsync(function* () {
 return Promise.resolve('done') as any;
 });

 await expect(co()).resolves.toBe('done');
 });

 it('typed yield* cancAwait threads value through', async () => {
 const co = cancAsync(function* () {
 const n = yield* cancAwait(Promise.resolve(21));
 return n * 2;
 });

 await expect(co()).resolves.toBe(42);
 });

 it('returns a CancelablePromise', () => {
 const co = cancAsync(function* () {
 return 1;
 });

 expect(co()).toBeInstanceOf(CancelablePromise);
 });
 });

 describe('rejection propagation', () => {
 it('rejects when a yielded promise rejects (uncaught)', async () => {
 const co = cancAsync(function* () {
 yield Promise.reject(new Error('boom'));
 });

 await expect(co()).rejects.toThrow('boom');
 });

 it('surfaces a rejected yield into try/catch inside the generator', async () => {
 const co = cancAsync(function* () {
 try {
 yield Promise.reject(new Error('inner'));
 return 'no-throw';
 } catch (e) {
 return `caught:${(e as Error).message}`;
 }
 });

 await expect(co()).resolves.toBe('caught:inner');
 });

 it('rejects when the generator throws after a yield', async () => {
 const co = cancAsync(function* () {
 yield Promise.resolve(1);
 throw new Error('post-yield');
 });

 await expect(co()).rejects.toThrow('post-yield');
 });
 });

 describe('sync-throw generators', () => {
 it('rejects when genFn throws synchronously on invocation', async () => {
 const co = cancAsync(function* () {
 throw new Error('sync-invoke');
 // eslint-disable-next-line no-unreachable
 yield 1;
 });

 await expect(co()).rejects.toThrow('sync-invoke');
 });

 it('rejects when the first step throws before any yield', async () => {
 const co = cancAsync(function* () {
 JSON.parse('{ not json');
 yield 1;
 });

 await expect(co()).rejects.toThrow();
 });

 it('does not throw synchronously out of the coroutine call', () => {
 const co = cancAsync(function* () {
 throw new Error('x');
 // eslint-disable-next-line no-unreachable
 yield 1;
 });

 let p: any;
 expect(() => {
 p = co();
 }).not.toThrow();
 return p.catch(() => {});
 });
 });

 describe('cancel before first step', () => {
 it('cancel synchronously right after construction rejects with CancelError', async () => {
 let entered = false;
 const co = cancAsync(function* () {
 entered = true;
 yield Promise.resolve(1);
 return 'reached';
 });

 const p = co();
 p.cancel();

 await expect(p.catch((e: any) => e)).resolves.toBeInstanceOf(CancelError);
 // First step runs synchronously (gen.next() before return), so `entered` is true, but the
 // coroutine never resolves with 'reached'.
 expect(entered).toBe(true);
 });

 it('isCanceled is true after cancel on completed generator', async () => {
 const co = cancAsync(function* () {
 yield Promise.resolve(1);
 return 'done';
 });

 const p = co();
 await p; // Let it complete normally
 expect(p.isCanceled).toBe(false);

 // This cancel is on a settled (fulfilled) promise, so it's a no-op
 const result = p.cancel();
 expect(result).toBeUndefined(); // Non-pending promise returns undefined
 });

 it('generator body after first yield does not run when canceled before resolution', async () => {
 let afterFirst = false;
 const co = cancAsync(function* () {
 yield Promise.resolve(1);
 afterFirst = true;
 return 'x';
 });

 const p = co();
 p.cancel();
 await flush();

 expect(afterFirst).toBe(false);
 });
 });

 describe('cancel between steps — every gap (fake timers)', () => {
 // Build a coroutine with N sequential timer-backed yields. Cancel at each gap g (0..N) and
 // assert: only steps < g ran, coroutine settles canceled, no step >= g runs afterward.
 const STEPS = 4;

 const makeCoroutine = (log: number[]) =>
 cancAsync(function* () {
 for (let i = 0; i < STEPS; i++) {
 yield new CancelablePromise<void>((resolve) => {
 setTimeout(resolve, 10);
 });
 log.push(i);
 }
 return 'complete';
 });

 beforeEach(() => {
 jest.useFakeTimers();
 });

 afterEach(() => {
 jest.runOnlyPendingTimers();
 jest.useRealTimers();
 });

 for (let gap = 0; gap < STEPS; gap++) {
 it(`cancel at gap ${gap} runs exactly ${gap} steps`, async () => {
 const log: number[] = [];
 const co = makeCoroutine(log);
 const p = co();
 p.catch(suppressCancel);

 // Advance through `gap` completed steps (but not all steps, so generator is still pending).
 for (let i = 0; i < gap; i++) {
 jest.advanceTimersByTime(10);
 // flush microtasks with fake timers active: chained thens still resolve as microtasks
 await flush(3);
 }

 expect(log).toEqual(Array.from({ length: gap }, (_, i) => i));

 p.cancel();
 // Flush to let cancel handler settle and drain complete
 await flush(5);

 expect(p.isCanceled).toBe(true);
 // No further steps ran after cancel.
 expect(log).toEqual(Array.from({ length: gap }, (_, i) => i));
 });
 }
 });

 describe('try/finally cleanup on cancel', () => {
 it('runs a synchronous finally block on cancel', async () => {
 let cleaned = false;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {
 /* never settles */
 });
 } finally {
 cleaned = true;
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush();

 expect(cleaned).toBe(true);
 await expect(p.catch((e: any) => e)).resolves.toBeInstanceOf(CancelError);
 });

 it('runs nested finally blocks on cancel', async () => {
 const order: string[] = [];
 const co = cancAsync(function* () {
 try {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 order.push('inner');
 }
 } finally {
 order.push('outer');
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush();

 expect(order).toEqual(['inner', 'outer']);
 });

 it('does not run finally before cancel (still pending)', async () => {
 let cleaned = false;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 cleaned = true;
 }
 });

 const p = co();
 await flush();
 expect(cleaned).toBe(false);
 p.cancel();
 await flush();
 expect(cleaned).toBe(true);
 });

 it('finally cleanup runs when cancel fires before first yield settles', async () => {
 let cleaned = false;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 cleaned = true;
 }
 });

 const p = co();
 p.cancel(); // cancel immediately, before microtasks
 await flush();
 expect(cleaned).toBe(true);
 });
 });

 describe('yield-in-finally shielded drain', () => {
 it('runs async cleanup that yields inside finally, to completion', async () => {
 const order: string[] = [];
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 order.push('finally-start');
 yield Promise.resolve('cleanup-1');
 order.push('finally-mid');
 yield Promise.resolve('cleanup-2');
 order.push('finally-end');
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush(20);

 // Whole finally body ran despite the yields (shielded steps).
 expect(order).toEqual(['finally-start', 'finally-mid', 'finally-end']);
 await expect(p.catch((e: any) => e)).resolves.toBeInstanceOf(CancelError);
 });

 it('threads yielded cleanup values back into the finally block', async () => {
 let received: any = null;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 received = yield Promise.resolve('resource-value');
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush(20);

 expect(received).toBe('resource-value');
 });

 it('shielded finally step is not canceled by the coroutine cancel', async () => {
 let cleanupResolved = false;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 // A slow cleanup that must complete even though the coroutine is canceled.
 yield new CancelablePromise<void>((resolve) => {
 Promise.resolve().then(() => Promise.resolve()).then(() => {
 cleanupResolved = true;
 resolve();
 });
 });
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush(20);

 expect(cleanupResolved).toBe(true);
 });

 it('a throw inside finally surfaces as the coroutine rejection', async () => {
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 yield Promise.resolve('step');
 throw new Error('cleanup-failed');
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush(20);

 const err = await p.catch((e: any) => e);
 expect(err).toBeInstanceOf(Error);
 expect((err as any).message).toBe('cleanup-failed');
 });

 it('a rejected cleanup yield can be caught inside finally', async () => {
 let caught: string | null = null;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 try {
 yield Promise.reject(new Error('cleanup-reject'));
 } catch (e) {
 caught = (e as Error).message;
 }
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush(20);

 expect(caught).toBe('cleanup-reject');
 });

 it('does not restart the finally drain on a second cancel (re-entrancy guard)', async () => {
 let finallyRuns = 0;
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 finallyRuns++;
 yield Promise.resolve(1);
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 p.cancel(); // second cancel is a no-op on an already-canceled promise
 await flush(20);

 expect(finallyRuns).toBe(1);
 });
 });

 describe('gen.throw / gen.next on done generator', () => {
 it('does not re-enter a completed generator after cancel', async () => {
 let extraSteps = 0;
 const co = cancAsync(function* () {
 yield Promise.resolve(1);
 return 'done';
 });

 const p = co();
 const result = await p; // completes normally
 expect(result).toBe('done');

 // Cancel after completion is a no-op (settled promise), no re-entry.
 p.cancel();
 await flush();
 expect(extraSteps).toBe(0);
 expect(p.isCanceled).toBe(false);
 });

 it('generator finishing normally during cancel drain does not double-settle', async () => {
 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {});
 } finally {
 // finally completes synchronously (no yield) → gen.return reports done immediately
 }
 });

 const p = co();
 await flush(2);
 p.cancel();
 await flush();

 await expect(p.catch((e: any) => e)).resolves.toBeInstanceOf(CancelError);
 });
 });

 describe('per-step options: signal not re-subscribed', () => {
 it('coroutine is canceled once when its signal aborts, across many steps', async () => {
 const controller = new AbortController();
 const cancelReasons: any[] = [];

 const co = cancAsync(function* () {
 for (let i = 0; i < 3; i++) {
 yield Promise.resolve(i);
 }
 return 'complete';
 }, undefined, { signal: controller.signal });

 const p = co();
 p.handleCancel((r) => cancelReasons.push(r));

 controller.abort(new Error('aborted'));
 await flush();

 expect(p.isCanceled).toBe(true);
 // Exactly one cancellation of the coroutine promise (signal subscribed once, on the outer
 // promise — not re-subscribed per step).
 expect(cancelReasons.length).toBe(1);
 });

 it('a pre-aborted signal does not throw mid-coroutine on later steps', async () => {
 const controller = new AbortController();

 const co = cancAsync(function* () {
 yield Promise.resolve(1);
 yield Promise.resolve(2);
 return 'x';
 }, undefined, { signal: controller.signal });

 // Pre-abort BEFORE the coroutine runs: outer promise handles it; per-step wrappers (flag-only
 // options) must not re-apply the aborted signal and throw.
 controller.abort();
 let threw = false;
 let p: any;
 try {
 p = co();
 } catch {
 threw = true;
 }
 expect(threw).toBe(false);
 await p.catch(suppressCancel);
 expect(p.isCanceled).toBe(true);
 });
 });

 describe('cancel reason + error shape', () => {
 it('rejects with a CancelError branded via isCancelError', async () => {
 const co = cancAsync(function* () {
 yield new CancelablePromise<void>(() => {});
 });

 const p = co();
 await flush();
 p.cancel('user-reason');

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 });

 it('suppressCancel swallows the coroutine cancellation', async () => {
 const co = cancAsync(function* () {
 yield new CancelablePromise<void>(() => {});
 });

 const p = co();
 await flush();
 p.cancel();

 await expect(p.catch(suppressCancel)).resolves.toBeUndefined();
 });
 });

 describe('cancAwait typed helper', () => {
 it('cancAwait is a generator-producing function', () => {
 const g = cancAwait(Promise.resolve(1));
 expect(typeof (g as any).next).toBe('function');
 });

 it('yield* cancAwait yields the underlying value', async () => {
 const co = cancAsync(function* () {
 const a = yield* cancAwait(Promise.resolve(1));
 const b = yield* cancAwait(Promise.resolve(2));
 return a + b;
 });

 await expect(co()).resolves.toBe(3);
 });
 });
});
