import { ITimers } from '../../_toolbox';
import { debounce } from './debounce';

interface IFakeTimers {
  timers: ITimers;
  setTimeout: jest.Mock<number, [handler: () => void, ms?: number]>;
  clearTimeout: jest.Mock<void, [handle: unknown]>;
  delays: number[];
  advance(ms: number): void;
}

/** A timers pair on a virtual clock, so scheduling is provably routed through the call, not the ambient. */
function createFakeTimers(): IFakeTimers {
  const scheduled: Array<{ id: number; due: number; handler: () => void }> = [];
  const delays: number[] = [];
  let now = 0;
  let nextId = 1;

  const setTimeoutMock = jest.fn((handler: () => void, ms?: number) => {
    const id = nextId++;

    delays.push(ms ?? 0);
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
    delays,
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

describe('debounce (native): per-call timers', () => {
  it('an injected pair receives the setTimeout and the matching clearTimeout for a call superseded before firing', async () => {
    const pair = createFakeTimers();
    const fn = (x: number) => Promise.resolve(x);
    const debounced = debounce(fn, 100, { ...pair.timers });

    debounced(1);
    const firstHandle = pair.setTimeout.mock.results[0].value;

    debounced(2);

    expect(pair.setTimeout).toHaveBeenCalledTimes(2);
    expect(pair.clearTimeout).toHaveBeenCalledWith(firstHandle);

    pair.advance(100);
    await Promise.resolve();
    await Promise.resolve();
  });

  it('maxWait schedules through the injected pair', async () => {
    const pair = createFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;

      return Promise.resolve(callCount);
    };
    const debounced = debounce(fn, 100, { maxWait: 150, ...pair.timers });

    debounced();

    expect(pair.delays).toEqual([100, 150]);

    pair.advance(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(callCount).toBe(1);
    expect(pair.clearTimeout).toHaveBeenCalledTimes(1);
  });

  it('.cancel() clears through the injected pair and .flush() fires without waiting', async () => {
    const pair = createFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;

      return Promise.resolve(x);
    };

    const cancelDebounced = debounce(fn, 100, { ...pair.timers });
    cancelDebounced(1);
    cancelDebounced.cancel();
    expect(pair.clearTimeout).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(0);

    const flushDebounced = debounce(fn, 100, { ...pair.timers });
    const p = flushDebounced(5);
    const flushed = flushDebounced.flush();

    expect(flushed).toBe(p);
    const result = await flushed!;
    expect(result).toBe(5);
    expect(callCount).toBe(1);
  });
});

describe('debounce (native)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('trailing: invokes fn once after quiet period', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return Promise.resolve(x);
    };
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(2);
    debounced(3);

    expect(callCount).toBe(0);
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('trailing: resolves with last call args', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => Promise.resolve(x * 10);
    const debounced = debounce(fn, 50);

    debounced(1);
    debounced(2);
    const p = debounced(3);

    jest.advanceTimersByTime(50);
    const result = await p;
    expect(result).toBe(30);
  });

  it('leading: invokes immediately on first call', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('maxWait: forces invocation', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100, { maxWait: 150 });

    debounced();
    jest.advanceTimersByTime(80);
    debounced();
    jest.advanceTimersByTime(70);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('.cancel() clears timer', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(0);
  });

  it('.flush() invokes immediately', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => Promise.resolve(x * 2);
    const debounced = debounce(fn, 100);

    debounced(5);
    const p = debounced.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(10);
  });

  it('.isPending reflects timer state', () => {
    jest.useFakeTimers();
    const fn = () => Promise.resolve(1);
    const debounced = debounce(fn, 100);

    expect(debounced.isPending).toBe(false);
    debounced();
    expect(debounced.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(debounced.isPending).toBe(false);
  });

  it('returns a plain native Promise', () => {
    const fn = () => Promise.resolve(1);
    const debounced = debounce(fn, 100);
    const p = debounced();
    expect(p).toBeInstanceOf(Promise);
    expect('cancel' in p).toBe(false);
  });
});
