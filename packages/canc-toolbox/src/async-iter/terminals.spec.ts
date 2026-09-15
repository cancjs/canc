import { cancAwait } from '@cancjs/coroutine';
import type { CancelablePromise } from '@cancjs/promise';
import { CancelablePromise as Cancelable, isCancelError, suppressCancel } from '@cancjs/promise';

import type { TPromiseCtor } from '../../../_toolbox/async-iter';
import * as tb from '../../../_toolbox/async-iter/terminals';
import * as asyncIter from './index';

// Deterministic microtask flush: drains the queue N times so chained then-callbacks all run, with
// no arbitrary sleeps.
const flush = async (times = 24) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

interface ISourceProbe {
  produced: number;
  closed: number;
}

/**
 * A source that reports how many values it produced and how many times it was closed. Left endless
 * by default so that a closed count of 1 can only mean an early `return()`, never exhaustion.
 */
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

interface IWork {
  /** Stays pending until it is canceled, standing in for real work an item waits on. */
  promise: CancelablePromise<number>;
  state: { aborted: number };
}

/** Work that reports being aborted, which is how an item's cancel is observed from the outside. */
function pendingWork(): IWork {
  const state = { aborted: 0 };

  const promise = new Cancelable<number>((_resolve, _reject, ctx) => {
    ctx.handleCancel(() => {
      state.aborted++;
    });
  });

  promise.catch(suppressCancel);

  return { promise, state };
}

/** The reason a canceled terminal settled with, without letting the rejection go unhandled. */
async function reasonOf(promise: CancelablePromise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

function* sumBody(accumulator: number, value: number): Generator<PromiseLike<number>, number, number> {
  const resolved = yield Promise.resolve(value);

  return accumulator + resolved;
}

describe('async iterator terminal operators', () => {
  describe('toArray', () => {
    it('collects every value of an async source', async () => {
      const { iterable } = makeSource(3);

      await expect(asyncIter.toArray<number>()(iterable)).resolves.toEqual([0, 1, 2]);
    });

    it('collects every value of a sync source', async () => {
      await expect(asyncIter.toArray<number>()([1, 2, 3])).resolves.toEqual([1, 2, 3]);
    });

    it('resolves an empty array for an empty source', async () => {
      await expect(asyncIter.toArray<number>()([])).resolves.toEqual([]);
    });

    it('returns a cancelable promise', async () => {
      const promise = asyncIter.toArray<number>()([1, 2]);

      expect('cancel' in promise).toBe(true);
      expect(typeof promise.cancel).toBe('function');

      await promise;
    });
  });

  describe('reduce', () => {
    it('folds from an initial value, indexing from the first item', async () => {
      const indexes: number[] = [];

      const total = await asyncIter.reduce<number, number>((accumulator, value, index) => {
        indexes.push(index);

        return accumulator + value;
      }, 100)([10, 20, 30]);

      expect(total).toBe(160);
      expect(indexes).toEqual([0, 1, 2]);
    });

    it('seeds from the first item when no initial value is given', async () => {
      const indexes: number[] = [];

      const total = await asyncIter.reduce<number>((accumulator, value, index) => {
        indexes.push(index);

        return accumulator + value;
      })([10, 20, 30]);

      expect(total).toBe(60);
      expect(indexes).toEqual([1, 2]);
    });

    it('keeps the initial value for an empty source', async () => {
      await expect(asyncIter.reduce<number, number>((accumulator, value) => accumulator + value, 7)([])).resolves.toBe(
        7,
      );
    });

    it('rejects with a TypeError for an empty source and no initial value', async () => {
      await expect(asyncIter.reduce<number>((accumulator, value) => accumulator + value)([])).rejects.toThrow(
        TypeError,
      );
    });

    it('awaits an async reducer', async () => {
      const total = await asyncIter.reduce<number, number>(
        async (accumulator, value) => accumulator + value,
        0,
      )([1, 2, 3]);

      expect(total).toBe(6);
    });

    it('drives a generator reducer', async () => {
      await expect(asyncIter.reduce<number, number>(sumBody, 0)([1, 2, 3])).resolves.toBe(6);
    });
  });

  describe('find', () => {
    it('resolves the first accepted value and closes the source', async () => {
      const { probe, iterable } = makeSource();

      await expect(asyncIter.find<number>((value) => value >= 2)(iterable)).resolves.toBe(2);
      expect(probe.produced).toBe(3);
      expect(probe.closed).toBe(1);
    });

    it('resolves undefined when nothing is accepted', async () => {
      const { iterable } = makeSource(3);

      await expect(asyncIter.find<number>((value) => value > 99)(iterable)).resolves.toBeUndefined();
    });

    it('awaits an async predicate', async () => {
      await expect(asyncIter.find<number>(async (value) => value === 20)([10, 20, 30])).resolves.toBe(20);
    });
  });

  describe('some', () => {
    it('short-circuits on the first accepted value and closes the source', async () => {
      const { probe, iterable } = makeSource();

      await expect(asyncIter.some<number>((value) => value >= 2)(iterable)).resolves.toBe(true);
      expect(probe.produced).toBe(3);
      expect(probe.closed).toBe(1);
    });

    it('resolves false for an exhausted source', async () => {
      await expect(asyncIter.some<number>((value) => value > 99)([1, 2, 3])).resolves.toBe(false);
    });

    it('resolves false for an empty source', async () => {
      await expect(asyncIter.some<number>(() => true)([])).resolves.toBe(false);
    });
  });

  describe('every', () => {
    it('short-circuits on the first rejected value and closes the source', async () => {
      const { probe, iterable } = makeSource();

      await expect(asyncIter.every<number>((value) => value < 2)(iterable)).resolves.toBe(false);
      expect(probe.produced).toBe(3);
      expect(probe.closed).toBe(1);
    });

    it('resolves true when every value is accepted', async () => {
      await expect(asyncIter.every<number>((value) => value > 0)([1, 2, 3])).resolves.toBe(true);
    });

    it('resolves true for an empty source', async () => {
      await expect(asyncIter.every<number>(() => false)([])).resolves.toBe(true);
    });
  });

  describe('forEach', () => {
    it('visits every value in order and resolves undefined', async () => {
      const seen: number[] = [];

      await expect(
        asyncIter.forEach<number>((value) => {
          seen.push(value);
        })([1, 2, 3]),
      ).resolves.toBeUndefined();

      expect(seen).toEqual([1, 2, 3]);
    });

    it('waits for an async callback before pulling the next value', async () => {
      const order: string[] = [];
      const { iterable } = makeSource(3);

      await asyncIter.forEach<number>(async (value) => {
        order.push(`start ${value}`);
        await Promise.resolve();
        order.push(`end ${value}`);
      })(iterable);

      expect(order).toEqual(['start 0', 'end 0', 'start 1', 'end 1', 'start 2', 'end 2']);
    });

    it('drives a generator callback', async () => {
      const seen: number[] = [];

      function* visit(value: number): Generator<PromiseLike<number>, void, number> {
        const resolved = yield Promise.resolve(value);
        seen.push(resolved);
      }

      await asyncIter.forEach<number>(visit)([1, 2, 3]);

      expect(seen).toEqual([1, 2, 3]);
    });
  });

  describe('includes', () => {
    it('short-circuits on a match and closes the source', async () => {
      const { probe, iterable } = makeSource();

      await expect(asyncIter.includes(2)(iterable)).resolves.toBe(true);
      expect(probe.produced).toBe(3);
      expect(probe.closed).toBe(1);
    });

    it('resolves false when the value never appears', async () => {
      await expect(asyncIter.includes(9)([1, 2, 3])).resolves.toBe(false);
    });

    it('matches NaN against NaN', async () => {
      await expect(asyncIter.includes(NaN)([1, NaN, 3])).resolves.toBe(true);
    });

    it('matches -0 against +0', async () => {
      await expect(asyncIter.includes(-0)([0])).resolves.toBe(true);
      await expect(asyncIter.includes(0)([-0])).resolves.toBe(true);
    });
  });

  describe('cancellation', () => {
    it('closes the source, rejects with a cancel error and stops pulling', async () => {
      const { probe, iterable } = makeSource();
      const promise = asyncIter.toArray<number>()(iterable);

      promise.catch(suppressCancel);

      await flush();
      expect(probe.produced).toBeGreaterThan(0);

      promise.cancel();

      const reason = await promise.catch((error: unknown) => error);

      expect(isCancelError(reason)).toBe(true);

      await flush();
      const producedAfterCancel = probe.produced;

      await flush();

      expect(probe.closed).toBe(1);
      expect(probe.produced).toBe(producedAfterCancel);
    });

    it('closes the source when a callback fails', async () => {
      const { probe, iterable } = makeSource();
      const failure = new Error('callback failed');

      await expect(
        asyncIter.forEach<number>((value) => {
          if (value === 1) {
            throw failure;
          }
        })(iterable),
      ).rejects.toBe(failure);

      expect(probe.closed).toBe(1);
    });

    it('cancels an in-flight generator callback and runs its finally once', async () => {
      const { probe, iterable } = makeSource();
      const work = pendingWork();
      const cleanup = { ran: 0 };

      const promise = asyncIter.find<number>(function* accept(value: number) {
        try {
          const resolved: number = yield* cancAwait(work.promise);

          return resolved === value;
        } finally {
          cleanup.ran++;
        }
      })(iterable);

      promise.catch(suppressCancel);

      await flush();

      expect(work.state.aborted).toBe(0);
      expect(cleanup.ran).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(work.state.aborted).toBe(1);
      expect(cleanup.ran).toBe(1);
      expect(probe.closed).toBe(1);
    });

    it('cancels an in-flight generator visitor and runs its finally once', async () => {
      const { probe, iterable } = makeSource();
      const work = pendingWork();
      const cleanup = { ran: 0 };

      const promise = asyncIter.forEach<number>(function* visit() {
        try {
          yield* cancAwait(work.promise);
        } finally {
          cleanup.ran++;
        }
      })(iterable);

      promise.catch(suppressCancel);

      await flush();

      expect(cleanup.ran).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(work.state.aborted).toBe(1);
      expect(cleanup.ran).toBe(1);
      expect(probe.closed).toBe(1);
    });
  });

  describe('callback failures', () => {
    it('rejects with the value a callback threw', async () => {
      const failure = { code: 404, retryable: true };
      const { probe, iterable } = makeSource();

      await expect(
        asyncIter.forEach<number>(() => {
          throw failure;
        })(iterable),
      ).rejects.toBe(failure);

      expect(probe.closed).toBe(1);
    });

    it('rejects with the value a generator callback threw', async () => {
      const failure = { code: 500, retryable: false };

      await expect(
        asyncIter.forEach<number>(function* boom() {
          yield Promise.resolve(1);

          throw failure;
        })([1, 2, 3]),
      ).rejects.toBe(failure);
    });

    it('rejects with the value a generator callback failed to catch', async () => {
      const failure = { code: 503, retryable: true };

      await expect(
        asyncIter.forEach<number>(function* boom() {
          yield Promise.reject(failure);
        })([1, 2, 3]),
      ).rejects.toBe(failure);
    });
  });

  describe('inputs', () => {
    it('rejects a source that is not iterable', async () => {
      await expect(asyncIter.toArray<number>()(42 as unknown as AsyncIterable<number>)).rejects.toThrow(TypeError);
    });
  });

  describe('shared algorithm', () => {
    it('drives against a plain promise implementation, which carries no cancel', async () => {
      const plainToArray = tb.toArrayFactory({ Impl: Promise as unknown as TPromiseCtor });
      const promise = plainToArray<number>([1, 2, 3]);

      expect('cancel' in promise).toBe(false);
      await expect(promise).resolves.toEqual([1, 2, 3]);
    });
  });
});
