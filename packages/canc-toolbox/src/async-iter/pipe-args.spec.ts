import { map } from '../../../_toolbox/async-iter/operators';
import { concat, zip } from './index';
import { pipe } from './pipe';
import { from } from './sources';
import { toArray } from './terminals';

const anyPipe = pipe as any;

const anyConcat = concat as any;

const anyZip = zip as any;

const anyMap = map as any;

async function drain(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const values: unknown[] = [];

  for await (const value of source) {
    values.push(value);
  }

  return values;
}

describe('pipe arguments', () => {
  describe('operators', () => {
    it('rejects a function that is not a branded operator', () => {
      expect(() => anyPipe([1, 2], (x: number) => x)).toThrow(TypeError);
    });

    it('rejects an unbranded function between valid operators', () => {
      expect(() =>
        anyPipe(
          [1, 2],
          anyMap((x: number) => x),
          (x: number) => x,
          toArray(),
        ),
      ).toThrow(TypeError);
    });

    it('rejects a non-function argument', () => {
      expect(() => anyPipe([1, 2], 5)).toThrow(TypeError);
    });

    it('rejects a plain object that is not the last argument', () => {
      expect(() => anyPipe([1, 2], { signal: undefined }, toArray())).toThrow(TypeError);
    });

    it('still runs branded operators and a terminal', async () => {
      await expect(
        anyPipe(
          [1, 2],
          anyMap((x: number) => x * 2),
          toArray(),
        ),
      ).resolves.toEqual([2, 4]);
    });
  });

  describe('config slot', () => {
    it('accepts a trailing config object after the terminal', async () => {
      const controller = new AbortController();

      await expect(
        anyPipe(
          [1, 2],
          anyMap((x: number) => x + 1),
          toArray(),
          { signal: controller.signal },
        ),
      ).resolves.toEqual([2, 3]);
    });

    it('accepts a trailing config object after operators with no terminal', async () => {
      const lazy = anyPipe(
        [1, 2],
        anyMap((x: number) => x + 1),
        { signal: new AbortController().signal },
      );

      await expect(drain(lazy)).resolves.toEqual([2, 3]);
    });

    it('accepts a null-prototype config object', async () => {
      await expect(anyPipe([1], toArray(), Object.create(null))).resolves.toEqual([1]);
    });

    it('does not take a class instance for config', () => {
      class Options {}

      expect(() => anyPipe([1], toArray(), new Options())).toThrow(TypeError);
    });
  });

  describe('concat and zip', () => {
    it('concat rejects a plain object source', async () => {
      await expect(drain(anyConcat({ a: 1 }, from([1])))).rejects.toThrow(TypeError);
    });

    it('zip rejects a plain object source', async () => {
      await expect(drain(anyZip({ a: 1 }, from([1])))).rejects.toThrow(TypeError);
    });

    it('concat still takes a trailing config object', async () => {
      await expect(drain(anyConcat(from([1]), [2], { signal: undefined }))).resolves.toEqual([1, 2]);
    });

    it('zip still takes a trailing config object', async () => {
      await expect(drain(anyZip(from([1]), [2], {}))).resolves.toEqual([[1, 2]]);
    });
  });
});
