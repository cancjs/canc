import { ITimers } from '../../_toolbox';
import { isSupersededError } from './errors';
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

describe('throttle (native): per-call timers', () => {
  it('an injected pair receives the setTimeout and the matching clearTimeout for a call superseded before firing', async () => {
    const pair = createFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);

      return Promise.resolve(x);
    };
    const throttled = throttle(fn, 100, { ...pair.timers });

    throttled(1).then(undefined, () => undefined);
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

      return Promise.resolve(x);
    };
    const throttled = throttle(fn, 100, { ...pair.timers });

    throttled(1).then(undefined, () => undefined);
    throttled(2).then(undefined, () => undefined);
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

      return Promise.resolve(x);
    };

    const cancelThrottled = throttle(fn, 100, { ...pair.timers });
    cancelThrottled(1).then(undefined, () => undefined);
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

describe('throttle (native)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leading (default): first call invokes immediately', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const throttled = throttle(fn, 100);

    throttled();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('rate limiting: max 1 invocation per window', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return Promise.resolve(x);
    };
    const throttled = throttle(fn, 100);

    throttled(1).then(undefined, () => undefined);
    throttled(2).then(undefined, () => undefined);
    throttled(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1, 3]);
  });

  it('leading:false: only trailing', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
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

  it('trailing:false: only leading', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return Promise.resolve(x);
    };
    const throttled = throttle(fn, 100, { trailing: false });

    const p1 = throttled(1);
    const p2 = throttled(2);
    const p3 = throttled(3);

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(200);
    expect(await p1).toBe(1);
    const reason2 = await p2.then(undefined, (e) => e);
    const reason3 = await p3.then(undefined, (e) => e);
    expect(isSupersededError(reason2)).toBe(true);
    expect(isSupersededError(reason3)).toBe(true);

    expect(calls).toEqual([1]);
  });

  it('.cancel() clears pending', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const throttled = throttle(fn, 100);

    throttled();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    throttled().then(undefined, () => undefined);
    throttled.cancel();
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('.flush() invokes immediately', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => Promise.resolve(x * 3);
    const throttled = throttle(fn, 100);

    throttled(4);
    const p = throttled.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(12);
  });

  it('.isPending reflects timer state', () => {
    jest.useFakeTimers();
    const fn = () => Promise.resolve(1);
    const throttled = throttle(fn, 100);

    expect(throttled.isPending).toBe(false);
    throttled();
    expect(throttled.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(throttled.isPending).toBe(false);
  });

  it('returns a plain native Promise', () => {
    const fn = () => Promise.resolve(1);
    const throttled = throttle(fn, 100);
    const p = throttled();
    expect(p).toBeInstanceOf(Promise);
    expect('cancel' in p).toBe(false);
  });

  // the native twin has no cancel surface, so the value arriving is the whole assertion here
  it('leading (default): a superseding call leaves the leading call that already ran alone', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);

      return new Promise<string>((resolve) => {
        setTimeout(() => resolve(x.toUpperCase()), 200);
      });
    };
    const throttled = throttle(fn, 50);

    const pa = throttled('a');
    jest.advanceTimersByTime(5);
    const pb = throttled('b');

    jest.advanceTimersByTime(300);
    expect(await pa).toBe('A');

    jest.advanceTimersByTime(300);
    expect(await pb).toBe('B');
    expect(calls).toEqual(['a', 'b']);
  });

  it('leading: a superseding call leaves the trailing call that already ran alone', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve(x.toUpperCase()), 200);
      });
    };
    const throttled = throttle(fn, 50, { leading: true });

    const pa = throttled('a');
    jest.advanceTimersByTime(5);
    const pb = throttled('b');

    jest.advanceTimersByTime(300);
    expect(await pa).toBe('A');
    expect(await pb).toBe('B');

    const pc = throttled('c');
    jest.advanceTimersByTime(300);
    expect(await pc).toBe('C');
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('leading (default): the leading edge fires again after a quiet period', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);
      return Promise.resolve(x);
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

  // Once invoke() has adopted a thenable, `pendingReject` is gone and the native twin has no cancel
  // surface, so an in-flight supersede is a no-op here by construction, not by choice.
  // an unhandled rejection anywhere in here fails the whole suite, so the supersede raising one
  // on the unclaimed promise would be caught by this test running at all
  it('a pending call rejects on supersede, an in-flight one runs on and settles its caller', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);

      return new Promise<string>((resolve) => {
        setTimeout(() => resolve(x.toUpperCase()), 200);
      });
    };
    const throttled = throttle(fn, 50, { leading: false });

    const pa = throttled('a');
    const pb = throttled('b'); // supersede while 'a' is still waiting out its timer

    const reasonA = await pa.then(undefined, (e: unknown) => e);
    expect(isSupersededError(reasonA)).toBe(true);

    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['b']);

    const pc = throttled('c'); // supersede while 'b' is in flight

    jest.advanceTimersByTime(300); // long enough for a re-invoked 'b' to show up
    expect(await pb).toBe('B');
    expect(await pc).toBe('C');
    expect(calls).toEqual(['b', 'c']);
  });
});
