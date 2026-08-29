import { ITimers } from '../../_toolbox';
import { debounce } from './debounce';
import { isSupersededError, SupersededError } from './errors';

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

    debounced(1).then(undefined, () => undefined);
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
    expect(pair.clearTimeout).toHaveBeenCalledTimes(2);
  });

  it('.cancel() clears through the injected pair and .flush() fires without waiting', async () => {
    const pair = createFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;

      return Promise.resolve(x);
    };

    const cancelDebounced = debounce(fn, 100, { ...pair.timers });
    cancelDebounced(1).then(undefined, () => undefined);
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

    debounced(1).then(undefined, () => undefined);
    debounced(2).then(undefined, () => undefined);
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

    debounced(1).then(undefined, () => undefined);
    debounced(2).then(undefined, () => undefined);
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

    debounced().then(undefined, () => undefined);
    jest.advanceTimersByTime(80);
    debounced();
    jest.advanceTimersByTime(70);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('leading:false + trailing:false: fn never called', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100, { leading: false, trailing: false });

    const p = debounced();
    jest.advanceTimersByTime(200);

    const reason = await p.then(undefined, (e) => e);
    expect(isSupersededError(reason)).toBe(true);
    expect(callCount).toBe(0);
  });

  it('.cancel() clears timer', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100);

    debounced().then(undefined, () => undefined);
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

  // the native twin has no cancel surface, so the value arriving is the whole assertion here
  it('leading: a superseding call leaves the leading call that already ran alone', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);

      return new Promise<string>((resolve) => {
        setTimeout(() => resolve(x.toUpperCase()), 200);
      });
    };
    const debounced = debounce(fn, 50, { leading: true });

    const pa = debounced('a');
    jest.advanceTimersByTime(5);
    const pb = debounced('b');

    jest.advanceTimersByTime(300);
    expect(await pa).toBe('A');

    jest.advanceTimersByTime(300);
    expect(await pb).toBe('B');
    expect(calls).toEqual(['a', 'b']);
  });

  it('leading: the leading edge fires again after a quiet period', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);
      return Promise.resolve(x);
    };
    const debounced = debounce(fn, 50, { leading: true });

    debounced('a');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['a']);

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['a']);

    const pb = debounced('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['a', 'b']);
    expect(await pb).toBe('b');
  });

  // The native twin's in-flight result has no `cancel`.
  // Once a call is invoked its wrapper promise has already adopted that result.
  // So the regression reduces to: a pending supersede still rejects.
  // And a supersede after invoke causes no second invoke.
  it('regression: a pending call rejects on supersede, an in-flight one is not re-invoked', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);

      return new Promise<string>(() => undefined); // never settles on its own
    };
    const debounced = debounce(fn, 50);

    const pa = debounced('a');

    debounced('b'); // supersede while 'a' is still pending (pre-invoke)

    const reasonA = await pa.then(undefined, (e: unknown) => e);
    expect(isSupersededError(reasonA)).toBe(true);

    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['b']); // 'b' invoked once, not re-invoked by a later supersede

    debounced('c'); // supersede while 'b' is in flight: no throw, no second invoke of 'b'
    expect(calls).toEqual(['b']);
  });

  // simulates a second package copy: no shared prototype, only the registry symbol
  it('isSupersededError matches a hand-built cross-copy object by brand alone', () => {
    const SUPERSEDED_ERROR_BRAND = Symbol.for('@cancjs/toolbox:SupersededError');
    const other = Object.create(null) as Record<symbol, unknown>;
    other[SUPERSEDED_ERROR_BRAND] = true;

    expect(isSupersededError(other)).toBe(true);
    expect(other instanceof SupersededError).toBe(false);
  });
});
