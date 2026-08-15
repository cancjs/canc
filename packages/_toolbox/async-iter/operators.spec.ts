import { drop, filter, flatMap, map, take } from './operators';

interface ITrace {
  /** Values the source handed out. */
  pulls: number;
  /** Times the source ran its own cleanup. */
  closes: number;
}

interface ITracked<T> {
  source: AsyncIterable<T>;
  trace: ITrace;
}

function trackedSource<T>(values: Iterable<T>): ITracked<T> {
  const trace: ITrace = { pulls: 0, closes: 0 };

  const source: AsyncIterable<T> = {
    [Symbol.asyncIterator]: async function* tracked() {
      try {
        for (const value of values) {
          trace.pulls++;
          yield value;
        }
      } finally {
        trace.closes++;
      }
    },
  };

  return { source, trace };
}

function endlessSource(): ITracked<number> {
  const trace: ITrace = { pulls: 0, closes: 0 };

  const source: AsyncIterable<number> = {
    [Symbol.asyncIterator]: async function* endless() {
      try {
        for (let value = 0; ; value++) {
          trace.pulls++;
          yield value;
        }
      } finally {
        trace.closes++;
      }
    },
  };

  return { source, trace };
}

/**
 * An endless source built by hand rather than from a generator, so that closing it is observable
 * even before the first pull. A generator that never started has no `finally` to run.
 */
function closableSource(): ITracked<number> {
  const trace: ITrace = { pulls: 0, closes: 0 };

  const source: AsyncIterable<number> = {
    [Symbol.asyncIterator]: () => ({
      async next(): Promise<IteratorResult<number>> {
        return { done: false, value: trace.pulls++ };
      },
      async return(value?: any): Promise<IteratorResult<number>> {
        trace.closes++;
        return { done: true, value };
      },
    }),
  };

  return { source, trace };
}

async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

/** Let every pending microtask and job settle without waiting on a timer. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface ICancelableWork {
  promise: Promise<never> & { cancel: () => void };
  state: { canceled: number };
}

/** A cancelable-shaped promise that stays pending until it is canceled, standing in for real work. */
function cancelableWork(): ICancelableWork {
  const state = { canceled: 0 };
  let fail: (reason: unknown) => void = () => undefined;

  const promise = new Promise<never>((_resolve, reject) => {
    fail = reject;
  }) as Promise<never> & { cancel: () => void };

  promise.cancel = () => {
    state.canceled++;
    fail(new Error('work canceled'));
  };
  promise.catch(() => undefined);

  return { promise, state };
}

describe('map', () => {
  it('maps with a sync callback', async () => {
    const { source } = trackedSource([1, 2, 3]);

    await expect(drain(map((value: number) => value * 2)(source))).resolves.toEqual([2, 4, 6]);
  });

  it('maps with an async callback', async () => {
    const { source } = trackedSource([1, 2, 3]);

    await expect(drain(map(async (value: number) => value * 2)(source))).resolves.toEqual([2, 4, 6]);
  });

  it('maps with a generator callback, using its return value', async () => {
    const { source } = trackedSource([1, 2, 3]);

    const doubled = map(function* double(value: number) {
      const awaited: number = yield Promise.resolve(value);
      return awaited * 2;
    })(source);

    await expect(drain(doubled)).resolves.toEqual([2, 4, 6]);
  });

  it('maps with a callback returning a cancelable-shaped promise', async () => {
    const { source } = trackedSource([1, 2, 3]);

    const doubled = map((value: number) => {
      const promise = Promise.resolve(value * 2) as Promise<number> & { cancel: () => void };
      promise.cancel = () => undefined;
      return promise;
    })(source);

    await expect(drain(doubled)).resolves.toEqual([2, 4, 6]);
  });

  it('passes the index of each value', async () => {
    const { source } = trackedSource(['a', 'b', 'c']);

    const indexed = map((value: string, index: number) => `${index}${value}`)(source);

    await expect(drain(indexed)).resolves.toEqual(['0a', '1b', '2c']);
  });

  it('closes the source when the callback fails', async () => {
    const { source, trace } = trackedSource([1, 2, 3]);

    const failing = map((value: number) => {
      if (value === 2) {
        throw new Error('boom');
      }
      return value;
    })(source);

    await expect(drain(failing)).rejects.toThrow('boom');
    expect(trace.closes).toBe(1);
  });

  it('pulls nothing until it is consumed', async () => {
    const { source, trace } = trackedSource([1, 2, 3]);

    map((value: number) => value)(source);
    await flush();

    expect(trace.pulls).toBe(0);
  });
});

describe('filter', () => {
  it('filters with a sync predicate', async () => {
    const { source } = trackedSource([1, 2, 3, 4]);

    await expect(drain(filter((value: number) => value % 2 === 0)(source))).resolves.toEqual([2, 4]);
  });

  it('filters with an async predicate', async () => {
    const { source } = trackedSource([1, 2, 3, 4]);

    await expect(drain(filter(async (value: number) => value % 2 === 0)(source))).resolves.toEqual([2, 4]);
  });

  it('filters with a generator predicate', async () => {
    const { source } = trackedSource([1, 2, 3, 4]);

    const evens = filter(function* isEven(value: number) {
      const awaited: number = yield Promise.resolve(value);
      return awaited % 2 === 0;
    })(source);

    await expect(drain(evens)).resolves.toEqual([2, 4]);
  });

  it('narrows the element type on a type-guard predicate', async () => {
    const { source } = trackedSource<string | number>([1, 'a', 2, 'b']);

    const strings = filter((value: string | number): value is string => typeof value === 'string')(source);
    const lengths = map((value: string) => value.length)(strings);

    await expect(drain(lengths)).resolves.toEqual([1, 1]);
  });

  it('closes the source when the predicate fails', async () => {
    const { source, trace } = trackedSource([1, 2, 3]);

    const failing = filter((value: number) => {
      if (value === 2) {
        throw new Error('boom');
      }
      return true;
    })(source);

    await expect(drain(failing)).rejects.toThrow('boom');
    expect(trace.closes).toBe(1);
  });
});

describe('take', () => {
  it('yields the first values of an endless source and closes it', async () => {
    const { source, trace } = endlessSource();

    await expect(drain(take<number>(2)(source))).resolves.toEqual([0, 1]);
    expect(trace.pulls).toBe(2);
    expect(trace.closes).toBe(1);
  });

  it('yields nothing for a limit of zero and still closes the source', async () => {
    const { source, trace } = closableSource();

    await expect(drain(take<number>(0)(source))).resolves.toEqual([]);
    expect(trace.pulls).toBe(0);
    expect(trace.closes).toBe(1);
  });

  it('yields nothing for a negative limit', async () => {
    const { source } = trackedSource([1, 2, 3]);

    await expect(drain(take<number>(-1)(source))).resolves.toEqual([]);
  });

  it('ends with the source when the source is shorter than the limit', async () => {
    const { source } = trackedSource([1, 2]);

    await expect(drain(take<number>(5)(source))).resolves.toEqual([1, 2]);
  });
});

describe('drop', () => {
  it('discards the first values and yields the rest', async () => {
    const { source } = trackedSource([1, 2, 3, 4]);

    await expect(drain(drop<number>(2)(source))).resolves.toEqual([3, 4]);
  });

  it('yields nothing when it drops past the end', async () => {
    const { source } = trackedSource([1, 2]);

    await expect(drain(drop<number>(5)(source))).resolves.toEqual([]);
  });

  it('yields everything for a count of zero', async () => {
    const { source } = trackedSource([1, 2]);

    await expect(drain(drop<number>(0)(source))).resolves.toEqual([1, 2]);
  });
});

describe('flatMap', () => {
  it('flattens sync iterables', async () => {
    const { source } = trackedSource([1, 2, 3]);

    await expect(drain(flatMap((value: number) => [value, value * 10])(source))).resolves.toEqual([
      1, 10, 2, 20, 3, 30,
    ]);
  });

  it('flattens async iterables', async () => {
    const { source } = trackedSource([1, 2]);

    const flattened = flatMap((value: number) => trackedSource([value, value * 10]).source)(source);

    await expect(drain(flattened)).resolves.toEqual([1, 10, 2, 20]);
  });

  it('flattens the iterable a generator callback returns', async () => {
    const { source } = trackedSource([1, 2]);

    const flattened = flatMap(function* expand(value: number) {
      const awaited: number = yield Promise.resolve(value);
      return [awaited, awaited * 10];
    })(source);

    await expect(drain(flattened)).resolves.toEqual([1, 10, 2, 20]);
  });

  it('skips empty inner iterables', async () => {
    const { source } = trackedSource([1, 2, 3]);

    const flattened = flatMap((value: number) => (value === 2 ? [] : [value]))(source);

    await expect(drain(flattened)).resolves.toEqual([1, 3]);
  });

  it('closes the inner iterable and the source when the consumer stops', async () => {
    const outer = trackedSource([1, 2]);
    const inner = endlessSource();

    const flattened = flatMap(() => inner.source)(outer.source);
    const iterator = flattened[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ done: false, value: 0 });
    await iterator.return?.(undefined);

    expect(inner.trace.closes).toBe(1);
    expect(outer.trace.closes).toBe(1);
  });
});

describe('stopping a chain', () => {
  it('closes the source once through every operator', async () => {
    const { source, trace } = endlessSource();

    const composed = take<number>(2)(filter((value: number) => value % 2 === 0)(map((value: number) => value)(source)));

    await expect(drain(composed)).resolves.toEqual([0, 2]);
    expect(trace.closes).toBe(1);
  });

  it('cancels the work an in-flight generator body waits on and runs its cleanup', async () => {
    const { source, trace } = trackedSource([1, 2, 3]);
    const work = cancelableWork();
    const cleanup = { ran: 0 };

    const mapped = map(function* enrich(value: number) {
      try {
        yield work.promise;
        return value;
      } finally {
        cleanup.ran++;
      }
    })(source);

    const iterator = take<number>(2)(mapped)[Symbol.asyncIterator]();
    const pull = iterator.next();
    await flush();

    expect(work.state.canceled).toBe(0);
    expect(cleanup.ran).toBe(0);

    await iterator.return?.(undefined);

    expect(work.state.canceled).toBe(1);
    expect(cleanup.ran).toBe(1);
    expect(trace.closes).toBe(1);
    await expect(pull).resolves.toEqual({ done: true, value: undefined });
  });

  it('cancels the cancelable promise a callback returned', async () => {
    const { source } = trackedSource([1, 2, 3]);
    const work = cancelableWork();

    const mapped = map(() => work.promise)(source);
    const iterator = mapped[Symbol.asyncIterator]();
    const pull = iterator.next();
    await flush();

    await iterator.return?.(undefined);

    expect(work.state.canceled).toBe(1);
    await expect(pull).resolves.toEqual({ done: true, value: undefined });
  });

  it('leaves an async callback running, which is the tradeoff of that form', async () => {
    const { source } = trackedSource([1, 2, 3]);
    const work = cancelableWork();

    const mapped = map(async () => work.promise)(source);
    const iterator = mapped[Symbol.asyncIterator]();
    const pull = iterator.next();
    await flush();

    await iterator.return?.(undefined);

    expect(work.state.canceled).toBe(0);
    work.promise.cancel();
    await expect(pull).resolves.toEqual({ done: true, value: undefined });
  });
});
