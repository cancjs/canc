import { createErrorClass } from '../../../packages/_util/errors';
import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { CancelablePromise } from './cancelable-promise';
import {
  _createCatchError as createCatchError,
  _createSuppressError as createSuppressError,
  catchErrors,
  isErrorOf,
  suppressErrors,
} from './error-matchers';

const FOO_BRAND = Symbol.for('@cancjs/promise:FooError');
const FooError = createErrorClass('FooError', FOO_BRAND);
type FooError = InstanceType<typeof FooError>;

const BAR_BRAND = Symbol.for('@cancjs/promise:BarError');
const BarError = createErrorClass('BarError', BAR_BRAND);
type BarError = InstanceType<typeof BarError>;

const RETRY_BRAND = Symbol.for('@cancjs/promise:RetryError');
const _RetryError = createErrorClass('RetryError', RETRY_BRAND);
type _RetryError = InstanceType<typeof _RetryError>;

const pBoth: CancelablePromise<number, FooError | BarError> = CancelablePromise.resolve(1) as any;

describe('inline matchers', () => {
  it('catchErrors behavioral', async () => {
    const fooErr = new FooError();
    const barErr = new BarError();

    await expect(catchErrors(CancelablePromise.reject(fooErr), FooError)).resolves.toBe(fooErr);
    await expect(catchErrors(CancelablePromise.reject(barErr), FooError)).rejects.toBe(barErr);

    // a native Promise input works
    await expect(catchErrors(Promise.reject(fooErr), FooError)).resolves.toBe(fooErr);
  });

  it('suppressErrors behavioral', async () => {
    const fooErr = new FooError();
    const barErr = new BarError();

    await expect(suppressErrors(CancelablePromise.reject(fooErr), FooError)).resolves.toBeUndefined();

    // raw form: suppressErrors(new BarError(), FooError) THROWS the BarError; suppressErrors(new FooError(), FooError) returns
    expect(() => suppressErrors(barErr, FooError)).toThrow(barErr);
    expect(suppressErrors(fooErr, FooError)).toBeUndefined();
  });

  it('catchErrors type spec', () => {
    // catchErrors(pBoth, FooError) is CancelablePromise<T | FooError, BarError>
    const _r1 = catchErrors(pBoth, FooError);
    const c1: Eq<typeof _r1, CancelablePromise<number | FooError, BarError>> = true;

    // a plain-predicate matcher subtracts nothing
    const looksBad = (_e: any): boolean => true;
    const _r2 = catchErrors(pBoth, looksBad);
    const c2: Eq<typeof _r2, CancelablePromise<number | Error, FooError | BarError>> = true;

    try {
      throw new FooError();
    } catch (err) {
      suppressErrors(err, FooError, BarError);
      // inside catch (err) { suppressErrors(err, FooError, BarError); ... } the binding narrows to FooError | BarError with NO TS2775
      const c3: Eq<typeof err, FooError | BarError> = true;
      void c3;
    }

    void [c1, c2];
  });

  it('factories type spec', () => {
    const _r1 = createCatchError(FooError)(pBoth);
    const c1: Eq<typeof _r1, CancelablePromise<number | FooError, BarError>> = true;

    // three chained products narrow TFailure to never
    const chain1 = createCatchError(FooError);
    const chain2 = createCatchError(BarError);
    const _pNext = chain2(chain1(pBoth));
    const c2: Eq<typeof _pNext, CancelablePromise<number | FooError | BarError, never>> = true;

    // createSuppressError('RetryError')(pBoth) leaves TFailure unchanged when no declared class has a literal name
    const _r3 = createSuppressError('RetryError')(pBoth);
    const c3: Eq<typeof _r3, CancelablePromise<number | void, FooError | BarError>> = true;

    const err: unknown = new FooError();
    if (isErrorOf(err, FooError, BarError)) {
      const c4: Eq<typeof err, FooError | BarError> = true;
      void c4;
    }

    void [c1, c2, c3];
  });
});
