import { AsyncResult, cancAsync, cancAwait } from './coroutine';
import { CancelablePromise } from '@cancjs/promise';

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
