import { _AbortError, _isAbortError, _isTimeoutError, _TimeoutError, CancelError } from '@cancjs/promise';

import {
  AbortError,
  catchAbort,
  catchTimeout,
  createCatchError,
  createSuppressError,
  ICatchErrorFn,
  isAbortError,
  isTimeoutError,
  ISuppressErrorFn,
  suppressAbort,
  suppressTimeout,
  TimeoutError,
} from './errors';

describe('errors module exports and behaviors', () => {
  it('identity: AbortError and TimeoutError equal core internal exports', async () => {
    const core = await import('@cancjs/promise');
    expect(AbortError).toBe(core._AbortError);
    expect(isAbortError).toBe(core._isAbortError);
    expect(TimeoutError).toBe(core._TimeoutError);
    expect(isTimeoutError).toBe(core._isTimeoutError);

    const _testAbort: AbortError | null = null;
    const _testTimeout: TimeoutError | null = null;
    const _testCatchFn: ICatchErrorFn | null = null;
    const _testSuppressFn: ISuppressErrorFn | null = null;
    expect(_testAbort).toBeNull();
    expect(_testTimeout).toBeNull();
    expect(_testCatchFn).toBeNull();
    expect(_testSuppressFn).toBeNull();
  });

  describe('suppressAbort', () => {
    it('rethrows an ordinary CancelError', async () => {
      const cancelErr = new CancelError('ordinary cancel');
      await expect(suppressAbort(Promise.reject(cancelErr))).rejects.toBe(cancelErr);
    });

    it('swallows a bare AbortError', async () => {
      const abortErr = new AbortError();
      await expect(suppressAbort(Promise.reject(abortErr))).resolves.toBeUndefined();
    });

    it('swallows a CancelError with AbortError cause', async () => {
      const abortCause = new AbortError();
      const cancelErr = new CancelError(undefined, { cause: abortCause });
      expect(cancelErr.aborted).toBe(true);
      await expect(suppressAbort(Promise.reject(cancelErr))).resolves.toBeUndefined();
    });
  });

  describe('suppressTimeout and catchTimeout twins', () => {
    it('suppressTimeout(Promise.reject(new CancelError())) REJECTS', async () => {
      const cancelErr = new CancelError('ordinary cancel');
      await expect(suppressTimeout(Promise.reject(cancelErr))).rejects.toBe(cancelErr);
    });

    it('suppressTimeout(Promise.reject(new TimeoutError())) resolves undefined', async () => {
      const timeoutErr = new TimeoutError();
      await expect(suppressTimeout(Promise.reject(timeoutErr))).resolves.toBeUndefined();
    });

    it('suppressTimeout(Promise.reject(new CancelError(undefined, { cause: new TimeoutError() }))) resolves undefined', async () => {
      const timeoutCause = new TimeoutError();
      const cancelErr = new CancelError(undefined, { cause: timeoutCause });
      expect(cancelErr.timedOut).toBe(true);
      await expect(suppressTimeout(Promise.reject(cancelErr))).resolves.toBeUndefined();
    });

    it('catchTimeout(Promise.reject(new CancelError())) REJECTS', async () => {
      const cancelErr = new CancelError('ordinary cancel');
      await expect(catchTimeout(Promise.reject(cancelErr))).rejects.toBe(cancelErr);
    });

    it('catchTimeout(Promise.reject(new TimeoutError())) resolves with TimeoutError', async () => {
      const timeoutErr = new TimeoutError();
      await expect(catchTimeout(Promise.reject(timeoutErr))).resolves.toBe(timeoutErr);
    });

    it('catchTimeout(Promise.reject(new CancelError(undefined, { cause: new TimeoutError() }))) resolves with CancelError', async () => {
      const timeoutCause = new TimeoutError();
      const cancelErr = new CancelError(undefined, { cause: timeoutCause });
      await expect(catchTimeout(Promise.reject(cancelErr))).resolves.toBe(cancelErr);
    });
  });

  describe('catchAbort twins', () => {
    it('catchAbort(Promise.reject(new CancelError())) REJECTS', async () => {
      const cancelErr = new CancelError('ordinary cancel');
      await expect(catchAbort(Promise.reject(cancelErr))).rejects.toBe(cancelErr);
    });

    it('catchAbort(Promise.reject(new AbortError())) resolves with AbortError', async () => {
      const abortErr = new AbortError();
      await expect(catchAbort(Promise.reject(abortErr))).resolves.toBe(abortErr);
    });

    it('catchAbort(Promise.reject(new CancelError(undefined, { cause: new AbortError() }))) resolves with CancelError', async () => {
      const abortCause = new AbortError();
      const cancelErr = new CancelError(undefined, { cause: abortCause });
      await expect(catchAbort(Promise.reject(cancelErr))).resolves.toBe(cancelErr);
    });
  });

  describe('raw error branch and matcher factories', () => {
    it('catchAbort(rawAbortError) RETURNS it; catchAbort(new TypeError()) THROWS it', () => {
      const rawAbort = new AbortError();
      const rawTypeErr = new TypeError('boom');

      expect(catchAbort(rawAbort)).toBe(rawAbort);
      expect(() => catchAbort(rawTypeErr)).toThrow(rawTypeErr);
    });

    it('Promise.reject(new AbortError()).catch(suppressAbort) resolves (raw-error branch)', async () => {
      const p = Promise.reject(new AbortError()).catch(suppressAbort);
      await expect(p).resolves.toBeUndefined();
    });

    it('createCatchError and createSuppressError matcher factories work', async () => {
      const customCatch = createCatchError('RangeError');
      const customSuppress = createSuppressError('RangeError');

      const rangeErr = new RangeError('out of range');
      expect(customCatch(rangeErr)).toBe(rangeErr);
      expect(customSuppress(rangeErr)).toBeUndefined();

      await expect(customCatch(Promise.reject(rangeErr))).resolves.toBe(rangeErr);
      await expect(customSuppress(Promise.reject(rangeErr))).resolves.toBeUndefined();
    });
  });
});
