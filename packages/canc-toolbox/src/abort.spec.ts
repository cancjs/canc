import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import {
  AbortError,
  createAbortSignal,
  isAbortError,
  suppress,
  suppressAbort,
  toAbortSignal,
  withSignal,
} from './abort';
import { timeout } from './prebound';

function abortReason(controller = new AbortController()): Error {
  controller.abort();
  return controller.signal.reason as Error;
}

const platformDomException = (globalThis as unknown as { DOMException?: new (...args: any[]) => object }).DOMException;

describe('AbortError / isAbortError', () => {
  it('AbortError is named AbortError and carries a default message', () => {
    const error = new AbortError();
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('The operation was aborted');
    // Backed by the platform DOMException where one exists (shared with the platform's own
    // AbortError), which is not an instance of Error there; falls back to Error otherwise.
    expect(error).toBeInstanceOf(platformDomException ?? Error);
  });

  it('detects a bare DOMException AbortError', () => {
    expect(isAbortError(abortReason())).toBe(true);
  });

  it('detects an AbortError instance', () => {
    expect(isAbortError(new AbortError())).toBe(true);
  });

  it('rejects a CancelError, an ordinary Error, and non-objects', () => {
    expect(isAbortError(new CancelError('canceled'))).toBe(false);
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('createAbortSignal (plain convenience)', () => {
  it('returns a signal and a bound abort with no CancelError wiring', () => {
    const { signal, abort } = createAbortSignal();
    expect(signal.aborted).toBe(false);
    abort();
    expect(signal.aborted).toBe(true);
    // A plain abort reason is a DOMException AbortError, not a CancelError.
    expect(isCancelError(signal.reason)).toBe(false);
    expect(isAbortError(signal.reason)).toBe(true);
  });

  it('forwards an explicit abort reason', () => {
    const { signal, abort } = createAbortSignal();
    const reason = new Error('stop');
    abort(reason);
    expect(signal.reason).toBe(reason);
  });
});

describe('suppress', () => {
  it('swallows a CancelError by default', async () => {
    await expect(suppress(Promise.reject(new CancelError('user canceled')))).resolves.toBeUndefined();
  });

  it('does NOT swallow a bare AbortError by default', async () => {
    const reason = abortReason();
    await expect(suppress(Promise.reject(reason))).rejects.toBe(reason);
  });

  it('swallows a bare AbortError under { abort: true }', async () => {
    await expect(suppress(Promise.reject(abortReason()), { abort: true })).resolves.toBeUndefined();
  });

  it('swallows a CancelError whose cause is an abort under { abort: true }', async () => {
    const cancel = new CancelError(undefined, { cause: abortReason() });
    expect(cancel.aborted).toBe(true);
    await expect(suppress(Promise.reject(cancel), { abort: true })).resolves.toBeUndefined();
  });

  it('rethrows an unrelated error, with or without the abort flag', async () => {
    const boom = new Error('boom');
    await expect(suppress(Promise.reject(boom))).rejects.toBe(boom);
    await expect(suppress(Promise.reject(boom), { abort: true })).rejects.toBe(boom);
  });

  it('passes a fulfilled value through', async () => {
    await expect(suppress(Promise.resolve(42))).resolves.toBe(42);
  });

  it('returns a cancelable promise by default', () => {
    const promise = suppress(new Promise(() => {}));
    expect(promise).toBeInstanceOf(CancelablePromise);
    (promise as CancelablePromise<unknown>).cancel();
  });
});

describe('suppressAbort', () => {
  it('swallows a bare AbortError', async () => {
    await expect(suppressAbort(Promise.reject(abortReason()))).resolves.toBeUndefined();
  });

  it('swallows an ordinary CancelError too', async () => {
    await expect(suppressAbort(Promise.reject(new CancelError('user canceled')))).resolves.toBeUndefined();
  });

  it('rethrows an unrelated error', async () => {
    const boom = new Error('boom');
    await expect(suppressAbort(Promise.reject(boom))).rejects.toBe(boom);
  });
});

describe('fetch-shaped integration: abort in -> CancelError out -> suppress filters', () => {
  it('external abort cancels a CancelablePromise into an abort-caused CancelError, then suppress swallows it', async () => {
    const controller = new AbortController();

    // A fetch-shaped operation: a CancelablePromise wired to an external AbortSignal (as canc-fetch
    // would produce). Aborting the controller cancels the promise; canc threads the abort as the
    // CancelError cause, so the rejection is an abort-caused CancelError.
    const operation = new CancelablePromise<string>(
      (_resolve) => {
        // never settles on its own
      },
      { signal: controller.signal },
    );

    controller.abort();

    let caught: unknown;
    await operation.catch((error) => {
      caught = error;
    });
    expect(isCancelError(caught)).toBe(true);
    expect((caught as CancelError).aborted).toBe(true);

    // Downstream, suppress({ abort: true }) filters exactly this class of rejection.
    const controller2 = new AbortController();
    const operation2 = new CancelablePromise<string>(() => {}, { signal: controller2.signal });
    controller2.abort();
    await expect(suppress(operation2, { abort: true })).resolves.toBeUndefined();
  });
});

// An external signal and a deadline used to need a dedicated helper to compose. They no longer do:
// the deadline is `timeout`'s own argument and the signal is an ordinary cancelable option, so one
// call covers both races. These are the assertions that helper carried, kept against the pair.
describe('timeout with an external signal: deadline and signal in one call', () => {
  it('the external signal aborting first wins the race', async () => {
    const controller = new AbortController();
    const promise = timeout(new Promise(() => {}), 10_000, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });

  it('the deadline wins when no external signal aborts', async () => {
    const promise = timeout(new Promise(() => {}), 5);
    await expect(promise).rejects.toBeDefined();
  });

  it('adopts the underlying settlement when neither the signal nor the deadline fires', async () => {
    const controller = new AbortController();
    await expect(timeout(Promise.resolve('ok'), 10_000, { signal: controller.signal })).resolves.toBe('ok');
  });

  it('cancels a cancelable underlying operation when the external signal aborts', async () => {
    const controller = new AbortController();
    let canceled = false;
    const underlying = new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        canceled = true;
      });
    });
    const promise = timeout(underlying, 10_000, { signal: controller.signal }).catch(() => undefined);
    controller.abort();
    await promise;
    expect(canceled).toBe(true);
  });
});

describe('toAbortSignal: inverse interop (promise cancels -> signal fires)', () => {
  it('fires the signal when the source promise cancels', async () => {
    const source = new CancelablePromise<void>(() => {});
    const signal = toAbortSignal(source);
    expect(signal.aborted).toBe(false);
    source.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(signal.aborted).toBe(true);
  });

  it('composes with AbortSignal.any', async () => {
    const source = new CancelablePromise<void>(() => {});
    const other = new AbortController();
    const anyOf = (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any;
    const combined = anyOf([toAbortSignal(source), other.signal]);
    expect(combined.aborted).toBe(false);
    source.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(combined.aborted).toBe(true);
  });

  it('never fires for a fulfilled promise', async () => {
    const signal = toAbortSignal(Promise.resolve('done'));
    await Promise.resolve();
    await Promise.resolve();
    expect(signal.aborted).toBe(false);
  });
});

describe('withSignal (p-signal-shaped)', () => {
  it('rejects with the abort reason when the signal aborts first', async () => {
    const controller = new AbortController();
    const promise = withSignal(controller.signal, new Promise(() => {}));
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withSignal(controller.signal, Promise.resolve('never'))).rejects.toBeDefined();
  });

  it('resolves the value when the promise wins', async () => {
    const controller = new AbortController();
    await expect(withSignal(controller.signal, Promise.resolve('v'))).resolves.toBe('v');
  });

  it('passes an undefined signal straight through (optional-cancellation signature)', async () => {
    await expect(withSignal(undefined, Promise.resolve('v'))).resolves.toBe('v');
  });

  it('accepts a function receiving the signal', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const promise = withSignal(controller.signal, (signal) => {
      received = signal;
      return Promise.resolve('fn');
    });
    await expect(promise).resolves.toBe('fn');
    expect(received).toBe(controller.signal);
  });

  it('passes undefined to the function when no signal is given', async () => {
    let received: AbortSignal | undefined = {} as AbortSignal;
    await withSignal(undefined, (signal) => {
      received = signal;
      return 'v';
    });
    expect(received).toBeUndefined();
  });
});
