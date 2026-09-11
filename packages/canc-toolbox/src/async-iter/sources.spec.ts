import { map } from '../../../_toolbox/async-iter/operators';
import * as asyncIter from './index';

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
  });
});
