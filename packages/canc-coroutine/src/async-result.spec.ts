import { CancelablePromise, Failing, FailureOf } from '@cancjs/promise';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { AsyncResult, BreakError, cancAsync, cancAwait, cancForAwait, ICancForAwaitLoop } from './coroutine';

// Type-level only: no runtime assertions needed, ts-jest typechecks this file on every run,
// so a signature regression fails the test the same way a broken assertion would.

// AsyncResult<T> mutually assignable with Generator<unknown, T, any>.
type TCheckA = AsyncResult<number> extends Generator<unknown, number, any> ? true : false;
type TCheckB = Generator<unknown, number, any> extends AsyncResult<number> ? true : false;
const checkA: TCheckA = true;
const checkB: TCheckB = true;

// yield* path through cancAwait typechecks inside an AsyncResult-annotated body.
function* g(): AsyncResult<number> {
  const x: number = yield* cancAwait(Promise.resolve(1));
  return x;
}

// cancAsync inference sanity: a generator function typed via AsyncResult<T> is accepted by
// cancAsync and the coroutine it returns is a CancelablePromise-returning function (the actual
// element type of that CancelablePromise is a separate, pre-existing cancAsync inference gap,
// not something AsyncResult changes here).
const coroutine = cancAsync(function* (): AsyncResult<string> {
  return 's';
});
type TCheckReturn = ReturnType<typeof coroutine> extends CancelablePromise<unknown> ? true : false;
const checkReturn: TCheckReturn = true;

describe('AsyncResult type', () => {
  it('typechecks (see module-level type assertions above)', () => {
    expect(checkA).toBe(true);
    expect(checkB).toBe(true);
    expect(checkReturn).toBe(true);
    expect(typeof g).toBe('function');
    expect(typeof coroutine).toBe('function');
  });
});

class FooError extends Error {
  readonly tagFoo = 'foo';
}
class BarError extends Error {
  readonly tagBar = 'bar';
}

function* _cancAwaitCheck() {
  const cpFoo = null as unknown as CancelablePromise<number, FooError>;
  const plainPromise = null as unknown as Promise<string>;

  const _n = yield* cancAwait(cpFoo);
  const checkN: Eq<typeof _n, number> = true;

  const _s = yield* cancAwait(plainPromise);
  const checkS: Eq<typeof _s, string> = true;

  const _seven = yield* cancAwait(7);
  const checkSeven: Eq<typeof _seven, number> = true;

  const _union = yield* cancAwait(cpFoo as CancelablePromise<number, FooError> | CancelablePromise<number, BarError>);
  const checkUnion: Eq<typeof _union, number> = true;

  return [checkN, checkS, checkSeven, checkUnion];
}

type TYieldCheck = ReturnType<typeof _cancAwaitCheck> extends Generator<infer Y, any, any> ? Y : never;
const _yieldCheck: Eq<
  Extract<TYieldCheck, CancelablePromise<number, FooError>>,
  CancelablePromise<number, FooError>
> = true;

const forAwaitInferFn = cancAsync(function* () {
  yield* cancForAwait([1, 2], () => {});
  return 42;
});
type TForAwaitFailure = FailureOf<ReturnType<typeof forAwaitInferFn>>;
const checkForAwaitInfer: Eq<TForAwaitFailure, BreakError> = true;

const forAwaitToArrayInferFn = cancAsync(function* () {
  const arr = yield* cancForAwait.toArray([1, 2]);
  return arr;
});
type TForAwaitToArrayFailure = FailureOf<ReturnType<typeof forAwaitToArrayInferFn>>;
const checkForAwaitToArrayInfer: Eq<TForAwaitToArrayFailure, BreakError> = true;

// Handle form: `break` is native, so unlike checkForAwaitInfer above no BreakError enters the set.
const forAwaitHandleInferFn = cancAsync(function* () {
  const loop = yield* cancForAwait([1, 2]);
  for (const item of loop) {
    void item;
    break;
  }
  yield* loop.return();
  return 42;
});
type TForAwaitHandleFailure = FailureOf<ReturnType<typeof forAwaitHandleInferFn>>;
const checkForAwaitHandleInfer: Eq<TForAwaitHandleFailure, never> = true;

// Sugar form: argument-free advance, `break` is native, so no BreakError enters the set
const forAwaitSugarInferFn = cancAsync(function* () {
  const loop = yield* cancForAwait([1, 2]);
  for (const item of loop) {
    void item;
    yield* cancForAwait.next();
    break;
  }
  return 42;
});
type TForAwaitSugarFailure = FailureOf<ReturnType<typeof forAwaitSugarInferFn>>;
const checkForAwaitSugarInfer: Eq<TForAwaitSugarFailure, never> = true;

function* forAwaitSugarAnnotated(): AsyncResult<number> {
  const loop = yield* cancForAwait([1, 2]);
  for (const item of loop) {
    void item;
    yield* cancForAwait.next();
  }
  return 42;
}

function* forAwaitSugarAnnotatedFailureSet(loop: ICancForAwaitLoop<number>): AsyncResult<number, FooError> {
  for (const item of loop) {
    void item;
    // Advance yields unknown, which narrowed failure set rejects, so body uses stored handle
    // @ts-expect-error TS2322
    yield* cancForAwait.next();
  }
  return 42;
}

function* forAwaitMismatchedAnnotation(): Generator<Failing<FooError>, number, any> {
  // @ts-expect-error TS2322
  yield* cancForAwait([1, 2], () => {});
  return 42;
}

function* forAwaitMatchedAnnotation(): Generator<Failing<FooError | BreakError>, number, any> {
  yield* cancForAwait([1, 2], () => {});
  return 42;
}

// Keep functions referenced so eslint does not flag unused functions
void _cancAwaitCheck;
void _yieldCheck;
void forAwaitInferFn;
void forAwaitToArrayInferFn;
void forAwaitHandleInferFn;
void forAwaitSugarInferFn;
void forAwaitSugarAnnotated;
void forAwaitSugarAnnotatedFailureSet;
void forAwaitMismatchedAnnotation;
void forAwaitMatchedAnnotation;
void checkForAwaitInfer;
void checkForAwaitToArrayInfer;
void checkForAwaitHandleInfer;
void checkForAwaitSugarInfer;
