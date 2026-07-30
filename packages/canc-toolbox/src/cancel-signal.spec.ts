import { CancelError, isCancelError } from '@cancjs/promise';

import { makeCancelSignal } from '../../_toolbox';
import { toCancelError } from './cancelify';

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

  it('builds nothing until getSignal() is first called, then wires a single branded cancel handler', () => {
    const { ctor } = makeSpyControllerCtor();
    let registered: ((reason?: any) => void) | undefined;
    const handleCancel = jest.fn((onCancel: (reason?: any) => void) => {
      registered = onCancel;
    });

    const holder = makeCancelSignal(handleCancel as any, ctor, toCancelError);

    // Never calling getSignal() constructs no controller and registers no handler.
    expect(ctor).not.toHaveBeenCalled();
    expect(handleCancel).not.toHaveBeenCalled();

    // First getSignal() call materializes the controller + wires exactly one handler; the value
    // is the plain, real AbortSignal (no Proxy: ES5-safe).
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
