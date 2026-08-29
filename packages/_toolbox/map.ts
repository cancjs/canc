import { AbortError, createAggregateError } from '../_util';
import { construct, IExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { limitFactory } from './limit';

/** How `map` runs its mappers and what it does with a failure. */
export interface IMapOptions {
  /**
   * How many mappers may run at once. Defaults to `Infinity`, which starts every item at once and
   * leaves the pacing to the mapper.
   */
  concurrency?: number;
  /**
   * Whether the first rejection ends the run. True by default, matching `all`: the siblings are
   * canceled and the returned promise rejects with that reason. Set it to false to run every item
   * to a settlement and reject with an AggregateError of the failures instead.
   */
  stopOnError?: boolean;
}

/** The per-item callback. It may return a value, a promise, or a cancelable. */
export type TMapper<T, R> = (item: T, index: number) => R | PromiseLike<R>;

/** One item's failure, kept with its index so the aggregate reads in input order. */
interface IFailure {
  index: number;
  reason: any;
}

// Read the input once up front: the index each result is filed under has to be fixed before
// anything runs, and a sync iterable has no length to ask for.
function materialize<T>(input: Iterable<T>): T[] {
  if (Array.isArray(input)) {
    const arr = input as T[];
    const items = new Array<T>(arr.length);
    for (let i = 0; i < arr.length; i++) {
      items[i] = arr[i];
    }
    return items;
  }

  const items: T[] = [];

  for (const item of input) items.push(item);

  return items;
}

/** Bind `map` to one promise implementation following the dependency-injection recipe. */
export function mapFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  const limit = limitFactory<K>(deps);

  /**
   * Map every item through `mapper`, running at most `concurrency` of them at once.
   *
   * The result array is always in input order, whatever order the mappers settle in. A hole in a
   * sparse input array is treated as `undefined` and visited. Rejects with a RangeError if
   * `concurrency` is not an integer of at least 1 (or Infinity). By default the first rejection
   * cancels the siblings and the returned promise rejects with that reason, the way `all` behaves;
   * under `stopOnError: false` every item runs to a settlement and the returned promise rejects
   * with an AggregateError carrying the failures in input order.
   *
   * Against a cancelable implementation, canceling the returned promise cancels whatever is in
   * flight and drops what is still queued, so a queued mapper is never called at all. A plain
   * Promise implementation has no cancel surface: the returned promise cannot be canceled, and on
   * an early rejection the queued mappers are dropped while the running ones are left to finish.
   */
  return function map<T, R>(input: Iterable<T>, mapper: TMapper<T, R>, options?: IMapOptions): TPromiseOf<K, R[]> {
    const concurrency = options?.concurrency !== undefined ? options.concurrency : Infinity;
    const stopOnError = options?.stopOnError !== false;

    return construct<R[], K>(deps.Impl, function (resolve, reject, ctx?: IExecutorCtx) {
      // Ahead of the empty-input shortcut, so a bad concurrency is rejected either way.
      const limited = limit(concurrency);
      const items = materialize(input);

      if (items.length === 0) {
        resolve([]);
        return;
      }

      const results = new Array<R>(items.length);
      const failures: IFailure[] = [];
      let remaining = items.length;
      let settled = false;

      if (ctx) {
        ctx.handleCancel(function () {
          // settled first, so the sibling cancellations below do not re-enter the item handlers
          settled = true;
          limited.cancel();
        });
      }

      const finish = (): void => {
        settled = true;

        if (failures.length === 0) {
          resolve(results);
          return;
        }

        failures.sort(function (a, b) {
          return a.index - b.index;
        });

        const reasons = failures.map(function (failure) {
          return failure.reason;
        });

        reject(createAggregateError(reasons, 'map: ' + reasons.length + ' of ' + items.length + ' items failed'));
      };

      items.forEach(function (item, index) {
        const wrappedMapper = function (it: T, idx: number) {
          if (settled) throw new AbortError('map: stopped');

          let raw: R | PromiseLike<R>;
          try {
            raw = mapper(it, idx);
          } catch (reason) {
            if (stopOnError && !settled) {
              settled = true;
              reject(reason);
              limited.cancel();
            }
            throw reason;
          }

          if (isThenableLike<R>(raw)) {
            return raw.then(undefined, function (reason: any) {
              if (stopOnError && !settled) {
                settled = true;
                reject(reason);
                limited.cancel();
              }
              throw reason;
            });
          }

          return raw;
        };

        // The limiter's handle is what carries cancellation down to the mapper's own promise, so
        // the raw handle is what gets canceled; this only reads its settlement.
        const handle = limited(wrappedMapper, item, index) as unknown as PromiseLike<R>;

        handle.then(
          function (value) {
            if (settled) return;

            results[index] = value;

            if (--remaining === 0) finish();
          },
          function (reason) {
            if (settled) return;

            if (stopOnError) {
              settled = true;
              limited.cancel();
              reject(reason);
              return;
            }

            failures.push({ index: index, reason: reason });

            if (--remaining === 0) finish();
          },
        );
      });
    });
  };
}
