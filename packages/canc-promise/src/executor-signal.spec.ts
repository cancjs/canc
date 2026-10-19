import { inspect } from 'util';

import type {
  CancelablePromise as TCancelablePromise,
  IExecutorContext,
  TCancelablePromiseExecutor,
} from './cancelable-promise';
import type { isCancelError as TIsCancelError } from './helpers';

const RealAbortController = globalThis.AbortController;
let constructed = 0;

// a plain function, the es5 test build cannot subclass the native class
const CountingAbortController = function CountingAbortController(): AbortController {
  constructed++;
  return new RealAbortController();
} as unknown as typeof AbortController;

let CancelablePromise: typeof TCancelablePromise;
let isCancelError: typeof TIsCancelError;

beforeAll(() => {
  globalThis.AbortController = CountingAbortController;
  jest.isolateModules(() => {
    CancelablePromise = (require('./cancelable-promise') as { CancelablePromise: typeof TCancelablePromise })
      .CancelablePromise;
    isCancelError = (require('./helpers') as { isCancelError: typeof TIsCancelError }).isCancelError;
  });
});

afterAll(() => {
  globalThis.AbortController = RealAbortController;
});

beforeEach(() => {
  constructed = 0;
});

function captureCtx(): { promise: TCancelablePromise<number>; ctx: IExecutorContext<number> } {
  let ctx: IExecutorContext<number> | undefined;
  const promise = new CancelablePromise<number>((_resolve, _reject, executorCtx) => {
    ctx = executorCtx;
  });
  return { promise, ctx: ctx! };
}

describe('executor context signal accessor', () => {
  it('is an inherited non-enumerable getter, not an own property', () => {
    const { ctx } = captureCtx();
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'signal');

    expect(Object.prototype.hasOwnProperty.call(ctx, 'signal')).toBe(false);
    expect(descriptor).toBeDefined();
    expect(descriptor!.enumerable).toBe(false);
    expect(typeof descriptor!.get).toBe('function');
    expect(descriptor!.set).toBeUndefined();
    expect(constructed).toBe(0);
  });

  it('keys, spread, JSON and inspect never construct an AbortController', () => {
    const { ctx } = captureCtx();

    expect(Object.keys(ctx)).not.toContain('signal');
    expect({ ...ctx }).not.toHaveProperty('signal');
    expect(JSON.stringify(ctx)).toBe('{}');
    expect(inspect(ctx)).not.toContain('signal');
    expect(constructed).toBe(0);
  });

  it('constructing a promise does not construct an AbortController', () => {
    const promise = new CancelablePromise<number>((resolve) => resolve(1));

    expect(promise).toBeInstanceOf(CancelablePromise);
    expect(constructed).toBe(0);
  });

  it('returns the same signal as getSignal and allocates one controller', () => {
    const { ctx } = captureCtx();
    const signal = ctx.signal;

    expect(ctx.getSignal()).toBe(signal);
    expect(ctx.signal).toBe(signal);
    expect(constructed).toBe(1);
  });

  it('works when destructured in the executor', () => {
    let seen: unknown;
    const promise = new CancelablePromise<number>((resolve, _reject, { signal }) => {
      seen = signal;
      resolve(1);
    });

    expect((seen as { aborted: boolean }).aborted).toBe(false);
    expect(constructed).toBe(1);
    return promise;
  });

  it('detached getSignal returns the accessor signal', () => {
    const { ctx } = captureCtx();
    const { getSignal } = ctx;

    expect(getSignal()).toBe(ctx.signal);
    expect(constructed).toBe(1);
  });

  it('read after cancel is aborted with the cancel error as reason', async () => {
    const { promise, ctx } = captureCtx();
    const settled = promise.catch((error: unknown) => error);

    promise.cancel();
    const signal = ctx.signal;

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason).toBe(await settled);
  });

  it('read before cancel aborts on cancel with the cancel error as reason', async () => {
    const { promise, ctx } = captureCtx();
    const signal = ctx.signal;
    const settled = promise.catch((error: unknown) => error);

    expect(signal.aborted).toBe(false);
    promise.cancel();

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason).toBe(await settled);
  });

  it('a subclass wrapping the executor reads the context on a then child', async () => {
    const seen: boolean[] = [];

    class WrappingPromise<T> extends CancelablePromise<T> {
      constructor(executor: TCancelablePromiseExecutor<T>) {
        super((resolve, reject, ctx) => {
          ctx.handleCancel(() => undefined);
          seen.push(ctx.getSignal().aborted);
          executor(resolve, reject, ctx);
        });
      }
    }

    const child = new WrappingPromise<number>((resolve) => resolve(1)).then((value) => value + 1);

    expect(child).toBeInstanceOf(WrappingPromise);
    expect(seen).toEqual([false, false]);
    expect(await child).toBe(2);
  });

  it('a subclass destructuring signal from the context works on a then child', async () => {
    const seen: unknown[] = [];

    class SignalPromise<T> extends CancelablePromise<T> {
      constructor(executor: TCancelablePromiseExecutor<T>) {
        super((resolve, reject, ctx) => {
          const { signal } = ctx;
          // read later, a throw here on the then path escapes as uncaught
          seen.push(signal);
          executor(resolve, reject, ctx);
        });
      }
    }

    const child = new SignalPromise<number>((resolve) => resolve(1)).then((value) => value + 1);

    expect(child).toBeInstanceOf(SignalPromise);
    expect(seen.map((signal) => (signal as AbortSignal | undefined)?.aborted)).toEqual([false, false]);
    expect(await child).toBe(2);
  });
});
