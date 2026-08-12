import { CancelablePromise } from '@cancjs/promise';

import { AsyncResult, cancAsync, cancAwait } from './coroutine';

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

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

class FooError extends Error {
  readonly tagFoo = 'foo';
}
class BarError extends Error {
  readonly tagBar = 'bar';
}

function* cancAwaitCheck() {
  const cpFoo = null as unknown as CancelablePromise<number, FooError>;
  const plainPromise = null as unknown as Promise<string>;

  const n = yield* cancAwait(cpFoo);
  const checkN: Eq<typeof n, number> = true;

  const s = yield* cancAwait(plainPromise);
  const checkS: Eq<typeof s, string> = true;

  const seven = yield* cancAwait(7);
  const checkSeven: Eq<typeof seven, number> = true;

  const union = yield* cancAwait(cpFoo as CancelablePromise<number, FooError> | CancelablePromise<number, BarError>);
  const checkUnion: Eq<typeof union, number> = true;

  return [checkN, checkS, checkSeven, checkUnion];
}

type TYieldCheck = ReturnType<typeof cancAwaitCheck> extends Generator<infer Y, any, any> ? Y : never;
const yieldCheck: Eq<
  Extract<TYieldCheck, CancelablePromise<number, FooError>>,
  CancelablePromise<number, FooError>
> = true;
