import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { makeCancelSignal } from '../../_toolbox';
import { cancelify, toCancelError } from './cancelify';
import { promisify } from './index';

// A minimal AbortController stand-in that records construction and abort calls, so tests can assert
// that reading (or not reading) the injected signal controls whether a controller is ever built.
function makeSpyControllerCtor() {
  const instances: Array<{ aborted: boolean; reason: any; signal: any }> = [];
  const ctor = jest.fn(function SpyController(this: any) {
    const state = { aborted: false, reason: undefined as any };
    const listeners: Array<(this: any, ev: any) => void> = [];
    const signal = {
      get aborted() {
        return state.aborted;
      },
      get reason() {
        return state.reason;
      },
      addEventListener(_type: string, cb: (this: any, ev: any) => void) {
        listeners.push(cb);
      },
      removeEventListener() {
        /* noop */
      },
    };
    this.signal = signal;
    this.abort = (reason?: any) => {
      state.aborted = true;
      state.reason = reason;
      for (const cb of listeners) cb.call(signal, {});
    };
    instances.push({
      get aborted() {
        return state.aborted;
      },
      get reason() {
        return state.reason;
      },
      signal,
    });
  }) as unknown as new () => { abort(reason?: any): void; signal: any };

  return { ctor, instances };
}

describe('makeCancelSignal', () => {
  it('getSignal() yields undefined when there is no handleCancel (native impl)', () => {
    expect(makeCancelSignal(undefined).getSignal()).toBeUndefined();
  });

  it('builds no controller until getSignal() is first called, and wires one branded cancel handler', () => {
    const { ctor } = makeSpyControllerCtor();
    let registered: ((reason?: any) => void) | undefined;
    const handleCancel = jest.fn((onCancel: (reason?: any) => void) => {
      registered = onCancel;
    });

    const holder = makeCancelSignal(handleCancel as any, ctor, toCancelError);

    // the handler is wired up front so a late first call can see the cancel
    expect(ctor).not.toHaveBeenCalled();
    expect(handleCancel).toHaveBeenCalledTimes(1);

    const signal = holder.getSignal();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(false);

    // A second call returns the same signal without rebuilding.
    expect(holder.getSignal()).toBe(signal);
    expect(ctor).toHaveBeenCalledTimes(1);

    // The wired handler brands the reason.
    registered!('boom');
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.cause).toBeUndefined();
    expect(signal.reason.message).toBe('boom');
  });

  it('passes an existing CancelError reason through unwrapped', () => {
    const { ctor } = makeSpyControllerCtor();
    let registered: ((reason?: any) => void) | undefined;
    const handleCancel = ((onCancel: (reason?: any) => void) => {
      registered = onCancel;
    }) as any;

    const signal = makeCancelSignal(handleCancel, ctor, toCancelError).getSignal();
    expect(signal.aborted).toBe(false);

    const existing = new CancelError('already');
    registered!(existing);
    expect(signal.reason).toBe(existing);
  });

  it('wraps a non-CancelError object reason as the cause', () => {
    const { ctor } = makeSpyControllerCtor();
    let registered: ((reason?: any) => void) | undefined;
    const handleCancel = ((onCancel: (reason?: any) => void) => {
      registered = onCancel;
    }) as any;

    const signal = makeCancelSignal(handleCancel, ctor, toCancelError).getSignal();
    expect(signal.aborted).toBe(false);

    const cause = { code: 'X' };
    registered!(cause);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.cause).toBe(cause);
  });

  it('aborts with the raw reason when no normalizer is passed (the injection seam)', () => {
    const { ctor } = makeSpyControllerCtor();
    let registered: ((reason?: any) => void) | undefined;
    const handleCancel = ((onCancel: (reason?: any) => void) => {
      registered = onCancel;
    }) as any;

    // No normalizeReason argument: the plain/native path passes the reason through untouched.
    const signal = makeCancelSignal(handleCancel, ctor).getSignal();
    expect(signal.aborted).toBe(false);

    registered!('boom');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('boom');
    expect(isCancelError(signal.reason)).toBe(false);
  });
});

describe('getSignal() first called after cancel', () => {
  it('makeCancelSignal returns an already aborted signal with the branded reason', () => {
    const { ctor } = makeSpyControllerCtor();
    let registered: ((reason?: any) => void) | undefined;
    const handleCancel = ((onCancel: (reason?: any) => void) => {
      registered = onCancel;
    }) as any;

    const holder = makeCancelSignal(handleCancel, ctor, toCancelError);
    registered!('late');

    const signal = holder.getSignal();
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.message).toBe('late');
  });

  it('cancelify fn asking for the signal after an await gets an aborted signal', async () => {
    let signal: any;
    const wrapped = cancelify(async ({ getSignal }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      signal = getSignal();
      return new Promise<never>(() => {});
    });

    const promise = wrapped();
    promise.cancel();
    await promise.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
  });

  it('promisify signal captured in transformArgs and first read after cancel is aborted', async () => {
    let getLater: (() => any) | undefined;
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      transformArgs: (args, getSignal) => {
        getLater = getSignal;
        return args;
      },
    });

    const promise = fn() as CancelablePromise<unknown>;
    promise.cancel();
    await promise.catch(() => undefined);

    expect(getLater!().aborted).toBe(true);
  });

  it('promisify cancel hook reading the signal for the first time sees it aborted', async () => {
    let hookAborted: boolean | undefined;
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      handleCancel: (_handle, _args, getSignal) => {
        hookAborted = getSignal().aborted;
      },
    });

    const promise = fn() as CancelablePromise<unknown>;
    promise.cancel();
    await promise.catch(() => undefined);

    expect(hookAborted).toBe(true);
  });
});
