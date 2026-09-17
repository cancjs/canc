import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';

import { IterationError } from '../../_util/errors';
import { cancAsync, cancAwait, cancForAwait } from './coroutine';

// Deterministic microtask flush (mirrors coroutine.spec): drains the microtask queue N times so
// chained then-callbacks all run, no arbitrary sleeps.
const flush = async (times = 12) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

// A finite async generator that appends `label` to `log` from its own `finally`, so cleanup timing
// is read off one shared list instead of measured.
function makeLoggedSource<T>(values: T[], log: string[] = [], label = 'cleanup') {
  return (async function* () {
    try {
      for (const value of values) {
        yield value;
      }
    } finally {
      log.push(label);
    }
  })();
}

// A source whose pulls never settle on their own, so a test can park the coroutine inside
// `loop.next()` and cancel it there, while `return()` settles at once as a real cursor would
function makeControllableSource<T>() {
  const gate: Array<(value: T) => void> = [];
  const state = { cleanedUp: false, pulls: 0 };

  const source = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next(): Promise<IteratorResult<T>> {
      state.pulls++;

      return new Promise<T>((resolve) => {
        gate.push(resolve);
      }).then((value) => ({ value, done: false }));
    },
    return(): Promise<IteratorResult<T>> {
      state.cleanedUp = true;

      return Promise.resolve({ value: undefined as any, done: true });
    },
  };

  return { source, deliver: (index: number, value: T) => gate[index](value), state };
}

// Tracks source next() invocations to verify prefetch and lookahead bounds
function makeCountingSource<T>(values: T[]) {
  const state = { pulls: 0 };
  let index = 0;

  const source = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next(): Promise<IteratorResult<T>> {
      state.pulls++;

      if (index < values.length) {
        return Promise.resolve({ value: values[index++], done: false });
      }

      return Promise.resolve({ value: undefined as any, done: true });
    },
    return(): Promise<IteratorResult<T>> {
      return Promise.resolve({ value: undefined as any, done: true });
    },
  };

  return { source, state };
}

describe('cancForAwait handle form', () => {
  it('visits every item of a finite async source in order', async () => {
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([10, 20, 30]));

      for (const value of loop) {
        seen.push(value);
        yield* loop.next();
      }

      return 'done';
    });

    await expect(co()).resolves.toBe('done');
    expect(seen).toEqual([10, 20, 30]);
  });

  it('native break stops the loop and still runs the source cleanup', async () => {
    const log: string[] = [];
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3], log));

      for (const value of loop) {
        if (value === 2) {
          break;
        }
        seen.push(value);
        yield* loop.next();
      }

      return 'stopped';
    });

    await expect(co()).resolves.toBe('stopped');
    expect(seen).toEqual([1]);
    expect(log).toEqual(['cleanup']);
  });

  it('finishes the source cleanup before the coroutine settles on the break path', async () => {
    const log: string[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3], log));

      for (const value of loop) {
        if (value === 2) {
          break;
        }
        yield* loop.next();
      }

      log.push('after-loop');

      return 'ok';
    });

    const promise = co();
    const settled = promise.then(() => log.push('settled'));

    await settled;
    expect(log).toEqual(['after-loop', 'cleanup', 'settled']);
  });

  it('loop.return() finishes the cleanup at the break statement', async () => {
    const log: string[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3], log));

      for (const value of loop) {
        if (value === 2) {
          break;
        }
        yield* loop.next();
      }

      yield* loop.return();
      log.push('after-return');

      return 'ok';
    });

    await expect(co()).resolves.toBe('ok');
    expect(log).toEqual(['cleanup', 'after-return']);
  });

  it('supports native continue and an early return out of the coroutine', async () => {
    const log: string[] = [];
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3, 4], log));

      for (const value of loop) {
        yield* loop.next();

        if (value === 2) {
          continue;
        }

        seen.push(value);

        if (value === 3) {
          return 'early';
        }
      }

      return 'drained';
    });

    const settled = co().then((value: string) => {
      log.push('settled');

      return value;
    });

    await expect(settled).resolves.toBe('early');
    expect(seen).toEqual([1, 3]);
    expect(log).toEqual(['cleanup', 'settled']);
  });

  it('throws IterationError when the body never advances the handle', async () => {
    const log: string[] = [];
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3], log));

      for (const value of loop) {
        seen.push(value);
      }

      return 'unreachable';
    });

    const error = await co().then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IterationError);
    expect((error as Error).message).toContain('next');
    expect(seen).toEqual([1]);
    expect(log).toEqual(['cleanup']);
  });

  it('keeps two loops running in one coroutine independent of each other', async () => {
    const seenA: number[] = [];
    const seenB: string[] = [];

    const co = cancAsync(function* () {
      const loopA = yield* cancForAwait(makeLoggedSource([1, 2, 3]));
      const loopB = yield* cancForAwait(makeLoggedSource(['a', 'b', 'c']));
      const iterB = loopB[Symbol.iterator]();

      for (const value of loopA) {
        seenA.push(value);

        const stepB = iterB.next();
        if (!stepB.done) {
          seenB.push(stepB.value);
          yield* loopB.next();
        }

        yield* cancAwait(CancelablePromise.resolve('tick'));
        yield* loopA.next();
      }

      yield* loopB.return();

      return 'done';
    });

    await expect(co()).resolves.toBe('done');
    expect(seenA).toEqual([1, 2, 3]);
    expect(seenB).toEqual(['a', 'b', 'c']);
  });

  it('supports a nested handle-form loop', async () => {
    const pairs: Array<[number, string]> = [];
    const log: string[] = [];

    const co = cancAsync(function* () {
      const outer = yield* cancForAwait(makeLoggedSource([1, 2], log, 'outer'));

      for (const o of outer) {
        const inner = yield* cancForAwait(makeLoggedSource(['x', 'y'], log, 'inner'));

        for (const i of inner) {
          pairs.push([o, i]);
          yield* inner.next();
        }

        yield* outer.next();
      }

      return 'done';
    });

    await expect(co()).resolves.toBe('done');
    expect(pairs).toEqual([
      [1, 'x'],
      [1, 'y'],
      [2, 'x'],
      [2, 'y'],
    ]);
    expect(log).toEqual(['inner', 'inner', 'outer']);
  });

  it('cancel while suspended in loop.next() cleans up the source and rejects CancelError', async () => {
    const { source, deliver, state } = makeControllableSource<number>();
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(source);

      for (const value of loop) {
        seen.push(value);
        yield* loop.next();
      }

      return 'done';
    });

    const promise = co();
    promise.catch(suppressCancel);

    deliver(0, 1);
    await flush();
    expect(seen).toEqual([1]);
    expect(state.pulls).toBe(2);
    expect(state.cleanedUp).toBe(false);

    promise.cancel();
    await flush();

    expect(state.cleanedUp).toBe(true);

    const error = await promise.catch((reason: any) => reason);
    expect(isCancelError(error)).toBe(true);
    expect(error).toBeInstanceOf(CancelError);
  });

  it('cancel while suspended in the loop body cleans up the source and rejects CancelError', async () => {
    const log: string[] = [];
    const gate = new Promise<void>(() => undefined);

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3], log));

      for (const value of loop) {
        log.push(`item-${value}`);
        yield* cancAwait(gate);
        yield* loop.next();
      }

      return 'done';
    });

    const promise = co();
    promise.catch(suppressCancel);

    await flush();
    expect(log).toEqual(['item-1']);

    promise.cancel();
    await flush();

    expect(log).toEqual(['item-1', 'cleanup']);

    const error = await promise.catch((reason: any) => reason);
    expect(isCancelError(error)).toBe(true);
  });

  it('throws IterationError on a second iteration of the same handle', async () => {
    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2]));
      loop[Symbol.iterator]();

      let caught: unknown;
      try {
        loop[Symbol.iterator]();
      } catch (err) {
        caught = err;
      }

      yield* loop.return();

      return caught;
    });

    expect(await co()).toBeInstanceOf(IterationError);
  });
});

describe('cancForAwait.next() sugar form', () => {
  it('sugar only: single loop visits every item', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const source = makeLoggedSource([10, 20, 30], log);

      for (const item of yield* cancForAwait(source)) {
        yield* cancForAwait.next();
        log.push(item);
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual([10, 20, 'cleanup', 30]);
  });

  it('handle form: regression behavior unchanged', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([10, 20, 30], log));

      for (const item of loop) {
        yield* loop.next();
        log.push(item);
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual([10, 20, 'cleanup', 30]);
  });

  it('both spellings alternating in one body target the same handle', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3], log));

      for (const item of loop) {
        if (item === 2) {
          yield* cancForAwait.next();
        } else {
          yield* loop.next();
        }
        log.push(item);
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual([1, 2, 'cleanup', 3]);
  });

  it('nested: outer handle, inner sugar', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const outer = yield* cancForAwait(makeLoggedSource([1, 2], log, 'outer'));

      for (const outerItem of outer) {
        for (const innerItem of yield* cancForAwait(makeLoggedSource(['a', 'b'], log, 'inner'))) {
          yield* cancForAwait.next();
          log.push(`${outerItem}${innerItem}`);
        }

        yield* outer.next();
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual(['1a', 'inner', '1b', '2a', 'inner', '2b', 'outer']);
  });

  it('nested: both sugar, outer advance after inner exhausts targets outer', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const outer = yield* cancForAwait(makeLoggedSource([1, 2], log, 'outer'));

      for (const outerItem of outer) {
        const inner = yield* cancForAwait(makeLoggedSource(['a', 'b'], log, 'inner'));

        for (const innerItem of inner) {
          yield* cancForAwait.next();
          log.push(`${outerItem}${innerItem}`);
        }

        yield* cancForAwait.next();
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual(['1a', 'inner', '1b', '2a', 'inner', '2b', 'outer']);
  });

  it('nested: inner break, then outer sugar targets outer', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const outer = yield* cancForAwait(makeLoggedSource([1, 2, 3], log, 'outer'));

      for (const outerItem of outer) {
        const inner = yield* cancForAwait(makeLoggedSource(['a', 'b', 'c'], log, 'inner'));

        for (const innerItem of inner) {
          log.push(`${outerItem}${innerItem}`);
          if (innerItem === 'b') {
            break;
          }
          yield* cancForAwait.next();
        }

        log.push(`step-${outerItem}`);
        yield* cancForAwait.next();
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual([
      '1a',
      '1b',
      'step-1',
      'inner',
      '2a',
      '2b',
      'step-2',
      'inner',
      '3a',
      '3b',
      'step-3',
      'outer',
      'inner',
    ]);
  });

  it('sugar with no loop open throws IterationError', async () => {
    const co = cancAsync(function* () {
      try {
        yield* cancForAwait.next();
      } catch (err) {
        return err;
      }
    });

    const error = await co();
    expect(error).toBeInstanceOf(IterationError);
    expect((error as Error).message).toContain('No active forAwait loop');
  });

  it('adversarial: inner next targets inner, then outer next targets outer', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const outer = yield* cancForAwait(makeLoggedSource([1, 2], log, 'outer'));

      for (const o of outer) {
        const inner = yield* cancForAwait(makeLoggedSource(['a', 'b'], log, 'inner'));

        for (const i of inner) {
          log.push(`${o}${i}`);
          yield* cancForAwait.next();
        }

        yield* cancForAwait.next();
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual(['1a', '1b', 'inner', '2a', '2b', 'inner', 'outer']);
  });

  it('nested coroutine has its own registry: sugar stays local', async () => {
    const log: any[] = [];
    const innerCo = cancAsync(function* () {
      const inner = yield* cancForAwait(makeLoggedSource(['x', 'y'], log, 'inner'));

      for (const item of inner) {
        yield* cancForAwait.next();
        log.push(item);
      }

      return log;
    });

    const outerCo = cancAsync(function* () {
      const outer = yield* cancForAwait(makeLoggedSource([1, 2], log, 'outer'));

      for (const item of outer) {
        log.push(item);
        yield* cancAwait(innerCo());
        yield* outer.next();
      }

      return log;
    });

    const result = await outerCo();
    expect(result).toEqual([1, 'x', 'inner', 'y', 2, 'x', 'inner', 'y', 'outer']);
  });

  it('adversarial: enter loops out of registration order', async () => {
    const log: any[] = [];
    const co = cancAsync(function* () {
      const handleA = yield* cancForAwait(makeLoggedSource([1, 2], log, 'A'));
      const handleB = yield* cancForAwait(makeLoggedSource(['x', 'y'], log, 'B'));

      let first = true;
      for (const b of handleB) {
        if (first) {
          first = false;
          for (const a of handleA) {
            log.push(`${b}${a}`);
            yield* cancForAwait.next();
          }
        }
        log.push(`step-${b}`);
        yield* cancForAwait.next();
      }

      return log;
    });

    const result = await co();
    expect(result).toEqual(['x1', 'x2', 'A', 'step-x', 'step-y', 'B']);
  });

  it('sugar in a finally during a cancel drain rejects IterationError', async () => {
    const log: string[] = [];
    const gate = new Promise<void>(() => undefined);

    const co = cancAsync(function* () {
      try {
        for (const value of yield* cancForAwait(makeLoggedSource([1, 2, 3], log))) {
          log.push(`item-${value}`);
          yield* cancAwait(gate);
          yield* cancForAwait.next();
        }
      } finally {
        yield* cancForAwait.next();
      }

      return 'done';
    });

    const promise = co();
    // the finally throws, so this rejects with IterationError rather than a cancel
    promise.catch(() => undefined);

    await flush();
    expect(log).toEqual(['item-1']);

    promise.cancel();
    await flush();

    const error = await promise.catch((reason: any) => reason);
    expect(error).toBeInstanceOf(IterationError);
    expect((error as Error).message).toContain('No active forAwait loop');
    expect(log).toEqual(['item-1', 'cleanup']);
  });

  it('sugar caught inside a finally during a cancel drain still rejects CancelError', async () => {
    const log: string[] = [];
    const caught: unknown[] = [];
    const gate = new Promise<void>(() => undefined);

    const co = cancAsync(function* () {
      try {
        for (const value of yield* cancForAwait(makeLoggedSource([1, 2, 3], log))) {
          log.push(`item-${value}`);
          yield* cancAwait(gate);
          yield* cancForAwait.next();
        }
      } finally {
        try {
          yield* cancForAwait.next();
        } catch (err) {
          caught.push(err);
        }
      }

      return 'done';
    });

    const promise = co();
    promise.catch(suppressCancel);

    await flush();
    expect(log).toEqual(['item-1']);

    promise.cancel();
    await flush();

    const error = await promise.catch((reason: any) => reason);
    expect(isCancelError(error)).toBe(true);
    expect(error).toBeInstanceOf(CancelError);
    expect(caught).toHaveLength(1);
    expect(caught[0]).toBeInstanceOf(IterationError);
    expect((caught[0] as Error).message).toContain('No active forAwait loop');
    expect(log).toEqual(['item-1', 'cleanup']);
  });
});

describe('loop lookahead and completion', () => {
  it('exhausts without error on the final turn when source completes', async () => {
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(makeLoggedSource([1, 2, 3]));

      for (const value of loop) {
        seen.push(value);
        yield* loop.next();
      }

      return 'finished';
    });

    await expect(co()).resolves.toBe('finished');
    expect(seen).toEqual([1, 2, 3]);
  });

  it('lookahead: advance-first + break pulls 2 items for 1 processed item', async () => {
    const { source, state } = makeCountingSource([10, 20, 30]);
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(source);

      for (const item of loop) {
        yield* loop.next();
        seen.push(item);
        break;
      }

      return 'done';
    });

    await expect(co()).resolves.toBe('done');
    expect(seen).toEqual([10]);
    expect(state.pulls).toBe(2);
  });

  it('lookahead: advance-last + break pulls 1 item for 1 processed item', async () => {
    const { source, state } = makeCountingSource([10, 20, 30]);
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(source);

      for (const item of loop) {
        seen.push(item);
        if (item === 10) {
          break;
        }
        yield* loop.next();
      }

      return 'done';
    });

    await expect(co()).resolves.toBe('done');
    expect(seen).toEqual([10]);
    expect(state.pulls).toBe(1);
  });

  it('lookahead: full drain pulls 4 items for 3 items (3 items + 1 done signal)', async () => {
    const { source, state } = makeCountingSource([10, 20, 30]);
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait(source);

      for (const item of loop) {
        yield* loop.next();
        seen.push(item);
      }

      return 'done';
    });

    await expect(co()).resolves.toBe('done');
    expect(seen).toEqual([10, 20, 30]);
    expect(state.pulls).toBe(4);
  });
});
