/**
 * Typed-yield DX assertion suite for @cancjs/coroutine (P5-4). Compiled only in
 * the `latest` TS lane of the P4-2 matrix (matrix.config.json → version with
 * `typeAssertions:true`), alongside ./type-assertions.ts.
 *
 * Two consumption paths are asserted here:
 *
 * 1. `const x = yield* cancAwait(promise)` — the TYPED path. `cancAwait`
 * returns a `Generator<..., T, T>`, so delegating with `yield*` gives the
 * generator body a value typed as the awaited `T`.
 * 2. bare `yield promise` — the UNTYPED fallback. TypeScript cannot infer the
 * resume type of a plain `yield` expression from the coroutine driver, so
 * the value comes back `unknown` (this is the permanent limitation the
 * docs/yield-vs-yield-star.md page explains). Runtime handling is identical.
 *
 * Plus the one-shot combinator helpers `cancAwait.all/race/any/allSettled`,
 * which fold a `CancelablePromise` combinator into a single `yield*` step and
 * preserve heterogeneous-tuple inference.
 *
 * Same mechanism as ./type-assertions.ts: each `Expect<Equal<...>>` is a hard
 * compile gate, and every area has at least one `@ts-expect-error` negative.
 */
import CancelablePromise from '@cancjs/promise';
import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';
import type { Equal, Expect, IsAny, Not } from './assert-type';

// ============================================================ typed path: yield*
const co = cancAsync(function* () {
 const n = yield* cancAwait(Promise.resolve(1));
 type _yieldTypedNumber = Expect<Equal<typeof n, number>>;

 const s = yield* cancAwait('literal');
 type _yieldTypedString = Expect<Equal<typeof s, string>>;

 // PromiseLike unwraps to its resolved value, not the wrapper.
 const b = yield* cancAwait(CancelablePromise.resolve(true));
 type _yieldTypedBool = Expect<Equal<typeof b, boolean>>;

 return n + s.length;
});

// current contract: cancAsync return is CancelablePromise<unknown>
const coResult = co();
type _coResult = Expect<Equal<typeof coResult, CancelablePromise<unknown>>>;
// ...and definitely not silently `any`
type _coNotAny = Expect<Not<IsAny<typeof coResult>>>;

// cancAwait itself is a generator delegate: Generator<value|promise, T, T>.
const gen = cancAwait(Promise.resolve(42));
type _cancAwaitYield = Expect<Equal<
 ReturnType<(typeof gen)['next']>,
 IteratorResult<number | Promise<number>, number>
>>;

// @ts-expect-error cancAsync's first arg must be a generator function, not a plain value
cancAsync(123);

// ============================================================ untyped path: bare yield
// A plain `yield promise` cannot carry a resume type through the driver: the
// generator's TNext is `unknown` unless annotated, so the value is `unknown`.
cancAsync(function* () {
 const u = yield Promise.resolve(1);
 type _bareYieldUnknown = Expect<Equal<typeof u, unknown>>;
 // @ts-expect-error `unknown` is not directly assignable to a concrete type
 const _n: number = u;
 void _n;
 return u;
});

// ============================================================ combinator helpers (tuple inference)
cancAsync(function* () {
 // all() — heterogeneous tuple preserved across the one-shot yield* step.
 const tuple = yield* cancAwait.all([Promise.resolve(1), Promise.resolve('a'), Promise.resolve(true)]);
 type _allTuple = Expect<Equal<typeof tuple, [number, string, boolean]>>;

 // race() — union of the racers' resolved values.
 const raced = yield* cancAwait.race([Promise.resolve(1), Promise.resolve('a')]);
 type _raceUnion = Expect<Equal<typeof raced, number | string>>;

 // any() — union too (first fulfilled).
 const anied = yield* cancAwait.any([Promise.resolve(1), Promise.resolve('a')] as const);
 type _anyUnion = Expect<Equal<typeof anied, number | string>>;

 // allSettled() — tuple of settled results.
 const settled = yield* cancAwait.allSettled([Promise.resolve(1), Promise.resolve('a')] as const);
 type _allSettledTuple = Expect<Equal<
 typeof settled,
 [PromiseSettledResult<number>, PromiseSettledResult<string>]
 >>;

 return { tuple, raced, anied, settled };
});

// @ts-expect-error all() requires an iterable, not a bare value
cancAwait.all(123);

export {};
