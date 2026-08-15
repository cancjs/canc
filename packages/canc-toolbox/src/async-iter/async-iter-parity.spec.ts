/**
 * Parity spec: key TC39 spec behaviors for async-iter operators.
 *
 * Each test covers the specified behavior and key edge cases. This is a focused
 * subset of behaviors ensuring implementations match the contract without overwhelming
 * the test suite.
 */
import * as asyncIter from './index';

interface ISourceProbe {
  produced: number;
  closed: number;
}

function makeSource(limit = Infinity): { probe: ISourceProbe; iterable: AsyncIterable<number> } {
  const probe: ISourceProbe = { produced: 0, closed: 0 };

  const iterable = (async function* () {
    try {
      let i = 0;

      while (i < limit) {
        probe.produced++;
        yield i++;
      }
    } finally {
      probe.closed++;
    }
  })();

  return { probe, iterable };
}

const flush = async (times = 24) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

describe('async iterator parity (TC39 spec behavior)', () => {
  describe('map', () => {
    it('transforms each element', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.map((x: number) => x * 2)], asyncIter.toArray());
      expect(result).toEqual([2, 4, 6]);
    });

    it('handles empty sources', async () => {
      const result = await asyncIter.pipe([], [asyncIter.map((x: unknown) => x)], asyncIter.toArray());
      expect(result).toEqual([]);
    });

    it('passes index to callback', async () => {
      const indexes: number[] = [];
      await asyncIter.pipe([10, 20], [asyncIter.map((_: number, i: number) => indexes.push(i))], asyncIter.toArray());
      expect(indexes).toEqual([0, 1]);
    });

    it('awaits async callbacks', async () => {
      const result = await asyncIter.pipe([1, 2], [asyncIter.map(async (x: number) => x + 10)], asyncIter.toArray());
      expect(result).toEqual([11, 12]);
    });
  });

  describe('filter', () => {
    it('yields matching elements', async () => {
      const result = await asyncIter.pipe(
        [1, 2, 3, 4],
        [asyncIter.filter((x: number) => x % 2 === 0)],
        asyncIter.toArray(),
      );
      expect(result).toEqual([2, 4]);
    });

    it('handles empty sources', async () => {
      const result = await asyncIter.pipe([], [asyncIter.filter((_: unknown) => true)], asyncIter.toArray());
      expect(result).toEqual([]);
    });

    it('returns empty when nothing matches', async () => {
      const result = await asyncIter.pipe(
        [1, 3, 5],
        [asyncIter.filter((x: number) => x % 2 === 0)],
        asyncIter.toArray(),
      );
      expect(result).toEqual([]);
    });
  });

  describe('take', () => {
    it('yields first n elements and closes source', async () => {
      const { probe, iterable } = makeSource();
      const result = await asyncIter.pipe(iterable, [asyncIter.take(2)], asyncIter.toArray());
      expect(result).toEqual([0, 1]);
      await flush();
      expect(probe.closed).toBe(1);
    });

    it('returns all elements if n >= length', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.take(10)], asyncIter.toArray());
      expect(result).toEqual([1, 2, 3]);
    });

    it('returns nothing for n <= 0', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.take(0)], asyncIter.toArray());
      expect(result).toEqual([]);
    });
  });

  describe('drop', () => {
    it('skips first n elements', async () => {
      const result = await asyncIter.pipe([1, 2, 3, 4], [asyncIter.drop(2)], asyncIter.toArray());
      expect(result).toEqual([3, 4]);
    });

    it('yields all for n <= 0', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.drop(0)], asyncIter.toArray());
      expect(result).toEqual([1, 2, 3]);
    });

    it('returns empty for n >= length', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.drop(10)], asyncIter.toArray());
      expect(result).toEqual([]);
    });
  });

  describe('flatMap', () => {
    it('flattens mapped iterables', async () => {
      const result = await asyncIter.pipe([1, 2], [asyncIter.flatMap((x: number) => [x, x * 10])], asyncIter.toArray());
      expect(result).toEqual([1, 10, 2, 20]);
    });

    it('handles empty inner sources', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.flatMap((_: number) => [])], asyncIter.toArray());
      expect(result).toEqual([]);
    });

    it('handles empty outer source', async () => {
      const result = await asyncIter.pipe([], [asyncIter.flatMap((x: unknown) => [x])], asyncIter.toArray());
      expect(result).toEqual([]);
    });
  });

  describe('reduce', () => {
    it('folds with initial value', async () => {
      const result = await asyncIter.reduce<number, number>((acc: number, x: number) => acc + x, 0)([1, 2, 3]);
      expect(result).toBe(6);
    });

    it('rejects with TypeError for empty source no init', async () => {
      await expect(asyncIter.reduce<number>((acc: number, x: number) => acc + x)([])).rejects.toThrow(TypeError);
    });

    it('seeds from first element when no init', async () => {
      const result = await asyncIter.reduce<number>((acc: number, x: number) => acc + x)([10, 20, 30]);
      expect(result).toBe(60);
    });

    it('keeps init for empty source', async () => {
      const result = await asyncIter.reduce<number, number>((acc: number, x: number) => acc + x, 7)([]);
      expect(result).toBe(7);
    });
  });

  describe('find', () => {
    it('returns first matching element', async () => {
      const result = await asyncIter.find<number>((x: number) => x >= 2)([1, 2, 3]);
      expect(result).toBe(2);
    });

    it('returns undefined when no match', async () => {
      const result = await asyncIter.find<number>((x: number) => x > 99)([1, 2, 3]);
      expect(result).toBeUndefined();
    });

    it('closes source on match', async () => {
      const { probe, iterable } = makeSource();
      await asyncIter.find<number>((x: number) => x >= 2)(iterable);
      await flush();
      expect(probe.closed).toBe(1);
    });
  });

  describe('some', () => {
    it('returns true when any match', async () => {
      const result = await asyncIter.some<number>((x: number) => x === 2)([1, 2, 3]);
      expect(result).toBe(true);
    });

    it('returns false when none match', async () => {
      const result = await asyncIter.some<number>((x: number) => x > 99)([1, 2, 3]);
      expect(result).toBe(false);
    });

    it('returns false for empty source', async () => {
      const result = await asyncIter.some<number>(() => true)([]);
      expect(result).toBe(false);
    });

    it('short-circuits and closes source', async () => {
      const { probe, iterable } = makeSource();
      await asyncIter.some<number>((x: number) => x >= 2)(iterable);
      await flush();
      expect(probe.closed).toBe(1);
    });
  });

  describe('every', () => {
    it('returns true when all match', async () => {
      const result = await asyncIter.every<number>((x: number) => x > 0)([1, 2, 3]);
      expect(result).toBe(true);
    });

    it('returns false when any fail', async () => {
      const result = await asyncIter.every<number>((x: number) => x > 1)([1, 2, 3]);
      expect(result).toBe(false);
    });

    it('returns true for empty source', async () => {
      const result = await asyncIter.every<number>(() => false)([]);
      expect(result).toBe(true);
    });

    it('short-circuits and closes source', async () => {
      const { probe, iterable } = makeSource();
      await asyncIter.every<number>((x: number) => x < 2)(iterable);
      await flush();
      expect(probe.closed).toBe(1);
    });
  });

  describe('includes', () => {
    it('returns true when value is present', async () => {
      const result = await asyncIter.includes<number>(2)([1, 2, 3]);
      expect(result).toBe(true);
    });

    it('returns false when value is absent', async () => {
      const result = await asyncIter.includes<number>(99)([1, 2, 3]);
      expect(result).toBe(false);
    });

    it('uses SameValueZero: NaN matches NaN', async () => {
      const result = await asyncIter.includes<number>(NaN)([1, NaN, 3]);
      expect(result).toBe(true);
    });

    it('uses SameValueZero: +0 equals -0', async () => {
      const result = await asyncIter.includes<number>(-0)([1, +0, 3]);
      expect(result).toBe(true);
    });

    it('short-circuits and closes source', async () => {
      const { probe, iterable } = makeSource();
      await asyncIter.includes<number>(2)(iterable);
      await flush();
      expect(probe.closed).toBe(1);
    });
  });

  describe('forEach', () => {
    it('visits every value in order', async () => {
      const seen: number[] = [];
      await asyncIter.forEach<number>((x: number) => {
        seen.push(x);
      })([1, 2, 3]);
      expect(seen).toEqual([1, 2, 3]);
    });

    it('resolves undefined', async () => {
      const result = await asyncIter.forEach<number>(() => {})([1, 2, 3]);
      expect(result).toBeUndefined();
    });
  });

  describe('from', () => {
    it('wraps an array', async () => {
      const result = await asyncIter.toArray<number>()(asyncIter.from([1, 2, 3]));
      expect(result).toEqual([1, 2, 3]);
    });

    it('wraps a promise as single-value source', async () => {
      const result = await asyncIter.toArray<number>()(asyncIter.from(Promise.resolve(42)));
      expect(result).toEqual([42]);
    });

    it('wraps a single value', async () => {
      const result = await asyncIter.toArray<number>()(asyncIter.from(42));
      expect(result).toEqual([42]);
    });

    it('has .pipe method', async () => {
      const iter = asyncIter.from([1, 2, 3]);
      expect(typeof iter.pipe).toBe('function');
    });

    it('.pipe chains operators', async () => {
      const result = await asyncIter.from([1, 2, 3]).pipe([asyncIter.map((x: number) => x * 2)], asyncIter.toArray());
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('concat', () => {
    it('drains sources in order', async () => {
      const result = await asyncIter.toArray<number>()(asyncIter.concat([1, 2], [3, 4]));
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('handles empty sources', async () => {
      const result = await asyncIter.toArray<number>()(asyncIter.concat([], [], [1]));
      expect(result).toEqual([1]);
    });
  });

  describe('zip', () => {
    it('yields tuples from sources', async () => {
      const result = await asyncIter.toArray<[number, string]>()(asyncIter.zip([1, 2, 3], ['a', 'b', 'c']));
      expect(result).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
    });

    it('ends on shortest source', async () => {
      const result = await asyncIter.toArray<[number, string]>()(asyncIter.zip([1, 2], ['a', 'b', 'c']));
      expect(result).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
    });

    it('closes longer sources', async () => {
      const { probe: probe2, iterable: iter2 } = makeSource();
      const { probe: probe3, iterable: iter3 } = makeSource();
      await asyncIter.toArray<[number, number]>()(asyncIter.zip([1, 2], iter2, iter3));
      await flush();
      expect(probe2.closed).toBe(1);
      expect(probe3.closed).toBe(1);
    });
  });

  describe('zipKeyed', () => {
    it('yields objects with keyed sources', async () => {
      const result = await asyncIter.toArray<Record<string, number>>()(
        asyncIter.zipKeyed({
          a: [1, 2, 3],
          b: [10, 20, 30],
        }),
      );
      expect(result).toEqual([
        { a: 1, b: 10 },
        { a: 2, b: 20 },
        { a: 3, b: 30 },
      ]);
    });

    it('ends on shortest source', async () => {
      const result = await asyncIter.toArray<Record<string, number>>()(
        asyncIter.zipKeyed({
          a: [1, 2],
          b: [10, 20, 30],
        }),
      );
      expect(result).toEqual([
        { a: 1, b: 10 },
        { a: 2, b: 20 },
      ]);
    });
  });

  describe('pipe', () => {
    it('without terminal returns pipeable', async () => {
      const piped = asyncIter.pipe([1, 2, 3], [asyncIter.map((x: number) => x * 2)]);
      expect(asyncIter.isPipeable(piped)).toBe(true);
    });

    it('with terminal returns promise', async () => {
      const result = await asyncIter.pipe([1, 2, 3], [asyncIter.map((x: number) => x * 2)], asyncIter.toArray());
      expect(result).toEqual([2, 4, 6]);
    });

    it('flattens nested arrays', async () => {
      const result = await asyncIter.pipe(
        [1, 2, 3, 4],
        [[asyncIter.filter((x: number) => x % 2 === 0)], [asyncIter.map((x: number) => x * 10)]],
        asyncIter.toArray(),
      );
      expect(result).toEqual([20, 40]);
    });

    it('throws when terminal not last', async () => {
      expect(() => {
        asyncIter.pipe([1, 2, 3], [asyncIter.toArray(), asyncIter.map((x: any) => x)]);
      }).toThrow(TypeError);
    });

    it('chains via .pipe on result', async () => {
      const result = await asyncIter
        .pipe([1, 2, 3], [asyncIter.map((x: number) => x * 2)])
        .pipe([asyncIter.filter((x: number) => x > 2)], asyncIter.toArray());
      expect(result).toEqual([4, 6]);
    });
  });
});
