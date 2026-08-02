import { suppress, suppressAbort, TimeoutError } from './index';

// Zero-dependency twin: no import from `@cancjs/promise`, so a CancelError-shaped rejection is
// built by hand carrying only the registry brand (the same cross-copy simulation the brand suite
// in canc-promise uses), matching how suppress itself recognizes one structurally.
const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

function cancelErrorLike(message = 'canceled'): Error {
  const error = new Error(message);
  Object.defineProperty(error, CANCEL_ERROR_BRAND, { value: true });
  return error;
}

function abortReason(): Error {
  const controller = new AbortController();
  controller.abort();
  return controller.signal.reason as Error;
}

describe('suppress (native)', () => {
  it('swallows a CancelError-shaped rejection by default', async () => {
    await expect(suppress(Promise.reject(cancelErrorLike()))).resolves.toBeUndefined();
  });

  it('does NOT swallow a bare AbortError by default', async () => {
    const reason = abortReason();
    await expect(suppress(Promise.reject(reason))).rejects.toBe(reason);
  });

  it('swallows a bare AbortError under { abort: true }', async () => {
    await expect(suppress(Promise.reject(abortReason()), { abort: true })).resolves.toBeUndefined();
  });

  it('does NOT swallow a bare TimeoutError by default', async () => {
    const reason = new TimeoutError();
    await expect(suppress(Promise.reject(reason))).rejects.toBe(reason);
  });

  it('swallows a bare TimeoutError under { timeout: true }', async () => {
    await expect(suppress(Promise.reject(new TimeoutError()), { timeout: true })).resolves.toBeUndefined();
  });

  it('{ abort: true } does not swallow a TimeoutError, and { timeout: true } does not swallow an AbortError', async () => {
    const timeoutErr = new TimeoutError();
    const abortErr = abortReason();
    await expect(suppress(Promise.reject(timeoutErr), { abort: true })).rejects.toBe(timeoutErr);
    await expect(suppress(Promise.reject(abortErr), { timeout: true })).rejects.toBe(abortErr);
  });

  it('rethrows an unrelated error, regardless of options', async () => {
    const boom = new Error('boom');
    await expect(suppress(Promise.reject(boom))).rejects.toBe(boom);
    await expect(suppress(Promise.reject(boom), { abort: true, timeout: true })).rejects.toBe(boom);
  });

  it('passes a fulfilled value through', async () => {
    await expect(suppress(Promise.resolve(42))).resolves.toBe(42);
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = suppress(Promise.resolve('v'));
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });
});

describe('suppressAbort (native)', () => {
  it('swallows a bare AbortError', async () => {
    await expect(suppressAbort(Promise.reject(abortReason()))).resolves.toBeUndefined();
  });

  it('swallows a CancelError-shaped rejection too', async () => {
    await expect(suppressAbort(Promise.reject(cancelErrorLike()))).resolves.toBeUndefined();
  });

  it('rethrows an unrelated error', async () => {
    const boom = new Error('boom');
    await expect(suppressAbort(Promise.reject(boom))).rejects.toBe(boom);
  });
});
