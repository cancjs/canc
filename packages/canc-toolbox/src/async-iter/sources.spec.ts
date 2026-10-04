import type { CancelablePromise } from '@cancjs/promise';

import { map } from '../../../_toolbox/async-iter/operators';
import * as asyncIter from './index';

// a runaway zip round only ever schedules microtasks, so no timer can interrupt it and a capped
// drain is the only way such a loop fails instead of hanging the suite
async function drainCapped(source: AsyncIterable<unknown>, cap: number): Promise<unknown[]> {
  const values: unknown[] = [];

  for await (const value of source) {
    values.push(value);

    if (values.length >= cap) {
      break;
    }
  }

  return values;
}

function trackedSource<T>(values: T[]) {
  const stats = { opens: 0, returns: 0 };

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      stats.opens++;
      let index = 0;

      return {
        next(): Promise<IteratorResult<T>> {
          if (index >= values.length) {
            return Promise.resolve({ done: true, value: undefined });
          }
          return Promise.resolve({ done: false, value: values[index++] });
        },
        return(): Promise<IteratorResult<T>> {
          stats.returns++;
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };

  return { iterable, stats };
}

describe('async-iter sources', () => {
  describe('from', () => {
    it('wraps an async generator', async () => {
      async function* gen() {
        yield 1;
        yield 2;
        yield 3;
      }

      const source = asyncIter.from(gen());
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it('wraps an array', async () => {
      const source = asyncIter.from([1, 2, 3]);
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it('wraps an array of promises', async () => {
      const source = asyncIter.from([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]);
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it('wraps a single promise', async () => {
      const source = asyncIter.from(Promise.resolve(42));
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([42]);
    });

    it('rejects a non-iterable value with a TypeError', async () => {
      expect(() => {
        const source = asyncIter.from(42 as any);

        for (const _x of [] as any[]) {
          /* trigger */
        }
        void source[Symbol.asyncIterator]();
      }).toThrow(TypeError);
    });

    it('yields the same values when drained twice', async () => {
      const source = asyncIter.from([1, 2, 3]);

      const first: unknown[] = [];
      for await (const v of source) first.push(v);

      const second: unknown[] = [];
      for await (const v of source) second.push(v);

      expect(first).toEqual([1, 2, 3]);
      expect(second).toEqual([1, 2, 3]);
    });

    it('does not open the source at pipe construction time', async () => {
      const spy = jest.fn(function* () {
        yield 1;
        yield 2;
      });
      const iterable = { [Symbol.asyncIterator]: spy } as any;

      asyncIter.pipe(
        iterable,
        map((x: number) => x * 2),
      );
      expect(spy).not.toHaveBeenCalled();

      const items: number[] = [];
      const piped = asyncIter.pipe(
        iterable,
        map((x: number) => x * 2),
      );
      for await (const item of piped as AsyncIterable<number>) {
        items.push(item);
      }
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('concat', () => {
    it('drains sources in order', async () => {
      const source1 = asyncIter.from([1, 2]);
      const source2 = asyncIter.from([3, 4]);
      const source3 = asyncIter.from([5, 6]);

      const source = asyncIter.concat(source1, source2, source3);
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('accepts trailing config object', async () => {
      const source1 = asyncIter.from([1, 2]);
      const source2 = asyncIter.from([3, 4]);

      const source = asyncIter.concat(source1, source2, {});
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3, 4]);
    });

    it('closes the active source once and never opens the next one on an early break', async () => {
      const first = trackedSource([1, 2]);
      const second = trackedSource([3, 4]);

      for await (const value of asyncIter.concat(first.iterable, second.iterable)) {
        expect(value).toBe(1);
        break;
      }

      expect(first.stats.returns).toBe(1);
      expect(second.stats.opens).toBe(0);
    });

    it('treats a promise as a source rather than as config', async () => {
      const values: unknown[] = [];

      for await (const value of asyncIter.concat(Promise.resolve(1), [2])) {
        values.push(value);
      }

      expect(values).toEqual([1, 2]);
    });
  });

  describe('zip', () => {
    it('zips two sources into tuples', async () => {
      const source1 = asyncIter.from([1, 2, 3]);
      const source2 = asyncIter.from(['a', 'b', 'c']);

      const source = asyncIter.zip(source1, source2);
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
    });

    it('ends on the shortest source', async () => {
      const source1 = asyncIter.from([1, 2, 3]);
      const source2 = asyncIter.from(['a', 'b']);

      const source = asyncIter.zip(source1, source2);
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
    });

    it('zips multiple sources', async () => {
      const source1 = asyncIter.from([1, 2]);
      const source2 = asyncIter.from(['a', 'b']);
      const source3 = asyncIter.from([true, false]);

      const source = asyncIter.zip(source1, source2, source3);
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([
        [1, 'a', true],
        [2, 'b', false],
      ]);
    });

    it('zip with no sources completes', async () => {
      expect(await drainCapped(asyncIter.zip(), 4)).toEqual([]);
      expect(await drainCapped(asyncIter.zip({}), 4)).toEqual([]);
    });

    it('treats a promise as a source rather than as config', async () => {
      expect(await drainCapped(asyncIter.zip(Promise.resolve(1), [2]), 4)).toEqual([[1, 2]]);
    });

    it('closes the longer source exactly once when the shorter one ends', async () => {
      const shorter = trackedSource([1]);
      const longer = trackedSource(['a', 'b', 'c']);

      const values = await drainCapped(asyncIter.zip(shorter.iterable, longer.iterable), 8);

      expect(values).toEqual([[1, 'a']]);
      expect(longer.stats.returns).toBe(1);
      expect(shorter.stats.returns).toBe(1);
    });

    it('waits for an in-flight pull before closing a source that outlives the round', async () => {
      const order: string[] = [];

      const failing: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('boom')),
        }),
      };

      const slow: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<IteratorResult<number>>((resolve) => {
              setTimeout(() => {
                order.push('next');
                resolve({ done: false, value: 1 });
              }, 20);
            }),
          return: () => {
            order.push('return');
            return Promise.resolve({ done: true, value: undefined });
          },
        }),
      };

      await expect(drainCapped(asyncIter.zip(failing, slow), 4)).rejects.toThrow('boom');

      expect(order).toEqual(['next', 'return']);
    });

    it('does not leave a rejected source unhandled when two sources fail', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        const late: AsyncIterable<number> = {
          [Symbol.asyncIterator]: () => ({
            next: () =>
              new Promise<IteratorResult<number>>((_resolve, reject) => {
                setTimeout(() => reject(new Error('late')), 10);
              }),
          }),
        };

        const immediate: AsyncIterable<number> = {
          [Symbol.asyncIterator]: () => ({
            next: (): Promise<IteratorResult<number>> => {
              throw new Error('immediate');
            },
          }),
        };

        await expect(drainCapped(asyncIter.zip(late, immediate), 4)).rejects.toBeInstanceOf(Error);
        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });

  describe('zipKeyed', () => {
    it('zips sources into objects', async () => {
      const source1 = asyncIter.from([1, 2]);
      const source2 = asyncIter.from(['a', 'b']);

      const source = asyncIter.zipKeyed({ x: source1, y: source2 });
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([
        { x: 1, y: 'a' },
        { x: 2, y: 'b' },
      ]);
    });

    it('ends on the shortest source', async () => {
      const source1 = asyncIter.from([1, 2, 3]);
      const source2 = asyncIter.from(['a', 'b']);

      const source = asyncIter.zipKeyed({ x: source1, y: source2 });
      const values: unknown[] = [];
      for await (const value of source) {
        values.push(value);
      }

      expect(values).toEqual([
        { x: 1, y: 'a' },
        { x: 2, y: 'b' },
      ]);
    });

    it('zipKeyed with no sources completes', async () => {
      expect(await drainCapped(asyncIter.zipKeyed({}), 4)).toEqual([]);
    });
  });
});

type TExact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

function assertExact<A, B>(_check: TExact<A, B> extends true ? true : never): void {}

// read back through the platform type rather than the package's own helper, so the assertion
// cannot pass by agreeing with the code it checks
type TElement<X> = X extends AsyncIterable<infer E> ? E : never;

const numbers: AsyncIterable<number> = asyncIter.from([1, 2]);

describe('source typing', () => {
  it('rebuilds a tuple element type from the zipped sources', async () => {
    const zipped = asyncIter.zip(numbers, ['a', 'b']);

    assertExact<TElement<typeof zipped>, [number, string]>(true);
    await expect(asyncIter.toArray()(zipped)).resolves.toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('rebuilds a keyed element type from the zipped shape', async () => {
    const keyed = asyncIter.zipKeyed({ count: numbers, label: ['a', 'b'] });

    assertExact<TElement<typeof keyed>, { count: number; label: string }>(true);
    await expect(asyncIter.toArray()(keyed)).resolves.toEqual([
      { count: 1, label: 'a' },
      { count: 2, label: 'b' },
    ]);
  });

  it('reads the element type off the source, awaiting a synchronous iterable of promises', async () => {
    const awaited = asyncIter.from([Promise.resolve(1), Promise.resolve(2)]);
    const joined = asyncIter.concat(numbers, [3, 4]);
    const piped = asyncIter.pipe([Promise.resolve('a')], asyncIter.toArray());

    assertExact<TElement<typeof awaited>, number>(true);
    assertExact<TElement<typeof joined>, number>(true);
    assertExact<typeof piped, CancelablePromise<string[]>>(true);
    await expect(asyncIter.toArray()(awaited)).resolves.toEqual([1, 2]);
    await expect(asyncIter.toArray()(joined)).resolves.toEqual([1, 2, 3, 4]);
    await expect(piped).resolves.toEqual(['a']);
  });
});
