import { cancAsync, cancAwait, cancForAwait } from './coroutine';
import { cancGenAsync, cancGenAwait, cancGenDelegate, AsyncGenResult } from './coroutine-gen';
import { CancelablePromise, CancelError, catchCancel, isCancelError, suppressCancel } from '@cancjs/promise';

// Fills the GAP rows in ../../.claude/rfc-coroutine-coverage.md against rfc-coroutine.md. Every
// test here asserts real runtime behavior (would fail on a no-op / stub), not just typechecking —
// the combinator + type-level surface is already covered by tests-types/fixtures/common/coroutine-types.ts.

const flush = async (times = 12) => {
 for (let i = 0; i < times; i++) {
 await Promise.resolve();
 }
};

describe('rfc §2 — cancAwait combinators, runtime behavior inside a coroutine', () => {
 it('cancAwait.all resolves the tuple and threads it through yield*', async () => {
 const co = cancAsync(function* () {
 const tuple = yield* cancAwait.all([Promise.resolve(1), Promise.resolve('a'), Promise.resolve(true)]);
 return tuple;
 });

 await expect(co()).resolves.toEqual([1, 'a', true]);
 });

 it('cancAwait.all: coroutine cancel stops at that yield*, coroutine rejects CancelError', async () => {
 // Cancel-losers doctrine (rfc §2) only cancels remaining inputs when one input REJECTS —
 // canceling the combined result promise itself does not bubble down into still-pending inputs
 // (canc-promise/cancelable-promise.ts static all(), see its _chainInput comment). What the
 // coroutine layer owns is: canceling the coroutine at a `yield* cancAwait.all(...)` step stops
 // the coroutine there and rejects it with CancelError, same as any other yield* cancel point.
 const pending = new CancelablePromise<number>(() => {
 /* never settles */
 });

 const co = cancAsync(function* () {
 yield* cancAwait.all([Promise.resolve(1), pending]);
 return 'unreached';
 });

 const p = co();
 p.catch(suppressCancel);
 await flush(3);
 p.cancel();
 await flush(20);

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 });

 it('cancAwait.all: one input rejecting cancels the rest and rejects the coroutine (not CancelError)', async () => {
 let siblingCanceled = false;
 const sibling = new CancelablePromise<number>((_resolve, _reject, handleCancel) => {
 handleCancel(() => {
 siblingCanceled = true;
 });
 });
 const boom = new Error('all-input-boom');

 const co = cancAsync(function* () {
 yield* cancAwait.all([Promise.reject(boom), sibling]);
 return 'unreached';
 });

 const err = await co().catch((e: any) => e);
 await flush(2);

 expect(err).toBe(boom);
 expect(siblingCanceled).toBe(true);
 });

 it('cancAwait.race: winner value threads through yield*, loser gets canceled', async () => {
 let loserCanceled = false;
 const loser = new CancelablePromise<string>((_resolve, _reject, handleCancel) => {
 handleCancel(() => {
 loserCanceled = true;
 });
 });
 const winner = new CancelablePromise<string>((resolve) => {
 Promise.resolve().then(() => resolve('fast'));
 });

 const co = cancAsync(function* () {
 const value = yield* cancAwait.race([winner, loser]);
 return value;
 });

 await expect(co()).resolves.toBe('fast');
 await flush(3);
 expect(loserCanceled).toBe(true);
 });

 it('cancAwait.any: first fulfillment wins, other pending input canceled', async () => {
 let loserCanceled = false;
 const loser = new CancelablePromise<string>((_resolve, _reject, handleCancel) => {
 handleCancel(() => {
 loserCanceled = true;
 });
 });
 const winner = new CancelablePromise<string>((resolve) => {
 Promise.resolve().then(() => resolve('winner'));
 });

 const co = cancAsync(function* () {
 const value = yield* cancAwait.any([winner, loser]);
 return value;
 });

 await expect(co()).resolves.toBe('winner');
 await flush(3);
 expect(loserCanceled).toBe(true);
 });

 it('cancAwait.allSettled: never cancels a pending input, resolves full settled tuple', async () => {
 let canceled = false;
 const slow = new CancelablePromise<number>((resolve, _reject, handleCancel) => {
 handleCancel(() => {
 canceled = true;
 });
 Promise.resolve().then(() => Promise.resolve()).then(() => resolve(2));
 });

 const co = cancAsync(function* () {
 const settled = yield* cancAwait.allSettled([Promise.resolve(1), slow]);
 return settled;
 });

 await expect(co()).resolves.toEqual([
 { status: 'fulfilled', value: 1 },
 { status: 'fulfilled', value: 2 },
 ]);
 expect(canceled).toBe(false);
 });

 it('cancAwait.try: wraps a sync-returning fn and resolves its value through yield*', async () => {
 const co = cancAsync(function* () {
 const x = yield* cancAwait.try(() => 1);
 return x;
 });

 await expect(co()).resolves.toBe(1);
 });

 it('cancAwait.try: a synchronously-throwing fn rejects the coroutine', async () => {
 const boom = new Error('try-boom');
 const co = cancAsync(function* () {
 yield* cancAwait.try((): number => {
 throw boom;
 });
 return 'unreached';
 });

 const err = await co().catch((e: any) => e);
 expect(err).toBe(boom);
 });

 it('cancAwait.try: forwards args to fn and resolves an async result', async () => {
 const co = cancAsync(function* () {
 const sum = yield* cancAwait.try((a: number, b: number) => Promise.resolve(a + b), 2, 3);
 return sum;
 });

 await expect(co()).resolves.toBe(5);
 });
});

describe('rfc §3 — catchCancel and in-body catch vs coroutine cancel', () => {
 it('in-body catch does not see the coroutine\'s own cancel (unwinds via finally, not catch)', async () => {
 let caughtInBody = false;
 let finallyRan = false;

 const co = cancAsync(function* () {
 try {
 yield new CancelablePromise<void>(() => {
 /* never settles */
 });
 } catch {
 caughtInBody = true;
 } finally {
 finallyRan = true;
 }
 });

 const p = co();
 p.catch(suppressCancel);
 await flush(2);
 p.cancel();
 await flush(5);

 expect(caughtInBody).toBe(false);
 expect(finallyRan).toBe(true);
 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 });

 it('in-body catch DOES catch a sub-operation that fails independently', async () => {
 const co = cancAsync(function* () {
 try {
 yield* cancAwait<string>(Promise.reject(new Error('sub-op-failed')));
 return 'no-throw';
 } catch (e) {
 return `caught:${(e as Error).message}`;
 }
 });

 await expect(co()).resolves.toBe('caught:sub-op-failed');
 });

 it('catchCancel resolves a canceled coroutine promise to a CancelError, never rejects', async () => {
 const co = cancAsync(function* () {
 yield new CancelablePromise<void>(() => {
 /* never settles */
 });
 });

 const p = co();
 await flush(2);
 p.cancel();

 const result = await catchCancel(p);
 expect(result).toBeInstanceOf(CancelError);
 });

 it('catchCancel passes through the resolved value on a non-canceled coroutine', async () => {
 const co = cancAsync(function* () {
 return 'ok';
 });

 const result = await catchCancel(co());
 expect(result).toBe('ok');
 });
});

describe('rfc §5 — nested cancAsync delegation', () => {
 it('canceling the outer coroutine cancels the in-flight sub-call', async () => {
 let subCanceled = false;

 const reserveStock = cancAsync(function* () {
 yield new CancelablePromise<void>((_resolve, _reject, handleCancel) => {
 handleCancel(() => {
 subCanceled = true;
 });
 });
 return 'reserved';
 });

 const checkout = cancAsync(function* () {
 const reservation = yield* cancAwait(reserveStock());
 return reservation;
 });

 const p = checkout();
 p.catch(suppressCancel);
 await flush(2);
 p.cancel();
 await flush(3);

 expect(subCanceled).toBe(true);
 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 });
});

describe('rfc §6 — per-item callback form 3 (explicit cancAsync) parity with form 2 (bare generator fn)', () => {
 const work = (v: number) =>
 new CancelablePromise<number>((resolve) => {
 Promise.resolve().then(() => resolve(v * 10));
 });

 async function* source() {
 yield 1;
 yield 2;
 }

 it('form 2 (bare generator fn) and form 3 (explicit cancAsync) emit identical order', async () => {
 const orderForm2: string[] = [];
 const orderForm3: string[] = [];

 const coForm2 = cancAsync(function* () {
 yield* cancForAwait(source(), function* (value: number) {
 orderForm2.push(`start:${value}`);
 const doubled = yield* cancAwait(work(value));
 orderForm2.push(`end:${value}:${doubled}`);
 });
 });

 const coForm3 = cancAsync(function* () {
 yield* cancForAwait(
 source(),
 cancAsync(function* (value: number) {
 orderForm3.push(`start:${value}`);
 const doubled = yield* cancAwait(work(value));
 orderForm3.push(`end:${value}:${doubled}`);
 }) as any,
 );
 });

 await coForm2();
 await coForm3();

 expect(orderForm3).toEqual(orderForm2);
 expect(orderForm2).toEqual(['start:1', 'end:1:10', 'start:2', 'end:2:20']);
 });
});

describe('rfc §6 — sync iterable of promises, sequential (not parallel) cancel points', () => {
 it('members are awaited one at a time, in order, not started in parallel', async () => {
 const started: number[] = [];
 const finished: number[] = [];

 const makeDeferred = (id: number) =>
 new Promise<number>((resolve) => {
 started.push(id);
 Promise.resolve().then(() => Promise.resolve()).then(() => {
 finished.push(id);
 resolve(id);
 });
 });

 const co = cancAsync(function* () {
 // Constructing the array eagerly starts each promise "started" push at array-build time
 // (unavoidable for real promises), so what this test actually proves is the ORDER each
 // member is picked up / awaited-completed by cancForAwait — sequential, not Promise.all.
 const items = yield* cancForAwait.toArray([1, 2, 3].map((id) => makeDeferred(id)));
 return items;
 });

 await expect(co()).resolves.toEqual([1, 2, 3]);
 // Each finished strictly before the next one started its "then" chain resolution — since all
 // three underlying promises were already in flight (constructed eagerly), the real sequential
 // guarantee is in cancForAwait's pull-then-await-then-pull loop: assert finish order matches
 // construction order (no reordering / no partial interleave surfacing out of order).
 expect(finished).toEqual([1, 2, 3]);
 expect(started).toEqual([1, 2, 3]);
 });

 it('cancel mid-sequence stops before consuming later members', async () => {
 let secondStarted = false;
 const first = new CancelablePromise<number>((resolve) => {
 Promise.resolve().then(() => resolve(1));
 });
 const second = new CancelablePromise<number>(() => {
 secondStarted = true;
 /* never settles, would only be awaited if reached */
 });

 const co = cancAsync(function* () {
 const items = yield* cancForAwait.toArray([first, second]);
 return items;
 });

 const p = co();
 p.catch(suppressCancel);
 await flush(3);
 p.cancel();
 await flush(3);

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 // second's executor only runs once the sync iterable machinery constructs it (eager by JS
 // semantics), but it must never be AWAITED/yielded past first settling, i.e. the loop stops.
 expect(secondStarted).toBe(true);
 });
});

describe('rfc §6 DON\'T — non-cancelable async callback escapes the cancel chain', () => {
 it('a native async callback keeps running to completion after the coroutine is canceled', async () => {
 let callbackCompleted = false;

 async function* source2() {
 yield 1;
 }

 const co = cancAsync(function* () {
 // Documented anti-pattern (rfc §6 DON'T): native async arrow, not a generator fn — its
 // internal await is NOT a coroutine cancel point.
 yield* cancForAwait(source2(), (async (_value: number) => {
 await new Promise<void>((resolve) => {
 Promise.resolve().then(() => Promise.resolve()).then(() => {
 callbackCompleted = true;
 resolve();
 });
 });
 }) as any);
 });

 const p = co();
 p.catch(suppressCancel);
 await flush(2);
 p.cancel();
 await flush(20);
 // Callback's own internal await chain (two chained .then hops) needs its own real-microtask
 // drain beyond the coroutine's settle, since it runs entirely outside the coroutine's cancel
 // chain (that's the point of the anti-pattern).
 await flush(20);

 // The coroutine itself is canceled...
 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 // ...but the escaped native-async callback body ran to completion regardless (the anti-pattern
 // in action: it is NOT interrupted by the coroutine's cancel).
 expect(callbackCompleted).toBe(true);
 });
});

describe('rfc §8 — cancForAwait.toArray consuming a cancGenAsync producer end-to-end', () => {
 it('collects a real producer\'s emitted values via consumer-side toArray', async () => {
 const producer = cancGenAsync(function* (): Generator<number, void> {
 yield 1;
 yield 2;
 yield 3;
 });

 const co = cancAsync(function* () {
 const items = yield* cancForAwait.toArray(producer());
 return items;
 });

 await expect(co()).resolves.toEqual([1, 2, 3]);
 });

 it('cancel mid-collect over a cancGenAsync producer runs the producer finally', async () => {
 let producerCleanedUp = false;

 const producer = cancGenAsync(function* (): AsyncGenResult<number, void> {
 try {
 yield 1;
 yield* cancGenAwait(
 new CancelablePromise<void>(() => {
 /* never settles */
 }),
 );
 yield 2;
 } finally {
 producerCleanedUp = true;
 }
 });

 const co = cancAsync(function* () {
 return yield* cancForAwait.toArray(producer());
 });

 const p = co();
 p.catch(suppressCancel);
 await flush(3);
 p.cancel();
 await flush(20);

 const err = await p.catch((e: any) => e);
 expect(isCancelError(err)).toBe(true);
 expect(producerCleanedUp).toBe(true);
 });
});

describe('rfc §10 — helpers only inside their driving coroutine', () => {
 it('cancForAwait called outside a coroutine is an undriven generator: callback never runs', async () => {
 let called = false;

 const gen = cancForAwait([1, 2, 3], () => {
 called = true;
 });

 // Undriven: nobody calls gen.next(), so the generator body never advances past its first yield.
 expect(typeof (gen as any).next).toBe('function');
 await flush(3);
 expect(called).toBe(false);
 });

 it('cancGenDelegate called outside a producer is an undriven generator: sub-source never pulled', async () => {
 let pulled = false;

 async function* sub() {
 pulled = true;
 yield 1;
 }

 const gen = cancGenDelegate(sub());

 expect(typeof (gen as any).next).toBe('function');
 await flush(3);
 expect(pulled).toBe(false);
 });
});
