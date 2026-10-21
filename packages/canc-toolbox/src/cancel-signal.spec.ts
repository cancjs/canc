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

// the `signal` getter on a getSignal function, own or inherited
function signalGetter(fn: object): (() => unknown) | undefined {
  for (let o: object | null = fn; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, 'signal');
    if (descriptor) {
      return descriptor.get;
    }
  }
  return undefined;
}

describe('signal accessor', () => {
  it('is a non-enumerable getter on the cancelify context; spread and JSON never build a controller', async () => {
    const { ctor } = makeSpyControllerCtor();
    let checked = false;
    const wrapped = cancelify(
      (ctx) => {
        expect(Object.keys(ctx)).not.toContain('signal');
        expect(Object.getOwnPropertyDescriptor(ctx, 'signal')).toBeUndefined();
        const copy = { ...ctx };
        JSON.stringify(ctx);
        expect('signal' in copy).toBe(false);
        expect(ctor).not.toHaveBeenCalled();

        expect(ctx.signal).toBe(ctx.getSignal());
        expect(ctor).toHaveBeenCalledTimes(1);
        checked = true;
        return 1;
      },
      { AbortController: ctor },
    );

    await wrapped();
    expect(checked).toBe(true);
  });

  it('cancelify contexts share one inherited getter', async () => {
    const contexts: object[] = [];
    const wrapped = cancelify((ctx) => {
      contexts.push(ctx);
      return 1;
    });

    await wrapped();
    await wrapped();
    const [a, b] = contexts;
    expect(Object.getPrototypeOf(a)).toBe(Object.getPrototypeOf(b));
    expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(a), 'signal')!.get).toBeInstanceOf(Function);
  });

  it('cancelify destructured signal aborts on cancel with a CancelError', async () => {
    let signal: any;
    const wrapped = cancelify(({ signal: s }) => {
      signal = s;
      return new Promise<never>(() => {});
    });

    const promise = wrapped();
    promise.cancel();
    await promise.catch(() => undefined);
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
  });

  it('is a non-enumerable getter on the holder returning getSignal()', () => {
    const { ctor } = makeSpyControllerCtor();
    const holder = makeCancelSignal((() => undefined) as any, ctor, toCancelError);

    expect(Object.keys(holder)).not.toContain('signal');
    expect('signal' in { ...holder }).toBe(false);
    JSON.stringify(holder);
    expect(ctor).not.toHaveBeenCalled();

    expect(holder.signal).toBe(holder.getSignal());
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('is readable off the getSignal function itself, sharing one getter', () => {
    const { ctor } = makeSpyControllerCtor();
    const first = makeCancelSignal((() => undefined) as any, ctor).getSignal;
    const second = makeCancelSignal((() => undefined) as any, ctor).getSignal;

    expect(Object.keys(first)).not.toContain('signal');
    expect(ctor).not.toHaveBeenCalled();
    expect(first.signal).toBe(first());
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(signalGetter(first)).toBeDefined();
    expect(signalGetter(first)).toBe(signalGetter(second));
  });

  it('promisify hooks reaching getSignal through rest parameters still see signal', async () => {
    const seen: unknown[] = [];
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      transformArgs: (...hookArgs: any[]) => {
        seen.push(hookArgs[1].signal, hookArgs[1]());
        return hookArgs[0];
      },
    });
    const p = fn();
    expect(seen[0]).toBeDefined();
    expect(seen[0]).toBe(seen[1]);
    p.cancel();
    await expect(p).rejects.toBeDefined();
  });

  it('promisify hooks without a getSignal parameter still get a callable one', async () => {
    let signal: any;
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      transformArgs: function (args) {
        // eslint-disable-next-line prefer-rest-params
        signal = arguments[1]();
        return args;
      },
    });
    const p = fn();
    p.cancel();
    await expect(p).rejects.toBeDefined();
    expect(signal.aborted).toBe(true);
  });

  it('reads undefined on the holder and the function when there is no handleCancel', () => {
    const holder = makeCancelSignal(undefined);
    expect(holder.signal).toBeUndefined();
    expect(holder.getSignal.signal).toBeUndefined();
  });

  it('promisify hooks can destructure signal off the positional getSignal', async () => {
    let injected: any;
    const fn = promisify((_opts: unknown, _cb: (err: unknown) => void) => undefined, {
      transformArgs: (args, { signal }) => {
        injected = signal;
        return [{ signal }];
      },
    });

    const promise = fn() as CancelablePromise<unknown>;
    promise.cancel();
    await promise.catch(() => undefined);
    expect(injected.aborted).toBe(true);
  });
});

describe('getSignal function shape', () => {
  function build() {
    const created: unknown[] = [];
    const ctor = jest.fn(function SpyController(this: any) {
      this.signal = { aborted: false };
      this.abort = () => undefined;
      created.push(this.signal);
    }) as unknown as new () => { abort(reason?: any): void; signal: any };
    return { ctor, created };
  }

  it('is a real function that supports call, apply and bind', () => {
    const { ctor } = build();
    const getSignal = makeCancelSignal((() => undefined) as any, ctor).getSignal;

    expect(getSignal instanceof Function).toBe(true);
    expect(typeof getSignal).toBe('function');
    const signal = getSignal();
    expect(getSignal.call(undefined)).toBe(signal);
    expect(getSignal.apply(undefined, [])).toBe(signal);
    expect(getSignal.bind(undefined)()).toBe(signal);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('keeps the same behavior when the bind based accessor is unavailable', () => {
    const { ctor } = build();
    const original = Object.setPrototypeOf;
    let isolated!: typeof import('../../_toolbox/cancel-signal');
    (Object as any).setPrototypeOf = undefined;
    try {
      jest.isolateModules(() => {
        isolated = require('../../_toolbox/cancel-signal');
      });
    } finally {
      Object.setPrototypeOf = original;
    }

    const getSignal = isolated.makeCancelSignal((() => undefined) as any, ctor).getSignal;
    expect(Object.getOwnPropertyDescriptor(getSignal, 'signal')).toEqual(
      expect.objectContaining({ enumerable: false, configurable: true }),
    );
    expect(Object.keys(getSignal)).not.toContain('signal');
    expect({ ...getSignal }).toEqual({});
    expect(JSON.stringify({ getSignal })).toBe('{}');
    expect(ctor).not.toHaveBeenCalled();
    expect(getSignal.signal).toBe(getSignal());
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(getSignal instanceof Function).toBe(true);
    expect(getSignal.call(undefined)).toBe(getSignal.signal);
  });
});
