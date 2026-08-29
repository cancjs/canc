import { map } from './index';

// Drain the microtask queue enough times to let a settled mapper free its slot and the queue be
// pumped, without depending on the exact number of internal microtask hops.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/** A set of mappers whose start and settlement are each driven by the test. */
interface IScript {
  readonly started: boolean[];
  mapper(item: string, index: number): Promise<string>;
  settle(index: number, value: string): void;
  fail(index: number, reason: any): void;
}

function script(count: number): IScript {
  const started: boolean[] = new Array(count).fill(false);
  const resolvers: ((value: string) => void)[] = [];
  const rejecters: ((reason: any) => void)[] = [];

  return {
    started,
    mapper(item: string, index: number) {
      started[index] = true;

      return new Promise<string>((resolve, reject) => {
        resolvers[index] = resolve;
        rejecters[index] = reject;
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
      new Promise<number>((resolve) => {
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

  it('("cancel" in map(...)) is false: the returned promise is never cancelable', () => {
    const promise = map(['a'], (item) => item);

    expect('cancel' in promise).toBe(false);
  });

  it('drops the mappers still queued on a rejection and leaves a started one to finish', async () => {
    const s = script(6);
    const boom = new Error('boom');
    const promise = map(['a', 'b', 'c', 'd', 'e', 'f'], s.mapper, { concurrency: 2 });
    const caught = promise.catch((reason: unknown) => reason);

    expect(s.started).toEqual([true, true, false, false, false, false]);

    s.fail(0, boom);

    expect(await caught).toBe(boom);

    await flushMicrotasks();

    // the queue is stopped immediately on the first rejection
    expect(s.started).toEqual([true, true, false, false, false, false]);

    await flushMicrotasks();
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
});
