import { CancelablePromise, FailureOf } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { AsyncResult, BreakError, cancAsync, cancAwait, cancForAwait, cancThrow } from './coroutine';
import { AsyncGenResult, cancGenAsync, cancGenAwait, cancGenThrow } from './coroutine-gen';

class FooError extends Error {
  readonly __foo = true;
}
class BarError extends Error {
  readonly __bar = true;
}
class BazError extends Error {
  readonly __baz = true;
}

declare const pFoo: CancelablePromise<number, FooError>;
declare const pBar: CancelablePromise<string, BarError>;
declare const plain: Promise<boolean>;

// 1. inference from an UNANNOTATED body
const fn1 = cancAsync(function* () {
  const n = yield* cancAwait(pFoo);
  const s = yield* cancAwait(pBar);
  const b = yield* cancAwait(plain);
  const cn: Eq<typeof n, number> = true;
  const cs: Eq<typeof s, string> = true;
  const cb: Eq<typeof b, boolean> = true;
  void [cn, cs, cb];
  if (n > 1) {
    yield* cancThrow(new BazError());
  }
  return n + s.length + (b ? 1 : 0);
});
const c1: Eq<ReturnType<typeof fn1>, CancelablePromise<number, FooError | BarError | BazError>> = true;

// 2. bare yield requires return-type annotation under strict mode
const fn2Negative = cancAsync(function* () {
  // @ts-expect-error TS7057
  const raw = yield 42;
  const n = yield* cancAwait(pFoo);
  return n + (raw as number);
});

const fn2 = cancAsync(function* (): AsyncResult<number, FooError> {
  const raw = yield 42;
  const n = yield* cancAwait(pFoo);
  return n + (raw as number);
});
const c2: Eq<ReturnType<typeof fn2>, CancelablePromise<number, FooError>> = true;

// 3. yield* cancThrow(...) return type is never
// @ts-expect-error TS2355
function* deadCode(): Generator<any, number, any> {
  yield* cancThrow(new FooError());
}
function* deadCode2(): Generator<any, number, any> {
  return yield* cancThrow(new FooError());
}
function* deadCode3(): Generator<any, number, any> {
  yield* cancThrow(new FooError());
  const after = 1;
  return after;
}

// 7. outer annotation as the check
const fn7: () => CancelablePromise<number, FooError | BazError> = cancAsync(function* () {
  const n = yield* cancAwait(pFoo);
  yield* cancThrow(new BazError());
  return n;
});

// 8. plain native promise only
const fn8 = cancAsync(function* () {
  const b = yield* cancAwait(plain);
  return b;
});
const c8: Eq<ReturnType<typeof fn8>, CancelablePromise<boolean, never>> = true;

// 9. union of promise types
declare const pUnion: CancelablePromise<number, FooError> | CancelablePromise<number, BarError>;
const fn9 = cancAsync(function* () {
  const n = yield* cancAwait(pUnion);
  return n;
});
const c9: Eq<ReturnType<typeof fn9>, CancelablePromise<number, FooError | BarError>> = true;

// AsyncResult strict body

// 1. strict body + bare yield of primitives
const s1 = cancAsync(function* (): AsyncResult<number, FooError> {
  const raw = yield 42;
  const str = yield 'hello';
  const n = yield* cancAwait(pFoo);
  return n + (raw as number) + (str as string).length;
});
const c_s1: Eq<ReturnType<typeof s1>, CancelablePromise<number, FooError>> = true;

type _F1 = Eq<FailureOf<undefined>, never>;
type _F2 = Eq<FailureOf<void>, never>;
type _F3 = Eq<FailureOf<null>, never>;
const cf: [_F1, _F2, _F3] = [true, true, true];

// 2. strict body still catches an undeclared failure
const s2 = cancAsync(function* (): AsyncResult<number, FooError> {
  // @ts-expect-error TS2322
  const s = yield* cancAwait(pBar);
  return s.length;
});

// 3. bare yield of a PROMISE carrying an undeclared failure
const s3 = cancAsync(function* (): AsyncResult<number, FooError> {
  // @ts-expect-error TS2322
  const v = yield pBar;
  return (v as string).length;
});

// 4. bare yield of a plain object
const s4 = cancAsync(function* (): AsyncResult<number, FooError> {
  // @ts-expect-error TS2559
  const v = yield { a: 1 };
  return (v as number) + 1;
});

// 5. loop helper still forces BreakError to be declared
const s5 = cancAsync(function* (): AsyncResult<number, FooError> {
  // @ts-expect-error TS2322
  yield* cancForAwait([1, 2], () => {});
  return 1;
});
const s5ok = cancAsync(function* (): AsyncResult<number, FooError | BreakError> {
  yield* cancForAwait([1, 2], () => {});
  return 1;
});

// 6. 1-arg back-compat unchanged
const s6 = cancAsync(function* (): AsyncResult<number> {
  const raw = yield 42;
  const o = yield { a: 1 };
  const n = yield* cancAwait(pFoo);
  return n + (raw as number) + (o ? 0 : 1);
});
const c6: Eq<ReturnType<typeof s6>, CancelablePromise<number, never>> = true;

// AsyncGenResult flavor

// 7. gen flavor, unannotated: emits infer, failures accumulate
const g7 = cancGenAsync(function* () {
  const n = yield* cancGenAwait(pFoo);
  yield n;
  yield 'progress';
  yield* cancGenThrow(new BarError());
});
const c7: Eq<FailureOf<ReturnType<typeof g7>>, FooError | BarError> = true;

// 8. gen flavor, annotated with all three params
const g8 = cancGenAsync(function* (): AsyncGenResult<number, void, FooError> {
  const n = yield* cancGenAwait(pFoo);
  yield n;
  // @ts-expect-error TS2322
  yield* cancGenAwait(pBar);
});

// 9. gen flavor, annotated, emit type enforced
const g9 = cancGenAsync(function* (): AsyncGenResult<number, void, FooError> {
  // @ts-expect-error TS2322
  yield 'not a number';
});

// 10. gen flavor, 2-arg back-compat (no failure param)
const g10 = cancGenAsync(function* (): AsyncGenResult<number, void> {
  const n = yield* cancGenAwait(pFoo);
  yield n;
  yield 42;
});

void [
  c1,
  c2,
  fn2Negative,
  deadCode,
  deadCode2,
  deadCode3,
  fn7,
  c8,
  c9,
  c_s1,
  cf,
  s2,
  s3,
  s4,
  s5,
  s5ok,
  c6,
  c7,
  g8,
  g9,
  g10,
  fn1,
  fn2,
  fn8,
  fn9,
  s1,
  s6,
  g7,
];

describe('failure types', () => {
  it('typechecks (see module-level type assertions)', () => {
    expect(c1).toBe(true);
    expect(c2).toBe(true);
  });
});
