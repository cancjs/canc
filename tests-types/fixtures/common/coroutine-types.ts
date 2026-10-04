/**
 * Typed-yield DX assertion suite for @cancjs/coroutine. Compiled only in
 * the `latest` TS lane of the TS-version matrix (matrix.config.json to version with
 * `typeAssertions:true`), alongside ./type-assertions.ts.
 *
 * Two consumption paths are asserted here:
 *
 * 1. `const x = yield* cancAwait(promise)`. The TYPED path. `cancAwait`
 * returns a `Generator<..., T, T>`, so delegating with `yield*` gives the
 * generator body a value typed as the awaited `T`.
 * 2. bare `yield promise` is the UNTYPED fallback. TypeScript cannot infer the
 * resume type of a plain `yield` expression from the coroutine driver. Under
 * `strict` an unannotated body rejects the yield outright, and an annotated one
 * resolves it as `any` (the limitation the docs/yield-vs-yield-star.md page
 * explains). Runtime handling is identical.
 *
 * Plus the one-shot combinator helpers `cancAwait.all/race/any/allSettled`,
 * which fold a `CancelablePromise` combinator into a single `yield*` step and
 * preserve heterogeneous-tuple inference.
 *
 * Also asserts declared failure channel propagation and annotations for both
 * generator dialects (`cancAsync` / `cancGenAsync`).
 *
 * Same mechanism as ./type-assertions.ts: each `Expect<Equal<...>>` is a hard
 * compile gate, and every area has at least one `@ts-expect-error` negative.
 */
import type { AsyncResult } from '@cancjs/coroutine';
import {
  async as cancAsync,
  await as cancAwait,
  BreakError,
  forAwait as cancForAwait,
  throw as cancThrow,
} from '@cancjs/coroutine';
import type { AsyncGenResult, ICancAsyncGenerator } from '@cancjs/coroutine/gen';
import {
  async as cancGenAsync,
  await as cancGenAwait,
  forAwait as cancGenForAwait,
  throw as cancGenThrow,
} from '@cancjs/coroutine/gen';
import type { FailureOf } from '@cancjs/promise';
import CancelablePromise from '@cancjs/promise';

import type { Equal, Expect, ExpectExtends, IsAny, Not } from './assert-type';

class MatrixFooError extends Error {
  declare readonly _tag: 'MatrixFooError';
  name = 'MatrixFooError';
}
class MatrixBarError extends Error {
  declare readonly _tag: 'MatrixBarError';
  name = 'MatrixBarError';
}
class MatrixBazError extends Error {
  declare readonly _tag: 'MatrixBazError';
  name = 'MatrixBazError';
}

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

// cancAsync now infers its return type from the generator's own return value.
const coResult = co();
type _coResult = Expect<Equal<typeof coResult, CancelablePromise<number, never>>>;
// ...and definitely not silently `any`
type _coNotAny = Expect<Not<IsAny<typeof coResult>>>;

// cancAwait itself is a generator delegate: Generator<T, Awaited<T>, any>.
const gen = cancAwait(Promise.resolve(42));
type _cancAwaitYield = Expect<Equal<ReturnType<(typeof gen)['next']>, IteratorResult<Promise<number>, number>>>;

// @ts-expect-error cancAsync's first arg must be a generator function, not a plain value
cancAsync(123);

// ============================================================ untyped path: bare yield
// A plain `yield promise` cannot carry a resume type through the driver. Under `strict` a body with
// no return-type annotation has no resume type to report at all, so the yield is a compile error
// rather than a value typed `unknown`, and a body that does annotate its return type resolves the
// value as `any`. Either way a bare yield buys no type safety, which is why the typed path above is
// the documented one.
cancAsync(function* () {
  // @ts-expect-error a bare yield has no resume type in a body with no return-type annotation
  const u = yield Promise.resolve(1);
  type _bareYieldIsAny = Expect<IsAny<typeof u>>;
  void u;
  return u;
});

// ============================================================ combinator helpers (tuple inference)
cancAsync(function* () {
  // all(): heterogeneous tuple preserved across the one-shot yield* step.
  const tuple = yield* cancAwait.all([Promise.resolve(1), Promise.resolve('a'), Promise.resolve(true)]);
  type _allTuple = Expect<Equal<typeof tuple, [number, string, boolean]>>;

  // race(): union of the racers' resolved values.
  const raced = yield* cancAwait.race([Promise.resolve(1), Promise.resolve('a')]);
  type _raceUnion = Expect<Equal<typeof raced, number | string>>;

  // any(): union too (first fulfilled).
  const anied = yield* cancAwait.any([Promise.resolve(1), Promise.resolve('a')] as const);
  type _anyUnion = Expect<Equal<typeof anied, number | string>>;

  // allSettled(): tuple of settled results.
  const settled = yield* cancAwait.allSettled([Promise.resolve(1), Promise.resolve('a')] as const);
  type _allSettledTuple = Expect<Equal<typeof settled, [PromiseSettledResult<number>, PromiseSettledResult<string>]>>;

  // try(): the fn's own (awaited) return type, no tuple to reconstruct.
  const tried = yield* cancAwait.try(() => 1);
  type _tryNumber = Expect<Equal<typeof tried, number>>;

  return { tuple, raced, anied, settled, tried };
});

// @ts-expect-error all() requires an iterable, not a bare value
cancAwait.all(123);

// ============================================================ coroutine failure set inference
const cpFoo = CancelablePromise.reject<number, MatrixFooError>(new MatrixFooError('foo'));
const cpBar = CancelablePromise.reject<string, MatrixBarError>(new MatrixBarError('bar'));

const coFailures = cancAsync(function* () {
  const n = yield* cancAwait(cpFoo);
  type _nTyped = Expect<Equal<typeof n, number>>;

  const s = yield* cancAwait(cpBar);
  type _sTyped = Expect<Equal<typeof s, string>>;

  if (n > 0) {
    yield* cancThrow(new MatrixBazError('baz'));
  }

  return n + s.length;
});

const coFailuresResult = coFailures();
type _coFailuresResultType = Expect<
  Equal<typeof coFailuresResult, CancelablePromise<number, MatrixFooError | MatrixBarError | MatrixBazError>>
>;

// ============================================================ combinator helpers failure threading
cancAsync(function* () {
  const allGen = cancAwait.all([cpFoo, cpBar]);
  type _allGenYield = typeof allGen extends Generator<infer Y, any, any> ? Y : never;
  type _allFail = Expect<Equal<FailureOf<_allGenYield>, MatrixFooError | MatrixBarError>>;

  const raceGen = cancAwait.race([cpFoo, cpBar]);
  type _raceGenYield = typeof raceGen extends Generator<infer Y, any, any> ? Y : never;
  type _raceFail = Expect<Equal<FailureOf<_raceGenYield>, MatrixFooError | MatrixBarError>>;

  const anyGen = cancAwait.any([cpFoo, cpBar] as const);
  type _anyGenYield = typeof anyGen extends Generator<infer Y, any, any> ? Y : never;
  type _anyFail = Expect<Equal<FailureOf<_anyGenYield>, AggregateError>>;

  const settledGen = cancAwait.allSettled([cpFoo, cpBar] as const);
  type _settledGenYield = typeof settledGen extends Generator<infer Y, any, any> ? Y : never;
  type _settledFail = Expect<Equal<FailureOf<_settledGenYield>, never>>;

  const tryGen = cancAwait.try(() => cpFoo);
  type _tryGenYield = typeof tryGen extends Generator<infer Y, any, any> ? Y : never;
  type _tryFail = Expect<Equal<FailureOf<_tryGenYield>, never>>;

  return 1;
});

// ============================================================ loop helper BreakError declaration
const coLoop = cancAsync(function* () {
  yield* cancForAwait([1, 2], function* (_item) {});
});
type _coLoopResult = Expect<Equal<ReturnType<typeof coLoop>, CancelablePromise<void, BreakError>>>;

// ============================================================ AsyncResult 2-arg annotation & strict failure checking
const annotatedCo = cancAsync(function* (): AsyncResult<number, MatrixFooError> {
  const n = yield* cancAwait(cpFoo);
  yield 42;
  return n;
});
type _annotatedCoResult = Expect<Equal<ReturnType<typeof annotatedCo>, CancelablePromise<number, MatrixFooError>>>;

cancAsync(function* (): AsyncResult<number, MatrixFooError> {
  // @ts-expect-error BarError is not in declared failure set MatrixFooError
  yield* cancAwait(cpBar);
  return 1;
});

cancAsync(function* (): AsyncResult<number, MatrixFooError> {
  // @ts-expect-error BazError is not in declared failure set MatrixFooError
  yield* cancThrow(new MatrixBazError('baz'));
  return 1;
});

cancAsync(function* (): AsyncResult<number, MatrixFooError> {
  // @ts-expect-error BreakError is not in declared failure set MatrixFooError
  yield* cancForAwait([1, 2], function* (_item) {});
  return 1;
});

// ============================================================ forAwait handle form: element inference, no BreakError
// Called with no callback, cancForAwait returns a loop handle instead of running a callback per
// item. `break`/`continue` are native there, so (unlike the callback form just above) BreakError
// never enters the declared failure set. Covers all three TEachSource shapes: async iterable, sync
// iterable of values, sync iterable of promises.
async function* asyncNumberSource(): AsyncGenerator<number> {
  yield 1;
  yield 2;
}

const forAwaitHandleCo = cancAsync(function* () {
  const asyncLoop = yield* cancForAwait(asyncNumberSource());
  for (const item of asyncLoop) {
    type _asyncItemNumber = Expect<Equal<typeof item, number>>;
    type _asyncItemNotAny = Expect<Not<IsAny<typeof item>>>;
    void item;
    const nextAsyncResult = yield* asyncLoop.next();
    type _nextAsyncResultVoid = Expect<Equal<typeof nextAsyncResult, void>>;
  }

  const valuesLoop = yield* cancForAwait(['a', 'b']);
  for (const item of valuesLoop) {
    type _valuesItemString = Expect<Equal<typeof item, string>>;
    type _valuesItemNotAny = Expect<Not<IsAny<typeof item>>>;
    void item;
    const nextValuesResult = yield* valuesLoop.next();
    type _nextValuesResultVoid = Expect<Equal<typeof nextValuesResult, void>>;
  }

  const promisesLoop = yield* cancForAwait([Promise.resolve(true), Promise.resolve(false)]);
  for (const item of promisesLoop) {
    type _promisesItemBoolean = Expect<Equal<typeof item, boolean>>;
    type _promisesItemNotAny = Expect<Not<IsAny<typeof item>>>;
    void item;
    const nextPromisesResult = yield* promisesLoop.next();
    type _nextPromisesResultVoid = Expect<Equal<typeof nextPromisesResult, void>>;
  }

  return 'done';
});
type _forAwaitHandleResult = Expect<Equal<ReturnType<typeof forAwaitHandleCo>, CancelablePromise<string, never>>>;

// ============================================================ forAwait sugar form: cancForAwait.next(), no BreakError
const forAwaitSugarCo = cancAsync(function* () {
  const asyncLoop = yield* cancForAwait(asyncNumberSource());
  for (const item of asyncLoop) {
    type _asyncSugarItemNumber = Expect<Equal<typeof item, number>>;
    type _asyncSugarItemNotAny = Expect<Not<IsAny<typeof item>>>;
    void item;
    const nextSugarResult = yield* cancForAwait.next();
    type _nextSugarResultVoid = Expect<Equal<typeof nextSugarResult, void>>;
  }

  const valuesLoop = yield* cancForAwait(['a', 'b']);
  for (const item of valuesLoop) {
    type _valuesSugarItemString = Expect<Equal<typeof item, string>>;
    type _valuesSugarItemNotAny = Expect<Not<IsAny<typeof item>>>;
    void item;
    const nextSugarValuesResult = yield* cancForAwait.next();
    type _nextSugarValuesResultVoid = Expect<Equal<typeof nextSugarValuesResult, void>>;
  }

  const promisesLoop = yield* cancForAwait([Promise.resolve(true), Promise.resolve(false)]);
  for (const item of promisesLoop) {
    type _promisesSugarItemBoolean = Expect<Equal<typeof item, boolean>>;
    type _promisesSugarItemNotAny = Expect<Not<IsAny<typeof item>>>;
    void item;
    const nextSugarPromisesResult = yield* cancForAwait.next();
    type _nextSugarPromisesResultVoid = Expect<Equal<typeof nextSugarPromisesResult, void>>;
  }

  return 'done';
});
type _forAwaitSugarResult = Expect<Equal<ReturnType<typeof forAwaitSugarCo>, CancelablePromise<string, never>>>;

// cancForAwait.next() returns Generator<unknown, void, any>
const sugarNextGen = cancForAwait.next();
type _sugarNextGenYield = typeof sugarNextGen extends Generator<infer Y, infer R, any> ? [Y, R] : never;
type _sugarNextGenCheck = Expect<Equal<_sugarNextGenYield, [unknown, void]>>;

// ============================================================ cancGenAsync: typed internal await (no cast tax)
// Annotated: AsyncGenResult pins the emit (E) and return (R) types explicitly.
const producerAnnotated = cancGenAsync(function* (): AsyncGenResult<number, void> {
  const decoded = yield* cancGenAwait(Promise.resolve(1));
  type _decodedNumber = Expect<Equal<typeof decoded, number>>;
  yield 42;
});
type _producerAnnotatedEmit = Expect<
  Equal<ReturnType<typeof producerAnnotated> extends AsyncGenerator<infer E, any> ? E : never, number>
>;

// Inferred: no AsyncGenResult annotation, emit + return still resolve without a cast.
const producerInferred = cancGenAsync(function* () {
  const decoded = yield* cancGenAwait(Promise.resolve(1));
  type _decodedInferredNumber = Expect<Equal<typeof decoded, number>>;
  const emitted: number = decoded * 2;
  yield emitted;
  return 'done';
});

async function consumeInferred() {
  for await (const percent of producerInferred()) {
    type _percentNumber = Expect<Equal<typeof percent, number>>;
    void percent;
  }
}
void consumeInferred;

// ============================================================ cancGenAwait: combinator parity (all/race/any/allSettled/try)
const producerWithCombinators = cancGenAsync(function* () {
  const [n, s] = yield* cancGenAwait.all([Promise.resolve(1), Promise.resolve('a')]);
  type _genAllTuple = Expect<Equal<[typeof n, typeof s], [number, string]>>;

  const raced = yield* cancGenAwait.race([Promise.resolve(1), Promise.resolve('a')]);
  type _genRaceUnion = Expect<Equal<typeof raced, number | string>>;

  const anied = yield* cancGenAwait.any([Promise.resolve(1), Promise.resolve('a')] as const);
  type _genAnyUnion = Expect<Equal<typeof anied, number | string>>;

  const settled = yield* cancGenAwait.allSettled([Promise.resolve(1), Promise.resolve('a')] as const);
  type _genAllSettledTuple = Expect<
    Equal<typeof settled, [PromiseSettledResult<number>, PromiseSettledResult<string>]>
  >;

  const tried = yield* cancGenAwait.try(() => 2);
  type _genTryNumber = Expect<Equal<typeof tried, number>>;

  // Only bare `yield`s are emitted to the consumer, every combinator step above is an internal
  // await (wrapped in the `awaited(...)` marker), never part of the emit type.
  yield `n=${n} s=${s} raced=${raced} anied=${anied} tried=${tried}`;

  return settled;
});
type _producerWithCombinatorsEmit = Expect<
  Equal<ReturnType<typeof producerWithCombinators> extends AsyncGenerator<infer E, any> ? E : never, string>
>;

async function consumeCombinators() {
  for await (const line of producerWithCombinators()) {
    // Consumer sees only the bare-yield string emit, never a combinator's tuple/union result.
    type _lineString = Expect<Equal<typeof line, string>>;
    void line;
  }
}
void consumeCombinators;

// ============================================================ cancGenAsync failure set & AsyncGenResult
const genFailures = cancGenAsync(function* () {
  const n = yield* cancGenAwait(cpFoo);
  type _genNTyped = Expect<Equal<typeof n, number>>;

  if (n > 0) {
    yield* cancGenThrow(new MatrixBazError('baz'));
  }

  yield n;
  return 'done';
});

type _genFailuresReturn = ReturnType<typeof genFailures>;
type _genFailuresFail = Expect<Equal<FailureOf<_genFailuresReturn>, MatrixFooError | MatrixBazError>>;

const annotatedGen = cancGenAsync(function* (): AsyncGenResult<number, string, MatrixFooError> {
  const n = yield* cancGenAwait(cpFoo);
  yield n;
  return 'done';
});
type _annotatedGenType = Expect<
  Equal<ReturnType<typeof annotatedGen>, ICancAsyncGenerator<number, string, any, MatrixFooError>>
>;
type _annotatedGenCovariant = Expect<
  ExpectExtends<ReturnType<typeof annotatedGen>, AsyncGenerator<number, string, any>>
>;

cancGenAsync(function* (): AsyncGenResult<number, string, MatrixFooError> {
  // @ts-expect-error BarError is not in declared failure set MatrixFooError
  yield* cancGenAwait(cpBar);
  return 'done';
});

cancGenAsync(function* (): AsyncGenResult<number, string, MatrixFooError> {
  // @ts-expect-error BazError is not in declared failure set MatrixFooError
  yield* cancGenThrow(new MatrixBazError('baz'));
  return 'done';
});

cancGenAsync(function* (): AsyncGenResult<number, string, MatrixFooError> {
  // @ts-expect-error BreakError is not in declared failure set MatrixFooError
  yield* cancGenForAwait([1, 2], function* (_item) {});
  return 'done';
});

// cancAsync return type is inferred without an AsyncResult annotation: the generator's own
// return value now flows through to the coroutine's return type, same as its `yield*` delegate values.
declare function fetchUser(id: string): CancelablePromise<{ id: string }, MatrixFooError>;
const loadCo = function* (id: string) {
  const user = yield* cancAwait(fetchUser(id));
  type _userType = Expect<Equal<typeof user, { id: string }>>;
  return user;
};
const load = cancAsync(loadCo);
type _loadRet = ReturnType<typeof load>;
type _loadResult = Expect<Equal<_loadRet, CancelablePromise<{ id: string }, MatrixFooError>>>;

export {};
