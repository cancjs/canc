import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';
import { createCatchError, createSuppressError } from './error-matchers';
import {
  _AbortError as AbortError,
  _isAbortError as isAbortError,
  _isTimeoutError as isTimeoutError,
  _TimeoutError as TimeoutError,
} from './helpers';

function named(name: string): Error {
  return Object.assign(new Error('x'), { name });
}

// A second copy of @cancjs/promise produces CancelErrors that fail `instanceof` here but carry the
// same registry brand. Built by hand on purpose: using the real class would not prove anything.
function foreignCopyCancelError(): object {
  const error = Object.create(null) as Record<PropertyKey, unknown>;
  error[Symbol.for('@cancjs/promise:CancelError')] = true;
  return error;
}

describe('createSuppressError', () => {
  it('rejects an empty matcher list', () => {
    expect(() => createSuppressError()).toThrow(TypeError);
    expect(() => createSuppressError()).toThrow(/createSuppressError/);
  });

  describe('constructor matcher', () => {
    const suppress = createSuppressError(CancelError);

    it('swallows a matching error and rethrows anything else', () => {
      expect(suppress(new CancelError())).toBeUndefined();
      expect(() => suppress(new TypeError('nope'))).toThrow(TypeError);
    });

    it('swallows a matching rejection and keeps a foreign one rejecting', async () => {
      await expect(suppress(CancelablePromise.reject(new CancelError()))).resolves.toBeUndefined();
      await expect(suppress(CancelablePromise.reject(new TypeError('nope')))).rejects.toThrow(TypeError);
    });

    it('matches an error from another copy of the class by its brand alone', () => {
      const foreign = foreignCopyCancelError();

      expect(foreign instanceof CancelError).toBe(false);
      expect(suppress(foreign)).toBeUndefined();
    });
  });

  it('uses a predicate matcher as the predicate', () => {
    const suppress = createSuppressError(isAbortError);

    expect(suppress(new AbortError())).toBeUndefined();
    expect(() => suppress(new TypeError('nope'))).toThrow(TypeError);
  });

  it('matches a string matcher against the error name', () => {
    const suppress = createSuppressError('RetryError');

    expect(suppress(named('RetryError'))).toBeUndefined();
    expect(() => suppress(named('OtherError'))).toThrow(Error);
  });

  // A function declaration has a `prototype`, unlike an arrow, so it is the case that could be
  // mistaken for an error constructor. It is neither Error-ish nor branded, so it must not be.
  it('treats a function-declaration predicate as a predicate, not a constructor', () => {
    function isRetryError(error: any): boolean {
      return !!error && error.name === 'RetryError';
    }

    const suppress = createSuppressError(isRetryError);

    expect(suppress(named('RetryError'))).toBeUndefined();
    // Would be swallowed if the matcher had been compiled as a constructor matching on its own name.
    expect(() => suppress(named('isRetryError'))).toThrow(Error);
  });

  describe('mixed matcher list', () => {
    const suppress = createSuppressError(CancelError, isAbortError, isTimeoutError, 'RetryError');

    it('swallows every listed kind', () => {
      expect(suppress(new CancelError())).toBeUndefined();
      expect(suppress(new AbortError())).toBeUndefined();
      expect(suppress(new TimeoutError())).toBeUndefined();
      expect(suppress(named('RetryError'))).toBeUndefined();
    });

    it('rethrows an unlisted error', () => {
      expect(() => suppress(new Error('nope'))).toThrow('nope');
    });
  });

  it('ignores abort and timeout options when flagsEnabled is false', () => {
    const suppress = createSuppressError('RetryError');

    expect(() => suppress(new AbortError())).toThrow();
    expect(() => suppress(new AbortError(), { abort: true })).toThrow(AbortError);
    expect(() => suppress(new TimeoutError())).toThrow();
    expect(() => suppress(new TimeoutError(), { timeout: true })).toThrow(TimeoutError);
  });

  it('compiles the matchers once, not on every call', () => {
    const spy = jest.spyOn(Object, 'getOwnPropertySymbols');
    const scans = () => spy.mock.calls.filter((call) => call[0] === CancelError.prototype).length;

    try {
      const suppress = createSuppressError(CancelError);
      const afterCreate = scans();

      for (let index = 0; index < 100; index++) {
        suppress(new CancelError());
      }

      expect(afterCreate).toBe(1);
      expect(scans()).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('createCatchError', () => {
  it('rejects an empty matcher list', () => {
    expect(() => createCatchError()).toThrow(TypeError);
    expect(() => createCatchError()).toThrow(/createCatchError/);
  });

  it('returns the matched error instead of undefined', () => {
    const catchError = createCatchError(CancelError, 'RetryError');
    const cancelError = new CancelError();
    const retryError = named('RetryError');

    expect(catchError(cancelError)).toBe(cancelError);
    expect(catchError(retryError)).toBe(retryError);
    expect(() => catchError(new TypeError('nope'))).toThrow(TypeError);
  });

  it('resolves a matched rejection with the error', async () => {
    const catchError = createCatchError(isAbortError);
    const abortError = new AbortError();

    await expect(catchError(CancelablePromise.reject(abortError))).resolves.toBe(abortError);
    await expect(catchError(CancelablePromise.reject(new TypeError('nope')))).rejects.toThrow(TypeError);
  });
});
