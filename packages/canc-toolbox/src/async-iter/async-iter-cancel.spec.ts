import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type { CancelablePromise } from '@cancjs/promise';
import { CancelablePromise as Cancelable, isCancelError, suppressCancel } from '@cancjs/promise';

import * as asyncIter from './index';

/**
 * Drain the microtask queue a bounded number of times. Bounded on purpose: an endless source and a
 * driver that pulls again as soon as the previous pull settles never reach a timer, so a macrotask
 * flush would hang instead of returning.
 */
const flush = async (times = 64): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

interface ITrace {
  /** Values the source handed out. */
  pulls: number;
  /** Times the source ran its own cleanup, which only a `return()` can trigger here. */
  closes: number;
}

/**
 * An endless source, so a close count of one can only mean the cleanup ran through a `return()`
 * that reached all the way up the chain, never exhaustion.
 */
function endlessSource(): { source: AsyncIterable<number>; trace: ITrace } {
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

/** The reason a canceled drive settled with, without letting the rejection go unhandled. */
async function reasonOf(promise: CancelablePromise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe('async iterator cancellation', () => {
  describe('pulls as cancel points', () => {
    it('stops pulling at the item the cancel landed on', async () => {
      const { source, trace } = endlessSource();
      const seen: number[] = [];
      let cancel = (): void => undefined;

      const promise: CancelablePromise<number[]> = asyncIter.pipe(
        source,
        [
          asyncIter.map((value: number) => {
            seen.push(value);

            if (seen.length === 3) {
              cancel();
            }

            return value;
          }),
        ],
        asyncIter.toArray<number>(),
      );

      cancel = () => {
        promise.cancel();
      };
      promise.catch(suppressCancel);

      expect(isCancelError(await reasonOf(promise))).toBe(true);
      expect(seen).toEqual([0, 1, 2]);
      expect(trace.pulls).toBe(3);

      await flush();

      expect(trace.pulls).toBe(3);
      expect(trace.closes).toBe(1);
    });

    it('closes the source when the cancel lands on the very first pull', async () => {
      const { source, trace } = endlessSource();

      const promise: CancelablePromise<number[]> = asyncIter.pipe(source, [], asyncIter.toArray<number>());

      promise.catch(suppressCancel);
      // The drive opens the source and asks for its first value synchronously, so this cancel lands
      // while that one pull is in flight and nothing has been handed to the terminal yet.
      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(trace.pulls).toBe(1);
      expect(trace.closes).toBe(1);
    });
  });

  describe('closing the source through a chain', () => {
    it('runs the source cleanup once when a canceled drive unwinds every operator', async () => {
      const { source, trace } = endlessSource();
      const gate = pendingWork();

      const promise: CancelablePromise<number[]> = asyncIter.pipe(
        source,
        [
          asyncIter.filter((value: number) => value % 2 === 0),
          asyncIter.map((value: number) => (value === 2 ? gate.promise : value)),
          asyncIter.take<number>(5),
        ],
        asyncIter.toArray<number>(),
      );

      promise.catch(suppressCancel);

      await flush();

      expect(trace.pulls).toBe(3);
      expect(trace.closes).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(trace.closes).toBe(1);
      expect(trace.pulls).toBe(3);
    });

    it('runs the source cleanup once when the chain is built from the wrapper', async () => {
      const { source, trace } = endlessSource();
      const gate = pendingWork();

      const promise: CancelablePromise<number[]> = asyncIter
        .from(source)
        .pipe(
          [asyncIter.map((value: number) => (value === 1 ? gate.promise : value)), asyncIter.drop<number>(0)],
          asyncIter.toArray<number>(),
        );

      promise.catch(suppressCancel);

      await flush();

      expect(trace.closes).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(trace.closes).toBe(1);
    });
  });

  describe('short circuits', () => {
    it('closes the source when find stops early', async () => {
      const { source, trace } = endlessSource();

      const promise: CancelablePromise<number | undefined> = asyncIter.pipe(
        source,
        [],
        asyncIter.find<number>((value: number) => value === 3),
      );

      await expect(promise).resolves.toBe(3);

      await flush();

      expect(trace.pulls).toBe(4);
      expect(trace.closes).toBe(1);
    });

    it('closes the source when take reaches its limit', async () => {
      const { source, trace } = endlessSource();

      const promise: CancelablePromise<number[]> = asyncIter.pipe(
        source,
        [asyncIter.take<number>(2)],
        asyncIter.toArray<number>(),
      );

      await expect(promise).resolves.toEqual([0, 1]);

      await flush();

      expect(trace.pulls).toBe(2);
      expect(trace.closes).toBe(1);
    });

    it('closes the source when a short circuit follows other operators', async () => {
      const { source, trace } = endlessSource();

      const promise: CancelablePromise<boolean> = asyncIter.pipe(
        source,
        [asyncIter.map((value: number) => value * 2), asyncIter.filter((value: number) => value > 0)],
        asyncIter.some<number>((value: number) => value >= 4),
      );

      await expect(promise).resolves.toBe(true);

      await flush();

      expect(trace.closes).toBe(1);
    });
  });

  describe('laziness', () => {
    it('pulls nothing until a terminal drives the chain', async () => {
      const { source, trace } = endlessSource();

      const lazy = asyncIter.pipe(source, [
        asyncIter.map((value: number) => value * 2),
        asyncIter.filter((value: number) => value % 4 === 0),
        asyncIter.take<number>(2),
      ]);

      await flush();

      expect(trace.pulls).toBe(0);
      expect(trace.closes).toBe(0);
      expect(asyncIter.isPipeable(lazy)).toBe(true);

      await expect(asyncIter.toArray<number>()(lazy)).resolves.toEqual([0, 4]);
      expect(trace.pulls).toBeGreaterThan(0);
    });

    it('pulls nothing while a wrapper chain is only being built', async () => {
      const { source, trace } = endlessSource();

      asyncIter.from(source).pipe([asyncIter.map((value: number) => value), asyncIter.take<number>(1)]);

      await flush();

      expect(trace.pulls).toBe(0);
    });
  });

  describe('callback forms', () => {
    it('cancels the work an in-flight generator callback waits on and runs its cleanup', async () => {
      const { source, trace } = endlessSource();
      const work = pendingWork();
      const cleanup = { ran: 0 };

      const promise: CancelablePromise<number[]> = asyncIter.pipe(
        source,
        [
          asyncIter.map(function* enrich(value: number) {
            try {
              const resolved: number = yield* cancAwait(work.promise);

              return resolved + value;
            } finally {
              cleanup.ran++;
            }
          }),
        ],
        asyncIter.toArray<number>(),
      );

      promise.catch(suppressCancel);

      await flush();

      expect(work.state.aborted).toBe(0);
      expect(cleanup.ran).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(work.state.aborted).toBe(1);
      expect(cleanup.ran).toBe(1);
      expect(trace.closes).toBe(1);
    });

    it('cancels the cancelable promise a callback returned', async () => {
      const { source, trace } = endlessSource();
      const work = pendingWork();

      const promise: CancelablePromise<void> = asyncIter.pipe(
        source,
        [asyncIter.map(() => work.promise)],
        asyncIter.forEach<number>(() => undefined),
      );

      promise.catch(suppressCancel);

      await flush();

      expect(work.state.aborted).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(work.state.aborted).toBe(1);
      expect(trace.closes).toBe(1);
    });

    it('leaves an async callback running, which is the tradeoff the generator form avoids', async () => {
      const { source, trace } = endlessSource();
      const work = pendingWork();

      const promise: CancelablePromise<number[]> = asyncIter.pipe(
        source,
        [asyncIter.map(async () => work.promise)],
        asyncIter.toArray<number>(),
      );

      promise.catch(suppressCancel);

      await flush();

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      // The source is still closed. Only the work the async callback holds is out of reach, because
      // an async function body cannot be resumed with a return completion from the outside.
      expect(trace.closes).toBe(1);
      expect(work.state.aborted).toBe(0);

      work.promise.cancel();
      await flush();

      expect(work.state.aborted).toBe(1);
    });

    it('finishes a sync callback chain normally', async () => {
      const { source, trace } = endlessSource();

      const promise: CancelablePromise<number[]> = asyncIter.pipe(
        source,
        [asyncIter.map((value: number) => value + 1), asyncIter.take<number>(3)],
        asyncIter.toArray<number>(),
      );

      await expect(promise).resolves.toEqual([1, 2, 3]);
      expect(trace.closes).toBe(1);
    });
  });

  describe('inside a coroutine', () => {
    it('closes the source when the coroutine driving the chain is canceled', async () => {
      const { source, trace } = endlessSource();
      const work = pendingWork();

      const run = cancAsync(function* collect() {
        return yield* cancAwait(
          asyncIter.pipe(
            source,
            [asyncIter.map((value: number) => (value === 2 ? work.promise : value)), asyncIter.take<number>(10)],
            asyncIter.toArray<number>(),
          ) as CancelablePromise<number[]>,
        );
      });

      const promise = run();

      promise.catch(suppressCancel);

      await flush();

      expect(trace.pulls).toBe(3);
      expect(trace.closes).toBe(0);

      promise.cancel();

      expect(isCancelError(await reasonOf(promise))).toBe(true);

      await flush();

      expect(trace.closes).toBe(1);
      expect(work.state.aborted).toBe(1);
      expect(trace.pulls).toBe(3);
    });

    it('resolves through a coroutine when nothing cancels it', async () => {
      const { source, trace } = endlessSource();

      const run = cancAsync(function* collect() {
        return yield* cancAwait(
          asyncIter.pipe(source, [asyncIter.take<number>(3)], asyncIter.toArray<number>()) as CancelablePromise<
            number[]
          >,
        );
      });

      await expect(run()).resolves.toEqual([0, 1, 2]);
      expect(trace.closes).toBe(1);
    });
  });
});
