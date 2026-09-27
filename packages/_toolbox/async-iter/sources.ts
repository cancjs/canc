import type { AnyIterable, IAsyncIterOptions } from './index';
import { splitConfig } from './options';
import { callReturn, getSource } from './pull';

/**
 * Normalize a source into an async iterable.
 * Accepts: async iterable, sync iterable, or a single promise.
 * Non-iterable values throw TypeError.
 */
export function from<T>(source: AnyIterable<T> | PromiseLike<T>, _opts?: IAsyncIterOptions): AsyncIterable<T> {
  // Thenable sources yield their resolved value
  if (source != null && typeof (source as any).then === 'function') {
    return createAsyncIterable<T>(async function* () {
      yield await (source as PromiseLike<T>);
    });
  }

  // Lazy: getSource is called per iteration, not at call time
  return {
    [Symbol.asyncIterator]: () => getSource<T>(source as any).it,
  };
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
      // hand-driven: a for-await closes on abrupt completion and the finally would close again
      let exhausted = false;

      try {
        while (!exhausted) {
          const step = await it.next();

          if (step.done) {
            exhausted = true;
          } else {
            yield step.value;
          }
        }
      } finally {
        if (!exhausted) {
          await callReturn(it);
        }
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

    if (iterators.length === 0) {
      return;
    }

    try {
      while (true) {
        const values = await pullRound(iterators);

        if (!values) {
          break;
        }

        yield values as any as T;
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

    if (iterators.length === 0) {
      return;
    }

    try {
      while (true) {
        const values = await pullRound(iterators);

        if (!values) {
          break;
        }

        const obj: any = {};
        keys.forEach((key, i) => {
          obj[key] = values[i];
        });

        yield obj;
      }
    } finally {
      await Promise.all(iterators.map((it) => callReturn(it)));
    }
  });
}

type TSettledPull = { ok: true; result: IteratorResult<any> } | { ok: false; reason: unknown };

// every pull carries its own handler before Promise.all sees it, so a member rejecting while
// another is still in flight never becomes an unhandled rejection
function settlePull(it: AsyncIterator<any>): Promise<TSettledPull> {
  try {
    return Promise.resolve(it.next()).then<TSettledPull, TSettledPull>(
      (result) => ({ ok: true, result }),
      (reason) => ({ ok: false, reason }),
    );
  } catch (reason) {
    return Promise.resolve<TSettledPull>({ ok: false, reason });
  }
}

// null once any member is done; rejects with the first failure, and only once all have settled
async function pullRound(iterators: AsyncIterator<any>[]): Promise<any[] | null> {
  const settled = await Promise.all(iterators.map((it) => settlePull(it)));
  const values: any[] = [];
  let failure: { reason: unknown } | undefined;
  let done = false;

  for (const step of settled) {
    if (!step.ok) {
      if (!failure) {
        failure = step;
      }
      continue;
    }

    if (step.result.done) {
      done = true;
    } else {
      values.push(step.result.value);
    }
  }

  if (failure) {
    throw failure.reason;
  }

  return done ? null : values;
}

/**
 * Helper to create an async iterable from a generator function.
 */
function createAsyncIterable<T>(gen: () => AsyncGenerator<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: gen,
  };
}
