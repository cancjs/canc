import { CancelablePromise, isCancelError } from '@cancjs/promise';

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

describe('debounce: per-call timers', () => {
  it('an injected pair receives the setTimeout and the matching clearTimeout for a call superseded before firing', async () => {
    const pair = createFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x);
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

      return CancelablePromise.resolve(callCount);
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

      return CancelablePromise.resolve(x);
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

describe('debounce', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('trailing: invokes fn once after quiet period', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
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
    const fn = (x: number) => CancelablePromise.resolve(x * 10);
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
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    const p = debounced(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    const result = await p;
    expect(result).toBe(1);
  });

  it('leading: suppresses subsequent calls during window', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced(1);
    debounced(2);
    debounced(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('leading + trailing: first invokes, last invokes after quiet', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: true });

    debounced(1);
    debounced(2);
    debounced(3);

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1, 3]);
  });

  it('maxWait: forces invocation even with continuous calls', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(callCount);
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

  it('maxWait: a trailing invoke leaves no pending work behind', async () => {
    jest.useFakeTimers();
    const calls: number[] = [];
    const fn = (x: number) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
    };
    const debounced = debounce(fn, 50, { maxWait: 100 });

    debounced(1);
    jest.advanceTimersByTime(40);
    debounced(2);
    jest.advanceTimersByTime(60);
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual([2]);
    expect(debounced.isPending).toBe(false);
    expect(debounced.flush()).toBeUndefined();
  });

  it('.cancel() clears timer and rejects pending with CancelError', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve('done');
    };
    const debounced = debounce(fn, 100);

    const _p = debounced();
    debounced.cancel();

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(0);
  });

  it('.flush() invokes immediately with latest args', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x * 2);
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(5);
    const p = debounced.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(10);
  });

  it('.isPending is true during wait, false after', async () => {
    jest.useFakeTimers();
    const fn = () => CancelablePromise.resolve(1);
    const debounced = debounce(fn, 100);

    expect(debounced.isPending).toBe(false);
    debounced();
    expect(debounced.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(debounced.isPending).toBe(false);
  });

  it('cancel propagation: canceling returned promise cancels in-flight fn', async () => {
    jest.useFakeTimers();
    let innerCanceled = false;
    const fn = () =>
      new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
        if (handleCancel)
          handleCancel(() => {
            innerCanceled = true;
          });
      });
    const debounced = debounce(fn, 50);

    const p = debounced() as CancelablePromise<string>;
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();

    p.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(innerCanceled).toBe(true);
  });

  it('superseded call: previous promise receives CancelError', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => CancelablePromise.resolve(x);
    const debounced = debounce(fn, 100);

    const p1 = debounced(1);
    const p2 = debounced(2);

    const reason1 = await (p1 as CancelablePromise<number>).catch((e: any) => e);
    expect(isCancelError(reason1)).toBe(true);

    jest.advanceTimersByTime(100);
    const result2 = await p2;
    expect(result2).toBe(2);
  });

  it('fn throws: returned promise rejects with that error', async () => {
    jest.useFakeTimers();
    const err = new Error('boom');
    const fn = () => {
      throw err;
    };
    const debounced = debounce(fn, 50);

    const p = debounced();
    jest.advanceTimersByTime(50);

    const reason = await (p as unknown as CancelablePromise<any>).catch((e: any) => e);
    expect(reason).toBe(err);
  });

  it('leading:false + trailing:false: fn never called', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const debounced = debounce(fn, 100, { leading: false, trailing: false });

    const p = debounced();
    jest.advanceTimersByTime(200);

    const reason = await (p as unknown as CancelablePromise<number>).catch((e: any) => e);
    expect(isCancelError(reason)).toBe(true);
    expect(callCount).toBe(0);
  });

  it('zero ms: still debounces via setTimeout(0)', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return CancelablePromise.resolve(1);
    };
    const debounced = debounce(fn, 0);

    debounced();
    debounced();
    expect(callCount).toBe(0);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('returned promise is CancelablePromise', () => {
    const fn = () => CancelablePromise.resolve(1);
    const debounced = debounce(fn, 100);
    const p = debounced();
    expect(p).toBeInstanceOf(CancelablePromise);
    (p as CancelablePromise<number>).cancel();
  });

  it('leading: a superseding call leaves the leading call that already ran alone', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);

      return new CancelablePromise<string>((resolve) => {
        // still in flight when the next call arrives, so canceling it would be observable
        setTimeout(() => resolve(x.toUpperCase()), 200);
      });
    };
    const debounced = debounce(fn, 50, { leading: true });

    const pa = debounced('a');
    jest.advanceTimersByTime(5);
    debounced('b');

    jest.advanceTimersByTime(300);
    const outcomeA = await (pa as CancelablePromise<string>).then(
      (v) => v,
      (e: any) => e,
    );
    expect(isCancelError(outcomeA)).toBe(false);
    expect(outcomeA).toBe('A');
    expect(calls).toEqual(['a', 'b']);
  });

  it('leading: the leading edge fires again after a quiet period', async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const fn = (x: string) => {
      calls.push(x);
      return CancelablePromise.resolve(x);
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

  it('a superseding call cancels a call whose result has not settled', async () => {
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
    const debounced = debounce(fn, 50);

    const pa = debounced('a');
    const pb = debounced('b'); // supersede while 'a' is still waiting out its timer

    const reasonA = await (pa as CancelablePromise<string>).catch((e: any) => e);
    expect(isCancelError(reasonA)).toBe(true);

    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();
    // 'b' has now been invoked and is in flight, never settling by itself

    const pc = debounced('c'); // supersede while 'b' is in flight

    const reasonB = await (pb as CancelablePromise<string>).catch((e: any) => e);
    expect(isCancelError(reasonB)).toBe(true);
    expect(bCanceled).toBe(true);

    jest.advanceTimersByTime(50);
    const resultC = await pc;
    expect(resultC).toBe('c');
  });

  it('a superseding call keeps a call whose result already settled', async () => {
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
          setTimeout(() => resolve('B'), 10);
          return;
        }
        resolve(x);
      });
    const debounced = debounce(fn, 50);

    const pa = debounced('a');
    const pb = debounced('b');
    await (pa as CancelablePromise<string>).catch(() => undefined);

    jest.advanceTimersByTime(50); // the trailing edge invokes 'b'
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(10); // 'b' settles before anything supersedes it
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const pc = debounced('c');

    expect(await pb).toBe('B');
    expect(bCanceled).toBe(false);

    jest.advanceTimersByTime(50);
    expect(await pc).toBe('c');
  });

  it('a settled leading call releases its promise, so flush has nothing left to return', async () => {
    jest.useFakeTimers();
    const debounced = debounce((x: string) => CancelablePromise.resolve(x), 50, { leading: true });

    const pa = debounced('a');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(await pa).toBe('a');

    expect(debounced.isPending).toBe(true); // the window is still open, but nothing is waiting in it
    expect(debounced.flush()).toBeUndefined();
  });

  it('a superseding call cancels the wrapper of an in-flight result that has no cancel surface', async () => {
    jest.useFakeTimers();
    // 'a' resolves through a plain promise with no cancel surface, and never settles on its own,
    // so it stays genuinely in flight once 'b' supersedes it
    const fn = (x: string) => (x === 'a' ? new Promise<string>(() => undefined) : Promise.resolve(x));
    const debounced = debounce(fn, 50);

    const pa = debounced('a');
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();

    const pb = debounced('b');

    const reasonA = await (pa as CancelablePromise<string>).catch((e: any) => e);
    expect(isCancelError(reasonA)).toBe(true);

    jest.advanceTimersByTime(50);
    const resultB = await pb;
    expect(resultB).toBe('b');
  });

  it('cancels an in-flight trailing invocation when a later call arrives before settlement', async () => {
    jest.useFakeTimers();
    let rejectBoom: ((err: Error) => void) | undefined;
    const fn = (x: string) => {
      if (x === 'boom') {
        return new Promise<string>((_resolve, reject) => {
          rejectBoom = reject;
        });
      }
      return Promise.resolve(x);
    };
    const debounced = debounce(fn, 50, { leading: false });

    const pBoom = debounced('boom');
    jest.advanceTimersByTime(50);

    // fn has run and its result is still pending, so the superseding call stops it
    const pNext = debounced('next');

    const err = await (pBoom as CancelablePromise<string>).catch((e: unknown) => e);
    expect(isCancelError(err)).toBe(true);

    // the superseded call already settled, so its own later rejection reaches nobody
    if (rejectBoom) rejectBoom(new Error('async boom'));

    jest.advanceTimersByTime(50);
    expect(await pNext).toBe('next');
  });

  it('flush returns undefined in the dead window after trailing invocation', async () => {
    jest.useFakeTimers();
    const fn = jest.fn((x: string) => x);
    const debounced = debounce(fn, 50, { maxWait: 100 });

    debounced('first');
    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    expect(debounced.flush()).toBeUndefined();
  });
});
