import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { ITimers } from '../../_toolbox';
import { throttle } from './throttle';

interface IFakeTimers {
  timers: ITimers;
  setTimeout: jest.Mock<number, [handler: () => void, ms?: number]>;
  clearTimeout: jest.Mock<void, [handle: unknown]>;
  advance(ms: number): void;
}

/** A timers pair on a virtual clock, so scheduling is provably routed through the call, not the ambient. */
function createFakeTimers(): IFakeTimers {
  const scheduled: Array<{ id: number; due: number; handler: () => void }> = [];
  let now = 0;
  let nextId = 1;

  const setTimeoutMock = jest.fn((handler: () => void, ms?: number) => {
    const id = nextId++;

    scheduled.push({ id, due: now + (ms ?? 0), handler });

    return id;
  });

  const clearTimeoutMock = jest.fn((handle: unknown) => {
    const index = scheduled.findIndex((entry) => entry.id === handle);

    if (index >= 0) scheduled.splice(index, 1);
  });

  return {
    timers: { setTimeout: setTimeoutMock, clearTimeout: clearTimeoutMock },
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
    advance: (ms: number) => {
      now += ms;

      for (;;) {
        const due = scheduled.filter((entry) => entry.due <= now).sort((a, b) => a.due - b.due)[0];

        if (!due) return;

        scheduled.splice(scheduled.indexOf(due), 1);
        due.handler();
      }
    },
  };
}

describe('throttle: per-call timers', () => {
  it('an injected pair receives the setTimeout and the matching clearTimeout for a call superseded before firing', async () => {
    const pair = createFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);

      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100, { ...pair.timers });

    throttled(1);
    const trailingHandle = pair.setTimeout.mock.results[0].value;

    throttled(2);

    expect(pair.setTimeout).toHaveBeenCalled();
    expect(pair.clearTimeout).toHaveBeenCalledWith(trailingHandle);

    pair.advance(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual([1, 2]);
  });

  it('maxWait schedules through the same injected pair', async () => {
    const pair = createFakeTimers();
    const ambient = jest.spyOn(globalThis, 'setTimeout');
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);

      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100, { ...pair.timers });

    throttled(1);
    throttled(2);
    throttled(3);

    expect(pair.setTimeout).toHaveBeenCalled();
    expect(ambient).not.toHaveBeenCalled();
    expect(calls).toEqual([1]);

    pair.advance(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual([1, 3]);

    ambient.mockRestore();
  });

  it('.cancel() clears through the injected pair and .flush() fires without waiting', async () => {
    const pair = createFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);

      return CancelablePromise.resolve(x);
    };

    const cancelThrottled = throttle(fn, 100, { ...pair.timers });
    cancelThrottled(1);
    cancelThrottled.cancel();
    expect(pair.clearTimeout).toHaveBeenCalled();

    const flushThrottled = throttle(fn, 100, { ...pair.timers, leading: false });
    const p = flushThrottled(2);
    const flushed = flushThrottled.flush();

    expect(flushed).toBe(p);
    const result = await flushed!;
    expect(result).toBe(2);
  });
});

describe('throttle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leading (default): first call invokes immediately', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    const p = throttled(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    const result = await p;
    expect(result).toBe(1);
  });

  it('rate limiting: max 1 invocation per window', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1, 3]);
  });

  it('trailing (default): last args invoked after window', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(5);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toContain(5);
  });

  it('leading:false: no immediate call, only trailing', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const throttled = throttle(fn, 100, { leading: false });

    throttled();
    await Promise.resolve();
    expect(callCount).toBe(0);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('trailing:false: only leading, no trailing', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 100, { trailing: false });

    throttled(1);
    throttled(2);
    throttled(3);

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(calls).toEqual([1]);
  });

  it('.cancel() clears pending', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const throttled = throttle(fn, 100);

    throttled();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    throttled();
    throttled.cancel();
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('.flush() invokes immediately', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x * 3);
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(4);
    const p = throttled.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(12);
  });

  it('.isPending reflects timer state', () => {
    jest.useFakeTimers();
    const fn = () => CancelablePromise.resolve(1);
    const throttled = throttle(fn, 100);

    expect(throttled.isPending).toBe(false);
    throttled();
    expect(throttled.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(throttled.isPending).toBe(false);
  });

  it('cancel propagation: canceling returned promise cancels in-flight', async () => {
    jest.useFakeTimers();
    let innerCanceled = false;
    const fn = () =>
      new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
        if (handleCancel)
          handleCancel(() => {
            innerCanceled = true;
          });
      });
    const throttled = throttle(fn, 50);

    const p = throttled() as CancelablePromise<string>;
    await Promise.resolve();
    await Promise.resolve();

    p.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(innerCanceled).toBe(true);
  });

  it('returned promise is CancelablePromise', () => {
    const fn = () => CancelablePromise.resolve(1);
    const throttled = throttle(fn, 100);
    const p = throttled();
    expect(p).toBeInstanceOf(CancelablePromise);
    (p as CancelablePromise<number>).cancel();
  });

  it('leading (default): a superseding call leaves the leading call that already ran alone', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);

      return new CancelablePromise<string>((resolve) => {
        // still in flight when the next call arrives, so canceling it would be observable
        setTimeout(() => resolve(x.toUpperCase()), 200);
      });
    };
    const throttled = throttle(fn, 50);

    const pa = throttled('a');
    jest.advanceTimersByTime(5);
    const pb = throttled('b');

    jest.advanceTimersByTime(300);
    const outcomeA = await (pa as CancelablePromise<string>).then(
      (v) => v,
      (e: any) => e,
    );
    expect(isCancelError(outcomeA)).toBe(false);
    expect(outcomeA).toBe('A');

    jest.advanceTimersByTime(300);
    expect(await pb).toBe('B');
    expect(calls).toEqual(['a', 'b']);
  });

  it('leading (default): the leading edge fires again after a quiet period', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const throttled = throttle(fn, 50);

    throttled('a');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['a']);

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['a']);

    const pb = throttled('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['a', 'b']);
    expect(await pb).toBe('b');
  });

  it('leading (default): canceling a superseded leading call stops only its own work', async () => {
    jest.useFakeTimers();
    let aCanceled = false;
    const fn = (x: string) =>
      new CancelablePromise<string>((resolve, _reject, { handleCancel }) => {
        if (x === 'a') {
          if (handleCancel) {
            handleCancel(() => {
              aCanceled = true;
            });
          }
          return; // 'a' never settles on its own, only via cancel
        }
        resolve(x);
      });
    const throttled = throttle(fn, 50);

    const pa = throttled('a') as CancelablePromise<string>;
    jest.advanceTimersByTime(5);
    const pb = throttled('b');

    pa.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(aCanceled).toBe(true);
    expect(throttled.isPending).toBe(true);

    jest.advanceTimersByTime(50);
    expect(await pb).toBe('b');
  });

  it('regression: a superseding call cancels an in-flight call (inherited from debounce)', async () => {
    jest.useFakeTimers();
    let bCanceled = false;
    const fn = (x: string) =>
      new CancelablePromise<string>((resolve, _reject, { handleCancel }) => {
        if (x === 'b') {
          if (handleCancel) {
            handleCancel(() => {
              bCanceled = true;
            });
          }
          return; // 'b' never settles on its own, only via cancel
        }
        resolve(x);
      });
    const throttled = throttle(fn, 50, { leading: false });

    const pa = throttled('a');
    const pb = throttled('b'); // supersede while 'a' is still pending (pre-invoke)

    const reasonA = await (pa as CancelablePromise<string>).catch((e: any) => e);
    expect(isCancelError(reasonA)).toBe(true);

    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();
    // 'b' has now been invoked and is in flight, never settling by itself

    const pc = throttled('c'); // supersede while 'b' is in flight

    const reasonB = await (pb as CancelablePromise<string>).catch((e: any) => e);
    expect(isCancelError(reasonB)).toBe(true);
    expect(bCanceled).toBe(true);

    jest.advanceTimersByTime(50);
    const resultC = await pc;
    expect(resultC).toBe('c');
  });
});
