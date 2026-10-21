import { makeCancelSignal } from '../../_toolbox';
import { createErrorClass, isCancelError } from '../../_util';
import { promisify } from './index';

// this twin ships no CancelError, so the spec mints one carrying the shared brand
const CancelError = createErrorClass('CancelError', '@cancjs/promise:CancelError');

function captureHandleCancel() {
  const state: { onCancel?: (reason?: any) => void } = {};
  const handleCancel = (onCancel: (reason?: any) => void) => {
    state.onCancel = onCancel;
  };

  return { state, handleCancel };
}

describe('getSignal() first called after cancel', () => {
  it('makeCancelSignal returns an already aborted signal carrying the cancel reason', () => {
    const { state, handleCancel } = captureHandleCancel();
    const holder = makeCancelSignal(handleCancel);

    const reason = new CancelError('late');
    state.onCancel!(reason);

    const signal = holder.getSignal();
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
    expect(isCancelError(signal.reason)).toBe(true);
  });

  it('a lazy promisify signal captured in transformArgs and first read after abort is aborted', async () => {
    let getLater: (() => any) | undefined;
    const inbound = new AbortController();
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      lazy: true,
      signal: inbound.signal,
      transformArgs: (args, getSignal) => {
        getLater = getSignal;
        return args;
      },
    });

    const settled = fn().then(
      () => 'fulfilled',
      () => 'rejected',
    );
    await Promise.resolve();
    const reason = new CancelError('stop');
    inbound.abort(reason);
    await settled;

    const signal = getLater!();
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
  });
});

describe('signal accessor', () => {
  it('is a non-enumerable getter on the holder and on the getSignal function', () => {
    let built = 0;
    const Ctor = class {
      signal = { aborted: false };
      constructor() {
        built++;
      }
      abort() {
        this.signal.aborted = true;
      }
    };
    const holder = makeCancelSignal(() => undefined, Ctor);

    expect(Object.keys(holder)).not.toContain('signal');
    expect('signal' in { ...holder }).toBe(false);
    expect(Object.keys(holder.getSignal)).not.toContain('signal');
    JSON.stringify(holder);
    expect(built).toBe(0);

    expect(holder.signal).toBe(holder.getSignal());
    expect(holder.getSignal.signal).toBe(holder.signal);
    expect(built).toBe(1);
  });

  it('a lazy promisify transformArgs can destructure signal off getSignal', async () => {
    let injected: any;
    const inbound = new AbortController();
    const fn = promisify((_opts: unknown, _cb: (err: unknown) => void) => undefined, {
      lazy: true,
      signal: inbound.signal,
      transformArgs: (args, { signal }) => {
        injected = signal;
        return [{ signal }];
      },
    });

    const settled = fn().then(
      () => 'fulfilled',
      () => 'rejected',
    );
    await Promise.resolve();
    inbound.abort(new CancelError('stop'));
    await settled;
    expect(injected.aborted).toBe(true);
  });
});

describe('promisify signal accessor gate', () => {
  async function abortWith(transformArgs: (args: any[]) => any[]) {
    const inbound = new AbortController();
    const fn = promisify((_cb: (err: unknown) => void) => undefined, {
      lazy: true,
      signal: inbound.signal,
      transformArgs,
    });
    const settled = fn().then(
      () => 'fulfilled',
      () => 'rejected',
    );
    await Promise.resolve();
    inbound.abort(new CancelError('stop'));
    await settled;
  }

  it('installs it for hooks of length 1 that mention the signal', async () => {
    const seen: any[] = [];
    const sink = (signal: unknown) => {
      seen.push(signal);
    };
    // the es5 spec build would lower the default and grow length to 2, so build it untranspiled
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- needs a native default parameter
    const defaulted = new Function('sink', 'return (args, { signal } = {}) => { sink(signal); return args; };')(
      sink,
    ) as (args: any[]) => any[];
    expect(defaulted.length).toBe(1);
    await abortWith(defaulted);
    await abortWith(function (args) {
      // eslint-disable-next-line prefer-rest-params
      sink(arguments[1].signal);
      return args;
    });
    await abortWith((args, ...rest: any[]) => {
      sink(rest[0].signal);
      return args;
    });
    expect(seen).toHaveLength(3);
    for (const signal of seen) {
      expect(signal.aborted).toBe(true);
    }
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
