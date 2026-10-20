import { flatMap, map } from '../../../_toolbox/async-iter/operators';
import { pipe } from './pipe';
import { forEach, toArray } from './terminals';

const anyPipe = pipe as any;

// Resolves only when a timer fires, so a callback that starves the event loop never reaches it
const macrotask = (): Promise<'tick'> =>
  new Promise((resolve) => {
    setTimeout(() => resolve('tick'), 0);
  });

describe('callback results', () => {
  describe('async generator objects', () => {
    it('flatMap rejects with a TypeError before the next macrotask', async () => {
      const outcome = anyPipe(
        [1, 2],
        flatMap(async function* (value: number) {
          yield value;
        }),
        toArray(),
      ).then(
        () => 'resolved',
        (error: unknown) => error,
      );

      const first = await Promise.race([outcome, macrotask()]);

      expect(first).toBeInstanceOf(TypeError);
    }, 2000);

    it('map rejects with a TypeError before the next macrotask', async () => {
      const outcome = anyPipe(
        [1],
        map(async function* (value: number) {
          yield value;
        }),
        toArray(),
      ).then(
        () => 'resolved',
        (error: unknown) => error,
      );

      const first = await Promise.race([outcome, macrotask()]);

      expect(first).toBeInstanceOf(TypeError);
    }, 2000);

    it('forEach rejects with a TypeError before the next macrotask', async () => {
      const outcome = forEach<number>(async function* () {
        yield 1;
      } as any)([1]).then(
        () => 'resolved',
        (error: unknown) => error,
      );

      const first = await Promise.race([outcome, macrotask()]);

      expect(first).toBeInstanceOf(TypeError);
    }, 2000);
  });

  describe('built-in iterators', () => {
    it('flatMap treats a returned array iterator as data to flatten', async () => {
      const result = await anyPipe(
        [1, 2],
        flatMap((value: number) => [value, value].values()),
        toArray(),
      );

      expect(result).toEqual([1, 1, 2, 2]);
    });

    it('map hands back a returned array iterator untouched', async () => {
      const [first] = await anyPipe(
        [1],
        map(() => [7, 8].values()),
        toArray(),
      );

      expect(Array.from(first as Iterable<number>)).toEqual([7, 8]);
    });
  });

  describe('generator function bodies', () => {
    it('map still drives a sync generator body to its return value', async () => {
      const result = await anyPipe(
        [1, 2],
        map(function* (value: number) {
          const doubled: number = yield Promise.resolve(value * 2);

          return doubled + 1;
        }),
        toArray(),
      );

      expect(result).toEqual([3, 5]);
    });

    it('forEach still drives a sync generator body', async () => {
      const seen: number[] = [];

      await forEach<number>(function* (value: number) {
        seen.push(yield Promise.resolve(value));
      } as any)([1, 2]);

      expect(seen).toEqual([1, 2]);
    });
  });
});
