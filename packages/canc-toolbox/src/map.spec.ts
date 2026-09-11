import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { map } from './index';

// Drain the microtask queue enough times to let a canceled mapper's chain settle and any freed slot
// be pumped, without depending on the exact number of internal microtask hops.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/** A set of mappers whose start, cancellation and settlement are each driven by the test. */
interface IScript {
  readonly started: boolean[];
  readonly canceled: boolean[];
  mapper(item: string, index: number): CancelablePromise<string>;
  settle(index: number, value: string): void;
  fail(index: number, reason: any): void;
}

function script(count: number): IScript {
  const started: boolean[] = new Array(count).fill(false);
  const canceled: boolean[] = new Array(count).fill(false);
  const resolvers: ((value: string) => void)[] = [];
  const rejecters: ((reason: any) => void)[] = [];

  return {
    started,
    canceled,
    mapper(item: string, index: number) {
      started[index] = true;

      return new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
        resolvers[index] = resolve;
        rejecters[index] = reject;
        handleCancel(() => {
          canceled[index] = true;
        });
      });
    },
    settle(index: number, value: string) {
      resolvers[index](value);
    },
    fail(index: number, reason: any) {
      rejecters[index](reason);
    },
  };
}

describe('map', () => {
  it('returns results in input order even when a later item resolves first', async () => {
    const s = script(3);
    const promise = map(['a', 'b', 'c'], s.mapper);

    s.settle(2, 'c!');
    s.settle(1, 'b!');
    s.settle(0, 'a!');

    await expect(promise).resolves.toEqual(['a!', 'b!', 'c!']);
  });

  it('runs no more mappers at once than the configured concurrency', async () => {
    let current = 0;
    let peak = 0;

    const mapper = (item: number) =>
      new CancelablePromise<number>((resolve) => {
        current++;
        peak = Math.max(peak, current);

        // A couple of microtask hops, so any overlapping start would show up in `peak`.
        Promise.resolve()
          .then(() => Promise.resolve())
          .then(() => {
            current--;
            resolve(item);
          });
      });

    const results = await map([1, 2, 3, 4, 5, 6], mapper, { concurrency: 2 });

    expect(peak).toBe(2);
    expect(results).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cancels the in-flight mapper, never starts the queued ones, and rejects with a CancelError', async () => {
    const s = script(3);
    const promise = map(['a', 'b', 'c'], s.mapper, { concurrency: 1 });
    const caught = promise.catch((reason: unknown) => reason);

    expect(s.started).toEqual([true, false, false]);

    promise.cancel();

    expect(isCancelError(await caught)).toBe(true);
    expect(s.canceled[0]).toBe(true);

    await flushMicrotasks();

    expect(s.started).toEqual([true, false, false]);
  });

  it('cancels the siblings on the first rejection and rejects with the original reason', async () => {
    const s = script(3);
    const boom = new Error('boom');
    const promise = map(['a', 'b', 'c'], s.mapper);
    const caught = promise.catch((reason: unknown) => reason);

    expect(s.started).toEqual([true, true, true]);

    s.fail(1, boom);

    expect(await caught).toBe(boom);

    await flushMicrotasks();

    expect(s.canceled[0]).toBe(true);
    expect(s.canceled[2]).toBe(true);
  });

  it('stops the queue on the first rejection and does not start any more mappers', async () => {
    const s = script(6);
    const boom = new Error('boom');
    const promise = map(['a', 'b', 'c', 'd', 'e', 'f'], s.mapper, { concurrency: 2 });
    const caught = promise.catch((reason: unknown) => reason);

    expect(s.started).toEqual([true, true, false, false, false, false]);

    s.fail(0, boom);

    expect(await caught).toBe(boom);

    await flushMicrotasks();

    expect(s.started).toEqual([true, true, false, false, false, false]);
    expect(s.canceled[1]).toBe(true);
  });

  it('runs every item under stopOnError false and rejects with an AggregateError in input order', async () => {
    const s = script(4);
    const first = new Error('one');
    const second = new Error('three');
    const promise = map(['a', 'b', 'c', 'd'], s.mapper, { stopOnError: false });
    const caught = promise.catch((reason: any) => reason);

    // Failed out of order, to show the aggregate is ordered by index rather than by settlement.
    s.fail(3, second);
    s.fail(1, first);
    s.settle(0, 'a!');
    s.settle(2, 'c!');

    const error = await caught;

    expect(s.started).toEqual([true, true, true, true]);
    expect(error.name).toBe('AggregateError');
    expect(error.errors).toEqual([first, second]);
  });

  it('resolves an empty input to an empty array without calling the mapper', async () => {
    let calls = 0;
    const mapper = (item: string) => {
      calls++;
      return item;
    };

    await expect(map([] as string[], mapper)).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it('accepts a sync iterable and a mapper returning a plain value', async () => {
    const input = new Set(['a', 'b', 'c']);

    await expect(map(input, (item, index) => item + index)).resolves.toEqual(['a0', 'b1', 'c2']);
  });

  it('settles with sparse input arrays, treating holes as undefined', async () => {
    let calls = 0;
    const mapper = (item: number | undefined) => {
      calls++;
      return item;
    };

    // eslint-disable-next-line no-sparse-arrays
    const input = [1, , 3];
    await expect(map(input, mapper)).resolves.toEqual([1, undefined, 3]);
    expect(calls).toBe(3);
  });

  it('rejects with a RangeError for invalid concurrency', async () => {
    await expect(map([1, 2], (x) => x, { concurrency: 0 })).rejects.toThrow(RangeError);
    await expect(map([1, 2], (x) => x, { concurrency: -1 })).rejects.toThrow(RangeError);
    await expect(map([1, 2], (x) => x, { concurrency: 2.5 })).rejects.toThrow(RangeError);
    await expect(map([1, 2], (x) => x, { concurrency: NaN })).rejects.toThrow(RangeError);
  });

  it('stops the queue immediately if a mapper throws synchronously', async () => {
    const called: number[] = [];
    const boom = new Error('boom');
    const promise = map(
      [0, 1, 2, 3, 4, 5],
      (item, index) => {
        called.push(index);
        if (index === 0) throw boom;
        return item;
      },
      { concurrency: 2 },
    );

    await expect(promise).rejects.toBe(boom);
    expect(called).toEqual([0]);
  });

  it('does not stop the queue on a synchronous throw if stopOnError is false', async () => {
    const called: number[] = [];
    const boom = new Error('boom');
    const promise = map(
      [0, 1, 2, 3, 4, 5],
      (item, index) => {
        called.push(index);
        if (index === 0) throw boom;
        return item;
      },
      { concurrency: 2, stopOnError: false },
    );

    const error = await promise.catch((e: any) => e);
    expect(error.name).toBe('AggregateError');
    expect(error.errors).toEqual([boom]);
    expect(called).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('forwards the cancel reason by identity to the in-flight mapper when canceled', async () => {
    let observedReason: unknown;
    const customReason = { code: 'MAP_CANCEL' };

    const promise = map(
      ['a'],
      () =>
        new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
          handleCancel((reason) => {
            observedReason = reason;
          });
        }),
    );

    promise.catch(() => {});
    promise.cancel(customReason);

    expect(observedReason).toBe(customReason);
  });

  it('forwards the same cancel reason object to all in-flight mappers at concurrency: 2', async () => {
    const observed: unknown[] = [];
    const customReason = { code: 'MAP_CANCEL' };

    const promise = map(
      ['a', 'b', 'c'],
      () =>
        new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
          handleCancel((reason) => {
            observed.push(reason);
          });
        }),
      { concurrency: 2 },
    );

    promise.catch(() => {});
    promise.cancel(customReason);

    expect(observed).toHaveLength(2);
    expect(observed[0]).toBe(customReason);
    expect(observed[1]).toBe(customReason);
  });

  it('forwards a string cancel reason as that string', async () => {
    let observedReason: unknown;

    const promise = map(
      ['a'],
      () =>
        new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
          handleCancel((reason) => {
            observedReason = reason;
          });
        }),
    );

    promise.catch(() => {});
    promise.cancel('MAP_STRING_CANCEL');

    expect(observedReason).toBe('MAP_STRING_CANCEL');
  });
});
