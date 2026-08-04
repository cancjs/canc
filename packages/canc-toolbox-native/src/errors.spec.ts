import {
  AbortError,
  catchAbort,
  catchTimeout,
  createCatchError,
  createSuppressError,
  isAbortError,
  isTimeoutError,
  suppressAbort,
  suppressTimeout,
  TimeoutError,
} from './index';

const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

function cancelErrorLike(options?: { cause?: unknown }): Error {
  const error = new Error('canceled');
  Object.defineProperty(error, CANCEL_ERROR_BRAND, { value: true });
  if (options && 'cause' in options) {
    (error as any).cause = options.cause;
  }
  return error;
}

function abortReason(): Error {
  const controller = new AbortController();
  controller.abort();
  return controller.signal.reason as Error;
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const p7 = Promise.resolve(7);
const res7 = suppressAbort(p7);
type _typeCheckSuppressAbort = Expect<Equal<typeof res7, Promise<number | void>>>;
void res7;

describe('errors & catch/suppress pairs (native)', () => {
  describe('suppressAbort', () => {
    it('rethrows an ordinary CancelError-shaped rejection', async () => {
      const cancelErr = cancelErrorLike();
      await expect(suppressAbort(Promise.reject(cancelErr))).rejects.toBe(cancelErr);
    });

    it('swallows a bare AbortError', async () => {
      await expect(suppressAbort(Promise.reject(abortReason()))).resolves.toBeUndefined();
      await expect(suppressAbort(Promise.reject(new AbortError()))).resolves.toBeUndefined();
    });

    it('swallows a CancelError-shaped rejection with AbortError cause', async () => {
      const cause = abortReason();
      const cancelErr = cancelErrorLike({ cause });
      await expect(suppressAbort(Promise.reject(cancelErr))).resolves.toBeUndefined();
    });

    it('works as a raw error handler in .catch(suppressAbort)', async () => {
      await expect(Promise.reject(new AbortError()).catch(suppressAbort)).resolves.toBeUndefined();
    });

    it('rethrows an unrelated error', async () => {
      const boom = new Error('boom');
      await expect(suppressAbort(Promise.reject(boom))).rejects.toBe(boom);
    });
  });

  describe('catchAbort', () => {
    it('returns a raw AbortError', () => {
      const err = new AbortError();
      expect(catchAbort(err)).toBe(err);
    });

    it('throws an unrelated error', () => {
      const err = new TypeError('invalid type');
      expect(() => catchAbort(err)).toThrow(err);
    });
  });

  describe('suppressTimeout & catchTimeout', () => {
    it('rethrows an ordinary CancelError-shaped rejection', async () => {
      const cancelErr = cancelErrorLike();
      await expect(suppressTimeout(Promise.reject(cancelErr))).rejects.toBe(cancelErr);
    });

    it('swallows a bare TimeoutError', async () => {
      await expect(suppressTimeout(Promise.reject(new TimeoutError()))).resolves.toBeUndefined();
    });

    it('swallows a CancelError-shaped rejection with TimeoutError cause', async () => {
      const cancelErr = cancelErrorLike({ cause: new TimeoutError() });
      await expect(suppressTimeout(Promise.reject(cancelErr))).resolves.toBeUndefined();
    });

    it('catchTimeout returns a TimeoutError and throws an unrelated error', () => {
      const timeoutErr = new TimeoutError();
      expect(catchTimeout(timeoutErr)).toBe(timeoutErr);

      const typeErr = new TypeError('fail');
      expect(() => catchTimeout(typeErr)).toThrow(typeErr);
    });
  });

  describe('createSuppressError & createCatchError', () => {
    it('createSuppressError("RetryError") swallows RetryError and rethrows TypeError', async () => {
      const suppressRetry = createSuppressError('RetryError');
      const retryErr = { name: 'RetryError' };
      const typeErr = new TypeError('boom');

      await expect(suppressRetry(Promise.reject(retryErr))).resolves.toBeUndefined();
      await expect(suppressRetry(Promise.reject(typeErr))).rejects.toBe(typeErr);
    });

    it('createCatchError produces custom catch helper', () => {
      const catchTypeError = createCatchError(TypeError);
      const err = new TypeError('test');
      expect(catchTypeError(err)).toBe(err);
    });
  });

  describe('error class exports & guards', () => {
    it('exports AbortError and TimeoutError classes and guards', () => {
      const abortErr = new AbortError('aborted');
      expect(isAbortError(abortErr)).toBe(true);

      const timeoutErr = new TimeoutError('timed out');
      expect(isTimeoutError(timeoutErr)).toBe(true);
    });
  });
});
