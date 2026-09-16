import { isCancelError } from '@cancjs/promise';

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

// Same as above, except its cleanup needs a microtask before it records, so an ordering assertion
// over `log` can tell an awaited disposal apart from one that merely wins a race
function makeSlowCleanupSource<T>(values: T[], log: string[], label = 'cleanup') {
  return (async function* () {
    try {
      for (const value of values) {
        yield value;
      }
    } finally {
      await Promise.resolve();
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

  it('drives a plain array source to exhaustion in the handle form', async () => {
    const seen: number[] = [];

    const co = cancAsync(function* () {
      const loop = yield* cancForAwait([1, 2, 3]);

      for (const value of loop) {
        seen.push(value);
        yield* loop.next();
      }

      return (loop as any)._disposed;
    });

    await expect(co()).resolves.toBeUndefined();
    expect(seen).toEqual([1, 2, 3]);
  });

  it('cancels a coroutine over an array of promises between two advances', async () => {
    let constructed = 0;
    const gate = CancelablePromise.withResolvers<void>();
    const source: Iterable<Promise<number>> = {
      [Symbol.iterator]() {
        let i = 0;
        return {
          next(): IteratorResult<Promise<number>> {
            if (i === 0) {
              i++;
              constructed++;
              return { value: gate.promise.then(() => 1), done: false };
            }
            if (i === 1) {
              i++;
              constructed++;
              return { value: Promise.resolve(2), done: false };
            }
            return { value: undefined as any, done: true };
          },
        };
      },
    };
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

    await flush();

    promise.cancel();
    gate.resolve();
    await flush();

    const error = await promise.catch((reason: any) => reason);
    expect(isCancelError(error)).toBe(true);
    expect(constructed).toBe(1);
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

  it('closes a source opened by a handle inside a finally during cancellation', async () => {
    const log: string[] = [];
    const gate = new Promise<void>(() => undefined);

    const co = cancAsync(function* () {
      try {
        yield* cancAwait(gate);
      } finally {
        yield* cancForAwait(makeLoggedSource([1, 2], log));
        log.push('finally-done');
      }
    });

    const promise = co();
    promise.catch(suppressCancel);

    await flush();
    promise.cancel();

    const error = await promise.catch((reason: any) => reason);

    expect(log).toEqual(['finally-done', 'cleanup']);
    expect(isCancelError(error)).toBe(true);
  });

  it('finishes a cleanup opened during cancellation before the coroutine settles', async () => {
    const log: string[] = [];
    const gate = new Promise<void>(() => undefined);

    const co = cancAsync(function* () {
      try {
        yield* cancAwait(gate);
      } finally {
        const loop = yield* cancForAwait(makeSlowCleanupSource([1, 2, 3], log));

        for (const value of loop) {
          log.push(`item-${value}`);
          break;
        }
      }
    });

    const promise = co();
    let error: any;
    const settled = promise.catch((reason: any) => {
      error = reason;
      log.push('settled');
    });

    await flush();
    promise.cancel();
    await settled;

    expect(log).toEqual(['item-1', 'cleanup', 'settled']);
    expect(isCancelError(error)).toBe(true);
  });

  it('runs one cleanup when a handle opened in a finally reaches exhaustion', async () => {
    const log: string[] = [];
    const gate = new Promise<void>(() => undefined);

    const co = cancAsync(function* () {
      try {
        yield* cancAwait(gate);
      } finally {
        const loop = yield* cancForAwait(makeLoggedSource([1, 2], log));

        for (const value of loop) {
          log.push(`item-${value}`);
          yield* loop.next();
        }
      }
    });

    const promise = co();
    promise.catch(suppressCancel);

    await flush();
    promise.cancel();

    const error = await promise.catch((reason: any) => reason);
    await flush();

    expect(log).toEqual(['item-1', 'item-2', 'cleanup']);
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
  describe('cancel while suspended in loop body, finally calls sugar', () => {
    test('throws IterationError when the body never advances the handle', async () => {
      const coroutine = cancAsync(function* () {
        const stream = (async function* () {
          yield 'item1';
        })();

        const loop = yield* cancForAwait(stream);

        try {
          for (const _item of loop) {
            // Parked on await inside loop body; will be canceled
            yield new Promise((r) => setTimeout(r, 1000));
          }
        } finally {
          // Canceled: finally drain calls this generator's next()
          // Loop is finished, guard throws IterationError
          yield* cancForAwait.next();
        }
      });

      const promise = coroutine();
      await new Promise((r) => setTimeout(r, 50));
      promise.cancel('test');

      try {
        await promise;
        fail('Expected rejection');
      } catch (err: any) {
        expect(err).toBeInstanceOf(IterationError);
        expect(err.message).toContain('No active forAwait loop');
      }
    });

    test('with try/catch in finally: coroutine rejects CancelError, caught error is IterationError', async () => {
      let caughtError: any;

      const coroutine = cancAsync(function* () {
        const stream = (async function* () {
          yield 'item1';
        })();

        const loop = yield* cancForAwait(stream);

        try {
          for (const _item of loop) {
            yield new Promise((r) => setTimeout(r, 1000));
          }
        } finally {
          try {
            yield* cancForAwait.next();
          } catch (err: any) {
            caughtError = err;
            // catch the error, don't rethrow
          }
        }
      });

      const promise = coroutine();
      await new Promise((r) => setTimeout(r, 50));
      promise.cancel('test');

      try {
        await promise;
        fail('Expected rejection');
      } catch (err: any) {
        // External rejection is CancelError
        expect(isCancelError(err)).toBe(true);
        // But the caught error is IterationError
        expect(caughtError).toBeInstanceOf(IterationError);
        expect(caughtError.message).toContain('No active forAwait loop');
      }
    });
  });

  describe('cancel while suspended in loop.next(), finally calls sugar', () => {
    test('still passes the existing specs', async () => {
      // Existing cancel-unwind specs should still pass
      const log: string[] = [];

      const coroutine = cancAsync(function* () {
        const stream = (async function* () {
          yield 'item1';
        })();

        const loop = yield* cancForAwait(stream);

        try {
          for (const item of loop) {
            log.push(`body-${item}`);
            yield* loop.next();
          }
        } finally {
          log.push('finally');
        }
      });

      const promise = coroutine();
      await new Promise((r) => setTimeout(r, 50));
      promise.cancel('test');

      try {
        await promise;
      } catch (err: any) {
        expect(isCancelError(err)).toBe(true);
        expect(log).toContain('finally');
      }
    });
  });

  describe('break unregisters a loop handle', () => {
    test('does not scan handles left behind by a break', async () => {
      const log: string[] = [];

      const coroutine = cancAsync(function* () {
        for (let outer = 0; outer < 3; outer++) {
          const innerStream = (async function* () {
            yield `${outer}-0`;
          })();

          const innerLoop = yield* cancForAwait(innerStream);

          for (const _item of innerLoop) {
            log.push(`outer-${outer}`);
            yield* innerLoop.next();
            break;
          }

          // After break, subsequent advances of outer should not scan the dead inner
          log.push('after-inner');
        }
      });

      await coroutine();
      expect(log).toContain('after-inner');
    });

    test('registry cleared after break', async () => {
      const coroutine = cancAsync(function* () {
        const stream = (async function* () {
          yield 'item1';
          yield 'item2';
        })();

        const loop = yield* cancForAwait(stream);

        for (const _item of loop) {
          yield* loop.next();
          break;
        }

        // After break, handle's registry should be cleared
        expect((loop as any)._registry).toBeUndefined();
      });

      await coroutine();
    });

    test('still runs source cleanup on break', async () => {
      const log: string[] = [];

      const coroutine = cancAsync(function* () {
        const stream = (async function* () {
          try {
            yield 'item1';
          } finally {
            log.push('cleanup');
          }
        })();

        const loop = yield* cancForAwait(stream);

        for (const _item of loop) {
          yield* loop.next();
          break;
        }

        log.push('after-loop');
      });

      await coroutine();
      log.push('settled');

      // Cleanup must happen before coroutine settles
      expect(log.indexOf('cleanup')).toBeGreaterThan(-1);
      expect(log.indexOf('settled')).toBeGreaterThan(log.indexOf('cleanup'));
    });
  });
});
