import type { AnyIterable, IAsyncIterOptions } from './index';
import { splitConfig } from './options';
import { callReturn, getSource } from './pull';

/**
 * Normalize a source into an async iterable.
 * Accepts: async iterable, sync iterable, single promise, or single value.
 * The canc entry point wraps this result with `makePipeable` to add the `.pipe` method.
 */
export function from<T>(source: AnyIterable<T> | PromiseLike<T> | T, _opts?: IAsyncIterOptions): AsyncIterable<T> {
  if (source != null && typeof (source as any).then === 'function') {
    return createAsyncIterable<T>(async function* () {
      yield await (source as PromiseLike<T>);
    });
  }

  try {
    const { it } = getSource<T>(source as any);
    return {
      [Symbol.asyncIterator]: () => it,
    };
  } catch {
    // Not iterable: treat as a single value
    // eslint-disable-next-line @typescript-eslint/require-await
    return createAsyncIterable<T>(async function* () {
      yield source as T;
    });
  }
}

/**
 * Concatenate multiple sources, draining each in order.
 * Forward return() to the current active source.
 */
export function concat<T>(...args: any[]): AsyncIterable<T> {
  const { rest: sources } = splitConfig(args);

  return createAsyncIterable<T>(async function* () {
    for (const source of sources) {
      const { it } = getSource<T>(from<T>(source));
      try {
        for await (const value of { [Symbol.asyncIterator]: () => it }) {
          yield value;
        }
      } finally {
        await callReturn(it);
      }
    }
  });
}

/**
 * Zip multiple sources, pulling one value from each per round.
 * Yields tuples of values. Ends when the shortest source ends.
 * On early stop, calls return() on all sources (including losers).
 */
export function zip<T extends readonly any[]>(...args: any[]): AsyncIterable<T> {
  const { rest: sources } = splitConfig(args);

  return createAsyncIterable<T>(async function* () {
    const iterators = sources.map((src) => getSource<any>(from(src)).it);

    try {
      while (true) {
        const results = await Promise.all(iterators.map((it) => it.next()));

        if (results.some((r) => r.done)) {
          break;
        }

        const tuple = results.map((r) => r.value);
        yield tuple as any as T;
      }
    } finally {
      await Promise.all(iterators.map((it) => callReturn(it)));
    }
  });
}

/**
 * Zip multiple sources into objects, pulling one value from each per round.
 * Yields objects with the keys from the shape. Ends when the shortest source ends.
 * On early stop, calls return() on all sources.
 */
export function zipKeyed<T extends Record<string, AnyIterable<any>>>(
  shape: T,
  _opts?: IAsyncIterOptions,
): AsyncIterable<{ [K in keyof T]: Awaited<T[K] extends AsyncIterable<infer U> ? U : any> }> {
  return createAsyncIterable(async function* () {
    const keys = Object.keys(shape);
    const iterators = keys.map((key) => getSource<any>(from(shape[key])).it);

    try {
      while (true) {
        const results = await Promise.all(iterators.map((it) => it.next()));

        if (results.some((r) => r.done)) {
          break;
        }

        const obj: any = {};
        keys.forEach((key, i) => {
          obj[key] = results[i].value;
        });

        yield obj;
      }
    } finally {
      await Promise.all(iterators.map((it) => callReturn(it)));
    }
  });
}

function createAsyncIterable<T>(gen: () => AsyncGenerator<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: gen,
  };
}
