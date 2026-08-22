import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import { CancelError } from './cancel-error';
import { CancelablePromise, ICancelable } from './cancelable-promise';
import {
  AbortError as RealAbortError,
  CANCEL_SIGNAL_BRAND,
  catchCancel,
  createCancelSignal,
  ICatchSuppressOptions,
  isCancelError,
  isCancelSignal,
  makeCancelable,
  suppressCancel,
  TimeoutError as RealTimeoutError,
  TimeoutError,
} from './helpers';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Plain Error subclass, prototype reset needed for the same es5-target reason CancelError resets
// it (see cancel-error.ts): `class extends Error` alone loses instanceof under es5 transpilation.
class AbortError extends Error {
  override readonly name = 'AbortError';

  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

describe('isCancelError', () => {
  it('strictly detects cancel error', () => {
    expect(isCancelError(new CancelError())).toBe(true);
  });

  // Detection is brand-based, not name-based. A foreign object merely named 'CancelError' is
  // NOT a canc CancelError and must not be matched (false-suppression regression).
  it('does not match a foreign name-only lookalike', () => {
    expect(isCancelError({ message: '', name: 'CancelError' })).toBe(false);
  });

  it('does not detect other errors', () => {
    expect(isCancelError(new Error())).toBe(false);
    expect(isCancelError(new TypeError())).toBe(false);
  });
});

describe('createCancelSignal', () => {
  let result: ReturnType<typeof createCancelSignal>;

  beforeEach(() => {
    result = createCancelSignal();
  });

  it('returns controller members', () => {
    expect(result).toEqual({
      cancel: expect.any(Function),
      signal: expect.any(AbortSignal),
    });
  });

  it('brands the returned signal (isCancelSignal true)', () => {
    expect(isCancelSignal(result.signal)).toBe(true);
  });

  // raw AbortSignal carries no brand so check must be false
  it('does not brand a plain AbortSignal', () => {
    expect(isCancelSignal(new AbortController().signal)).toBe(false);
  });

  it('brand property is own and non-enumerable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(result.signal, Symbol.for('@cancjs/promise:CancelSignal'));

    expect(descriptor).toBeDefined();
    expect(descriptor!.enumerable).toBe(false);
    expect(descriptor!.value).toBe(true);
  });

  // Registry keys are namespace plus identifier, with no space: the key is part of the public
  // cross-copy contract, so a rename has to break a test.
  it('uses a registry key without a space', () => {
    expect(Symbol.keyFor(CANCEL_SIGNAL_BRAND)).toBe('@cancjs/promise:CancelSignal');
    expect(Symbol.keyFor(CANCEL_SIGNAL_BRAND)).toMatch(/^@cancjs\/[a-z-]+:[A-Za-z]+$/);
  });

  it('brands the reason: cancel(string) sets signal.reason to a CancelError with that message', () => {
    const { cancel, signal } = result;

    const spy = jest.fn();
    signal.addEventListener('abort', spy);

    expect(() => {
      cancel('reason');
    }).not.toThrow();
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.message).toBe('reason');
    expect(spy).toHaveBeenCalled();
  });

  it('cancel() with no argument sets signal.reason to a fresh CancelError', () => {
    const { cancel, signal } = result;

    cancel();

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
  });

  it('cancel(cancelError) passes an existing CancelError through unwrapped (same identity)', () => {
    const { cancel, signal } = result;
    const cancelError = new CancelError('preexisting');

    cancel(cancelError);

    expect(signal.reason).toBe(cancelError);
  });

  it('cancel(object) wraps a non-CancelError object as the CancelError cause', () => {
    const { cancel, signal } = result;
    const reason = { x: 1 };

    cancel(reason);

    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.cause).toBe(reason);
  });

  it('uses the default reason passed at creation when cancel() is called with no argument', () => {
    const { cancel, signal } = createCancelSignal('default-reason');

    cancel();

    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.message).toBe('default-reason');
  });

  it('cancels a CancelablePromise via the signal option with the exact CancelError', async () => {
    const { cancel, signal } = createCancelSignal();

    const promise = new CancelablePromise(
      () => {
        /* never settles */
      },
      { signal },
    );

    cancel('stop');

    let caught: any;
    await promise.catch((error) => {
      caught = error;
    });

    expect(isCancelError(caught)).toBe(true);
    expect(caught).toBe(signal.reason);
    expect(caught.message).toBe('stop');
  });
});

describe('catchCancel', () => {
  it('returns cancel error', () => {
    const error = new CancelError();
    expect(catchCancel(error)).toBe(error);
  });

  it('rethrows any other error', () => {
    const error = new TypeError();

    try {
      catchCancel(error);
      throw new Error('catchCancel not threw');
    } catch (err) {
      expect(err).toBe(error);
    }
  });

  // todo: duck-check widening, a plain native Promise (foreign thenable) rejecting with a
  // CancelError is caught and returned, not just CancelablePromise instances.
  it('catches a CancelError from a plain native Promise', async () => {
    const nativePromise = Promise.reject(new CancelError('native reject'));

    const result = catchCancel(nativePromise as any);

    expect(result).toBeInstanceOf(CancelablePromise);
    await expect(result).resolves.toBeInstanceOf(CancelError);
  });

  // Non-CancelError rejection through the thenable branch must rethrow, not just the CancelError
  // side already covered above.
  it('rethrows via a plain native Promise rejecting with a non-CancelError', async () => {
    const error = new TypeError('boom');
    const nativePromise = Promise.reject(error);

    const result = catchCancel(nativePromise as any);

    await expect(result).rejects.toBe(error);
  });

  // default behavior (no options / abort:false) leaves a bare AbortError unmatched, must
  // still rethrow. Proves the {abort} option is not accidentally always-on.
  it('rethrows a plain AbortError by default (no abort option)', async () => {
    const nativePromise = Promise.reject(new AbortError());

    const result = catchCancel(nativePromise as any);

    await expect(result).rejects.toBeInstanceOf(AbortError);
  });

  it('with {abort:true} catches and returns a plain AbortError', async () => {
    const abortError = new AbortError();
    const nativePromise = Promise.reject(abortError);

    const result = catchCancel(nativePromise as any, { abort: true });

    await expect(result).resolves.toBe(abortError);
  });

  it('with {abort:true} returns a CancelError whose aborted getter is true', () => {
    const cancelError = new CancelError(undefined, { cause: new AbortError() });

    expect(cancelError.aborted).toBe(true);
    expect(catchCancel(cancelError, { abort: true })).toBe(cancelError);
  });

  // Bare-error overload: without {abort}, a bare AbortError is not a CancelError, so it throws
  // synchronously same as any other foreign error.
  it('bare-error form: throws a plain AbortError without the abort option', () => {
    const error = new AbortError();

    expect(() => catchCancel(error)).toThrow(error);
  });

  it('bare-error form: with {abort:true} returns a plain AbortError instead of throwing', () => {
    const error = new AbortError();

    expect(catchCancel(error, { abort: true })).toBe(error);
  });

  // {timeout} mirrors {abort} for TimeoutError, and the two options are independent.
  it('bare-error form: with {timeout:true} returns the error instead of throwing', () => {
    const error = new TimeoutError();

    expect(catchCancel(error, { timeout: true })).toBe(error);
  });

  it('obeys promise options such as { bubble: false }', () => {
    let canceledInner = false;
    const inner = new CancelablePromise((resolve, reject, { handleCancel }) => {
      handleCancel(() => {
        canceledInner = true;
      });
    });
    const outer = catchCancel(inner, { bubble: false });
    const child = outer.then(() => {});
    child.cancel();
    expect(child.isCanceled).toBe(true);
    expect(outer.isCanceled).toBe(false);
    expect(canceledInner).toBe(false);
  });

  it('cancels the input when canceled and settles canceled (not resolved)', async () => {
    const inner = new CancelablePromise(() => {});
    const outer = catchCancel(inner);
    outer.cancel();
    expect(inner.isCanceled).toBe(true);
    expect(outer.isCanceled).toBe(true);
    await expect(outer).rejects.toBeInstanceOf(CancelError);
  });

  it('works on a non-cancelable plain Promise and registers no handler', async () => {
    const p = new Promise<void>(() => {});
    const outer = catchCancel(p);
    outer.cancel();
    expect(outer.isCanceled).toBe(true);
    await expect(outer).rejects.toBeInstanceOf(CancelError);
  });
});

describe('suppressCancel', () => {
  it('suppresses cancel error', () => {
    expect(suppressCancel(new CancelError())).toBe(undefined);
  });

  it('rethrows any other error', () => {
    const error = new TypeError();

    try {
      suppressCancel(error);
      throw new Error('catchCancel not threw');
    } catch (err) {
      expect(err).toBe(error);
    }
  });

  // todo: widened to a duck-check (isThenable) instead of `instanceof CancelablePromise`, so
  // a PLAIN native Promise rejecting with a CancelError is also suppressed correctly, the
  // brand-based isCancelError (`Symbol.for('@cancjs/promise:CancelError')`) makes this
  // detection copy/realm-safe regardless of what produced the rejection (mirrors the brand
  // check pattern used in cancel-error.spec.ts).
  it('suppresses a plain native Promise rejecting with a CancelError', async () => {
    const nativePromise = Promise.reject(new CancelError('native reject'));

    const result = suppressCancel(nativePromise as any);

    expect(result).toBeInstanceOf(CancelablePromise);
    await expect(result).resolves.toBe(undefined);
  });

  it('rethrows via a plain native Promise rejecting with a non-CancelError', async () => {
    const error = new TypeError('boom');
    const nativePromise = Promise.reject(error);

    const result = suppressCancel(nativePromise as any);

    await expect(result).rejects.toBe(error);
  });

  // default behavior (no options / abort:false) must RE-THROW a bare AbortError, proving
  // the {abort} option is opt-in, not always-on (anti-stub: would fail if abort matching were
  // unconditional).
  it('rethrows a plain AbortError by default (no abort option)', async () => {
    const nativePromise = Promise.reject(new AbortError());

    const result = suppressCancel(nativePromise as any);

    await expect(result).rejects.toBeInstanceOf(AbortError);
  });

  // Anti-stub: this must FAIL on code that has not yet special-cased {abort}, since a bare
  // AbortError is not a CancelError and would rethrow without the {abort} option honored.
  it('with {abort:true} swallows a plain AbortError (resolves)', async () => {
    const nativePromise = Promise.reject(new AbortError());

    const result = suppressCancel(nativePromise as any, { abort: true });

    await expect(result).resolves.toBe(undefined);
  });

  // Bare-error overload equivalent of the pair above.
  it('bare-error form: throws a plain AbortError without the abort option', () => {
    const error = new AbortError();

    expect(() => suppressCancel(error)).toThrow(error);
  });

  it('bare-error form: with {abort:true} returns void instead of throwing', () => {
    const error = new AbortError();

    expect(suppressCancel(error, { abort: true })).toBe(undefined);
  });

  // default behavior (no options / timeout:false) must RE-THROW a bare TimeoutError, proving
  // the {timeout} option is opt-in, not always-on.
  it('rethrows a plain TimeoutError by default (no timeout option)', async () => {
    const nativePromise = Promise.reject(new TimeoutError());

    const result = suppressCancel(nativePromise as any);

    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  // Anti-stub: this must FAIL before the {timeout} option is honored.
  it('with {timeout:true} swallows a plain TimeoutError (resolves)', async () => {
    const nativePromise = Promise.reject(new TimeoutError());

    const result = suppressCancel(nativePromise as any, { timeout: true });

    await expect(result).resolves.toBe(undefined);
  });

  // A CancelError produced by a timeout-driven cancellation: cause is a TimeoutError, so
  // `timedOut` is true and `aborted` is false. Proves the getters are independent.
  it('a CancelError caused by a timeout has timedOut true and aborted false', () => {
    const cancelError = new CancelError(undefined, { cause: new TimeoutError() });

    expect(cancelError.timedOut).toBe(true);
    expect(cancelError.aborted).toBe(false);
    expect(suppressCancel(cancelError, { timeout: true })).toBe(undefined);
  });

  // The two options are independent: {abort} must not widen to TimeoutError, and {timeout}
  // must not widen to AbortError.
  it('{abort:true} does not swallow a TimeoutError', () => {
    const error = new TimeoutError();

    expect(() => suppressCancel(error, { abort: true })).toThrow(error);
  });

  it('{timeout:true} does not swallow an AbortError', () => {
    const error = new AbortError();

    expect(() => suppressCancel(error, { timeout: true })).toThrow(error);
  });

  // Bare-error overload equivalent of the {timeout} pair above.
  it('bare-error form: throws a plain TimeoutError without the timeout option', () => {
    const error = new TimeoutError();

    expect(() => suppressCancel(error)).toThrow(error);
  });

  it('bare-error form: with {timeout:true} returns void instead of throwing', () => {
    const error = new TimeoutError();

    expect(suppressCancel(error, { timeout: true })).toBe(undefined);
  });

  it('obeys promise options such as { bubble: false }', () => {
    let canceledInner = false;
    const inner = new CancelablePromise((resolve, reject, { handleCancel }) => {
      handleCancel(() => {
        canceledInner = true;
      });
    });
    const outer = suppressCancel(inner, { bubble: false });
    const child = outer.then(() => {});
    child.cancel();
    expect(child.isCanceled).toBe(true);
    expect(outer.isCanceled).toBe(false);
    expect(canceledInner).toBe(false);
  });

  it('cancels the input when canceled and settles canceled (not resolved-undefined)', async () => {
    const inner = new CancelablePromise(() => {});
    const outer = suppressCancel(inner);
    outer.cancel();
    expect(inner.isCanceled).toBe(true);
    expect(outer.isCanceled).toBe(true);
    await expect(outer).rejects.toBeInstanceOf(CancelError);
  });

  it('works on a non-cancelable plain Promise and registers no handler', async () => {
    const p = new Promise<void>(() => {});
    const outer = suppressCancel(p);
    outer.cancel();
    expect(outer.isCanceled).toBe(true);
    await expect(outer).rejects.toBeInstanceOf(CancelError);
  });
});

describe('makeCancelable', () => {
  it('wraps a promise', () => {
    const promise = CancelablePromise.resolve();
    const wrappedPromise = makeCancelable(promise);
    expect(wrappedPromise).toEqual(expect.any(CancelablePromise));
    expect(wrappedPromise).not.toBe(promise);
  });

  it('resolves with wrapped promise when cancelled', async () => {
    const promise = CancelablePromise.resolve(1);

    await expect(makeCancelable(promise)).resolves.toBe(1);

    const wrappedPromise = makeCancelable(promise);

    await flushPromises();

    wrappedPromise.cancel();

    await expect(wrappedPromise).resolves.toBe(1);
    expect(wrappedPromise.isCanceled).toBe(false);
  });

  it('ignores wrapped promise when synchronously cancelled', async () => {
    const promise = CancelablePromise.resolve(1);

    await expect(makeCancelable(promise)).resolves.toBe(1);

    const wrappedPromise = makeCancelable(promise);

    wrappedPromise.cancel();

    await expect(wrappedPromise).rejects.toThrow();
    expect(wrappedPromise.isCanceled).toBe(true);
  });

  // isCancelable(promise) false branch, plain non-cancelable promise, no third-party .cancel
  // to invoke.
  it('does not attempt to cancel a plain non-cancelable promise', async () => {
    const promise = Promise.resolve(1);

    const wrappedPromise = makeCancelable(promise as any);
    wrappedPromise.cancel();

    await expect(wrappedPromise).rejects.toThrow();
  });

  it('cancels third-party cancelable when cancelled', async () => {
    let promiseReject: (reason?: any) => void;

    const promise = Object.assign(
      new Promise<never>((_resolve, reject) => {
        promiseReject = reject;
      }),
      { cancel: jest.fn(() => promiseReject('Canceled')) },
    ) as ICancelable<never>;

    const wrappedPromise = makeCancelable(promise);
    wrappedPromise.cancel();

    expect(promise.cancel).toHaveBeenCalled();
    await expect(wrappedPromise).rejects.toThrow();
  });
});

describe('promoted error exports', () => {
  it('promotes shared error classes to public exports', () => {
    type _TestAbortError = import('@cancjs/promise').AbortError;
    type _TestTimeoutError = import('@cancjs/promise').TimeoutError;
    type _TestIsAbortError = typeof import('@cancjs/promise').isAbortError;
    type _TestIsTimeoutError = typeof import('@cancjs/promise').isTimeoutError;

    // AggregateError and isAggregateError remain public exports
    type _TestAggregateError = import('@cancjs/promise').AggregateError;
    type _TestIsAggregateError = typeof import('@cancjs/promise').isAggregateError;
  });
});

describe('catchCancel / suppressCancel type subtraction options', () => {
  it('types subtraction of abort and timeout flags correctly', () => {
    type SampleErrors = RealAbortError | RealTimeoutError | TypeError;
    const p = CancelablePromise.resolve(1) as unknown as CancelablePromise<number, SampleErrors>;

    // 1. inline { abort: true } subtracts AbortError
    const _c1 = catchCancel(p, { abort: true });
    const _check1: Eq<typeof _c1, CancelablePromise<number | CancelError, RealTimeoutError | TypeError>> = true;

    const _s1 = suppressCancel(p, { abort: true });
    const _checkS1: Eq<typeof _s1, CancelablePromise<number | void, RealTimeoutError | TypeError>> = true;

    // 2. { abort: true, timeout: true } subtracts both
    const _c2 = catchCancel(p, { abort: true, timeout: true });
    const _check2: Eq<typeof _c2, CancelablePromise<number | CancelError, TypeError>> = true;

    const _s2 = suppressCancel(p, { abort: true, timeout: true });
    const _checkS2: Eq<typeof _s2, CancelablePromise<number | void, TypeError>> = true;

    // 3. { abort: false } subtracts nothing
    const _c3 = catchCancel(p, { abort: false });
    const _check3: Eq<typeof _c3, CancelablePromise<number | CancelError, SampleErrors>> = true;

    const _s3 = suppressCancel(p, { abort: false });
    const _checkS3: Eq<typeof _s3, CancelablePromise<number | void, SampleErrors>> = true;

    // 4. a hoisted const bag = { abort: true } subtracts nothing (since abort widens to boolean)
    const bag = { abort: true };
    const _c4 = catchCancel(p, bag);
    const _check4: Eq<typeof _c4, CancelablePromise<number | CancelError, SampleErrors>> = true;

    const _s4 = suppressCancel(p, bag);
    const _checkS4: Eq<typeof _s4, CancelablePromise<number | void, SampleErrors>> = true;

    // 5. { abort: true } satisfies ICatchSuppressOptions and as const both subtract
    const bagSatisfies = { abort: true } satisfies ICatchSuppressOptions;
    const _c5a = catchCancel(p, bagSatisfies);
    const _check5a: Eq<typeof _c5a, CancelablePromise<number | CancelError, RealTimeoutError | TypeError>> = true;

    const bagAsConst = { abort: true } as const;
    const _c5b = catchCancel(p, bagAsConst);
    const _check5b: Eq<typeof _c5b, CancelablePromise<number | CancelError, RealTimeoutError | TypeError>> = true;

    // 6. suppressCancel(p) with no options leaves TFailure untouched
    const _s6 = suppressCancel(p);
    const _checkS6: Eq<typeof _s6, CancelablePromise<number | void, SampleErrors>> = true;

    void [_check1, _checkS1, _check2, _checkS2, _check3, _checkS3, _check4, _checkS4, _check5a, _check5b, _checkS6];
  });
});
