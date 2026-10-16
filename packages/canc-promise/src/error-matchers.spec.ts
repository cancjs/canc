import * as vm from 'vm';

import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';
import {
  catchAbort,
  catchErrors,
  createCatchError,
  createIsError,
  createSuppressError,
  suppressErrors,
  suppressTimeout,
} from './error-matchers';
import { AbortError, isAbortError, isCancelError, isTimeoutError, TimeoutError } from './helpers';

function named(name: string): Error {
  return Object.assign(new Error('x'), { name });
}

// Mocks a CancelError from another package copy that fails instanceof but carries same brand
function foreignCopyCancelError(): object {
  const error = Object.create(null) as Record<PropertyKey, unknown>;
  error[Symbol.for('@cancjs/promise:CancelError')] = true;
  return error;
}

describe('createSuppressError', () => {
  it('rejects an empty matcher list', () => {
    expect(() => createSuppressError()).toThrow(TypeError);
    expect(() => createSuppressError()).toThrow('createSuppressError requires at least one error matcher');
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

  // A function declaration has a prototype but is not branded so must not be treated as constructor
  it('treats a function-declaration predicate as a predicate, not a constructor', () => {
    function isRetryError(error: any): boolean {
      return !!error && error.name === 'RetryError';
    }

    const suppress = createSuppressError(isRetryError);

    expect(suppress(named('RetryError'))).toBeUndefined();
    // Would be swallowed if the matcher had been compiled as a constructor matching
    // on its own name.
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

  it('ignores abort and timeout options when flagsEnabled is false', async () => {
    const suppress = createSuppressError(CancelError);

    expect(() => suppress(new AbortError())).toThrow();
    expect(() => suppress(new AbortError(), { abort: true } as any)).toThrow(AbortError);
    expect(() => suppress(new TimeoutError())).toThrow();
    expect(() => suppress(new TimeoutError(), { timeout: true } as any)).toThrow(TimeoutError);

    let rejectedError: unknown;
    try {
      await suppress(CancelablePromise.reject(new AbortError()), { abort: true } as any);
    } catch (e) {
      rejectedError = e;
    }
    expect(isAbortError(rejectedError)).toBe(true);
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
    expect(() => createCatchError()).toThrow('createCatchError requires at least one error matcher');
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

type TSettleState =
  { status: 'pending' } | { status: 'fulfilled'; value: unknown } | { status: 'rejected'; reason: unknown };

// one macrotask: microtasks and the unhandled rejection check all run before setImmediate fires
async function stateAfterOneMacrotask(promise: PromiseLike<unknown>): Promise<TSettleState> {
  let state: TSettleState = { status: 'pending' };

  promise.then(
    (value) => {
      state = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      state = { status: 'rejected', reason };
    },
  );

  await new Promise((resolve) => setImmediate(resolve));

  return state;
}

const createHostileProxy = (): object =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`Hostile property access for ${String(prop)}`);
      },
    },
  );

describe('a throwing predicate', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  type TWrap = (promise: PromiseLike<unknown>, predicate: (error: any) => boolean) => PromiseLike<unknown>;

  const wrappers: Array<[string, TWrap]> = [
    ['catchErrors', (promise, predicate) => catchErrors(promise, predicate)],
    ['suppressErrors', (promise, predicate) => suppressErrors(promise, predicate)],
    ['createCatchError', (promise, predicate) => createCatchError(predicate)(promise)],
    ['createSuppressError', (promise, predicate) => createSuppressError(predicate)(promise)],
  ];

  it.each(wrappers)('%s rejects with the predicate error', async (_name, wrap) => {
    const original = new Error('net');
    const predicateError = new TypeError('predicate failed');
    const predicate = (): boolean => {
      throw predicateError;
    };

    const state = await stateAfterOneMacrotask(wrap(CancelablePromise.reject(original), predicate));

    expect(state).toEqual({ status: 'rejected', reason: predicateError });
    expect((predicateError as Error & { cause?: unknown }).cause).toBe(original);
    expect(unhandled).toEqual([]);
  });

  it('keeps an existing cause on the predicate error', async () => {
    const earlier = new Error('earlier');
    const predicateError = new TypeError('predicate failed', { cause: earlier });
    const predicate = (): boolean => {
      throw predicateError;
    };

    const state = await stateAfterOneMacrotask(catchErrors(CancelablePromise.reject(new Error('net')), predicate));

    expect(state).toEqual({ status: 'rejected', reason: predicateError });
    expect(predicateError.cause).toBe(earlier);
    expect(unhandled).toEqual([]);
  });

  it('rejects with a thrown primitive as is', async () => {
    const predicate = (): boolean => {
      throw 'boom';
    };

    const state = await stateAfterOneMacrotask(suppressErrors(CancelablePromise.reject(new Error('net')), predicate));

    expect(state).toEqual({ status: 'rejected', reason: 'boom' });
    expect(unhandled).toEqual([]);
  });
});

describe('constructor matcher identity', () => {
  it('does not match a value merely named CancelError', () => {
    const isCancel = createIsError(CancelError);

    expect(isCancel({ name: 'CancelError' })).toBe(false);
    expect(isCancel(named('CancelError'))).toBe(false);
    expect(isCancel(new CancelError())).toBe(true);
    expect(isCancel(foreignCopyCancelError())).toBe(true);
  });

  it('keeps matching platform kinds by name', () => {
    expect(createIsError(AbortError)(named('AbortError'))).toBe(true);
    expect(createIsError(TimeoutError)(named('TimeoutError'))).toBe(true);
  });

  it('matches only its own kind for a constructor from another realm', () => {
    const ForeignTypeError = vm.runInNewContext('TypeError') as TypeErrorConstructor;
    const isTypeError = createIsError(ForeignTypeError);

    expect(isTypeError(new RangeError('x'))).toBe(false);
    expect(isTypeError('text')).toBe(false);
    expect(isTypeError(vm.runInNewContext('new RangeError("x")'))).toBe(false);
    expect(isTypeError(new TypeError('x'))).toBe(true);
    expect(isTypeError(vm.runInNewContext('new TypeError("x")'))).toBe(true);
  });
});

describe('platform backed error instances', () => {
  it('take a new name and message by plain assignment', () => {
    const abortError = new AbortError('first');

    abortError.name = 'X';
    abortError.message = 'second';

    expect(abortError.name).toBe('X');
    expect(abortError.message).toBe('second');
    expect(isAbortError(abortError)).toBe(true);
  });

  it('let a subclass rename itself in its constructor', () => {
    class ConnectionTimeout extends TimeoutError {
      constructor(message?: string) {
        super(message);
        this.name = 'ConnectionTimeout';
      }
    }

    const error = new ConnectionTimeout('slow');

    expect(error.name).toBe('ConnectionTimeout');
    expect(error.message).toBe('slow');
    expect(isTimeoutError(error)).toBe(true);
  });

  it('keep the default name and message and no enumerable keys', () => {
    const abortError = new AbortError();

    expect(abortError.name).toBe('AbortError');
    expect(abortError.message).toBe('The operation was aborted');
    expect(Object.keys(abortError)).toEqual([]);
  });
});

describe('hostile reasons', () => {
  it('core isCancelError answers false without throwing', () => {
    const hostile = createHostileProxy();

    expect(() => isCancelError(hostile)).not.toThrow();
    expect(isCancelError(hostile)).toBe(false);
  });

  const rawWrappers: Array<[string, (value: unknown) => unknown]> = [
    ['catchAbort', (value) => catchAbort(value)],
    ['suppressTimeout', (value) => suppressTimeout(value)],
  ];

  const promiseWrappers: Array<[string, (promise: PromiseLike<unknown>) => PromiseLike<unknown>]> = [
    ['catchAbort', (promise) => catchAbort(promise)],
    ['suppressTimeout', (promise) => suppressTimeout(promise)],
  ];

  it.each(rawWrappers)('%s rethrows a raw hostile value as unmatched', (_name, wrap) => {
    const hostile = createHostileProxy();
    let thrown: unknown;

    try {
      wrap(hostile);
    } catch (error) {
      thrown = error;
    }

    expect(thrown === hostile).toBe(true);
  });

  it.each(promiseWrappers)('%s keeps a hostile rejection rejecting', async (_name, wrap) => {
    const hostile = createHostileProxy();

    const state = await stateAfterOneMacrotask(wrap(Promise.reject(hostile)));

    expect(state.status).toBe('rejected');
    expect(state.status === 'rejected' && state.reason === hostile).toBe(true);
  });
});
