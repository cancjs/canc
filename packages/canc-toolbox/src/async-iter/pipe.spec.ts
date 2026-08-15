import { map, take } from '../../../_toolbox/async-iter/operators';
import { isPipeable } from '../../../_toolbox/async-iter/types';
import { pipe } from './pipe';
import { from } from './sources';
import { toArray } from './terminals';

const anyMap = map as any;

const anyTake = take as any;

const anyPipe = pipe as any;

describe('pipe', () => {
  it('pipe with no ops returns a pipeable async iterable (inert until consumed)', async () => {
    const source = [1, 2, 3];
    const result = anyPipe(source);

    expect(isPipeable(result)).toBe(true);
    expect(typeof result.pipe).toBe('function');

    // Verify it's actually iterable
    const items: number[] = [];
    for await (const item of result) {
      items.push(item);
    }
    expect(items).toEqual([1, 2, 3]);
  });

  it('pipe with ops returns a pipeable async iterable', async () => {
    const source = [1, 2, 3];
    const result = anyPipe(
      source,
      anyMap((x: number) => x * 2),
    );

    expect(isPipeable(result)).toBe(true);
    expect(typeof result.pipe).toBe('function');

    const items: number[] = [];
    for await (const item of result) {
      items.push(item);
    }
    expect(items).toEqual([2, 4, 6]);
  });

  it('pipe with multiple ops chains them correctly', async () => {
    const source = [1, 2, 3, 4, 5];
    const result = anyPipe(
      source,
      anyMap((x: number) => x * 2),
      anyTake(3),
    );

    const items: number[] = [];
    for await (const item of result) {
      items.push(item);
    }
    expect(items).toEqual([2, 4, 6]);
  });

  it('pipe with terminal op applies it and returns promise-like', async () => {
    const source = [1, 2, 3];
    const result = anyPipe(source, toArray());

    // Result should be a CancelablePromise
    expect(result && typeof result.then).toBe('function');

    const value = await result;
    expect(value).toEqual([1, 2, 3]);
  });

  it('pipe flattens grouped arrays of ops', async () => {
    const source = [1, 2, 3];
    const ops = [[anyMap((x: number) => x * 2)], anyTake(2)];
    const result = anyPipe(source, ...ops, toArray());

    const value = await result;
    expect(value).toEqual([2, 4]);
  });

  it('pipe accepts trailing config object and ignores it', async () => {
    const source = [1, 2, 3];
    const result = anyPipe(
      source,
      anyMap((x: number) => x * 2),
      {/* config */},
      toArray(),
    );

    const value = await result;
    expect(value).toEqual([2, 4, 6]);
  });

  it('pipe throws if terminal is not last', () => {
    const source = [1, 2, 3];

    expect(() => {
      anyPipe(
        source,
        toArray(),
        anyMap((x: number) => x * 2),
      );
    }).toThrow('A terminal operator must be the last operator');
  });

  it('from() returns a pipeable with .pipe method', async () => {
    const source = [1, 2, 3];
    const result = from(source);

    expect(isPipeable(result)).toBe(true);
    expect(typeof result.pipe).toBe('function');
  });

  it('from() does not have terminal methods', () => {
    const source = [1, 2, 3];
    const result = from(source);

    expect('find' in result).toBe(false);
    expect('toArray' in result).toBe(false);
  });

  it('from(...).pipe(ops, terminal) chains correctly', async () => {
    const result = from([1, 2, 3, 4, 5]).pipe(
      anyMap((x: number) => x * 2),
      anyTake(2),
      toArray(),
    );

    expect(result && typeof result.then).toBe('function');
    const value = await result;
    expect(value).toEqual([2, 4]);
  });

  it('lazy pipe output is pipeable', async () => {
    const result = anyPipe(
      [1, 2, 3],
      anyMap((x: number) => x * 2),
    );

    expect(isPipeable(result)).toBe(true);
    expect(typeof result.pipe).toBe('function');
  });

  it('.pipe chaining on lazy pipe output works', async () => {
    const intermediate = anyPipe(
      [1, 2, 3, 4, 5],
      anyMap((x: number) => x * 2),
    );
    const result = intermediate.pipe(anyTake(2), toArray());

    const value = await result;
    expect(value).toEqual([2, 4]);
  });

  it('lazy pipe does not pull source until consumed', async () => {
    let pullCount = 0;
    const source = (async function* () {
      for (let i = 1; i <= 3; i++) {
        pullCount++;
        yield i;
      }
    })();

    const piped = anyPipe(
      source,
      anyMap((x: number) => x * 2),
    );
    expect(pullCount).toBe(0); // Nothing pulled yet

    const items: number[] = [];
    for await (const item of piped) {
      items.push(item);
    }
    expect(pullCount).toBe(3);
    expect(items).toEqual([2, 4, 6]);
  });

  it('pipe works with async iterables', async () => {
    async function* asyncSource() {
      yield 1;
      yield 2;
      yield 3;
    }

    const result = anyPipe(
      asyncSource(),
      anyMap((x: number) => x * 2),
      toArray(),
    );
    const value = await result;
    expect(value).toEqual([2, 4, 6]);
  });

  it('pipe works with single promise', async () => {
    const promise = Promise.resolve(42);
    const result = anyPipe(
      promise,
      anyMap((x: number) => x * 2),
      toArray(),
    );

    const value = await result;
    expect(value).toEqual([84]);
  });

  it('pipe works with single value', async () => {
    const val = 42;
    const result = anyPipe(
      val,
      anyMap((x: number) => x * 2),
      toArray(),
    );

    const resolved = await result;
    expect(resolved).toEqual([84]);
  });
});
