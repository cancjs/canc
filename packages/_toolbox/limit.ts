import { AbortError } from '../_util';
import { construct, IExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { isCancelableLike, isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/**
 * A concurrency limiter: callable like the function it guards, plus counters, a settable
 * `concurrency`, and a `cancel`.
 */
export interface ILimited<K extends IPromiseKind = IPromiseLikeKind> {
  /**
   * Schedules `fn`, calling it with `args` once a slot is free. The returned promise settles with
   * whatever `fn` produced.
   */
  <T, Args extends unknown[]>(fn: (...args: Args) => T | PromiseLike<T>, ...args: Args): TPromiseOf<K, T>;
  /** Jobs that have started and not yet settled. */
  readonly active: number;
  /** Jobs waiting for a slot. None of them has been called. */
  readonly pending: number;
  /**
   * Slots available to run jobs at once. Raising it starts queued jobs at once, before returning.
   * Lowering it does not stop in-flight jobs, so `active` may temporarily exceed `concurrency`
   * until running jobs finish and free their slots.
   */
  concurrency: number;
  /**
   * Drops every queued job so nothing further starts, then stops what is already running. Stopping
   * a running job needs a cancelable implementation: against a plain Promise the queued jobs are
   * rejected and whatever is already running is left to finish. The limiter stays usable
   * afterward, so a later call queues and runs as before.
   */
  cancel(reason?: any): void;
}

/** A scheduled job, queued or running. */
interface IEntry {
  /** Whether `start` has been called, which is also what tells a queued job from a running one. */
  started: boolean;
  /** The promise handed to the caller, once the constructor has returned it. */
  handle: unknown;
  /** Whatever `fn` returned, kept raw so canceling reaches the job itself and not a wrapper. */
  job: unknown;
  /** Whether abandon was called before handle was assigned. */
  abandoned?: boolean;
  /** Whether this entry already settled its own promise, tracked locally rather than probed. */
  settled?: boolean;
  /** Cancel reason passed to abandon before handle was assigned. */
  abandonReason?: any;
  start(): void;
  abandon(reason?: any): void;
}

function checkConcurrency(value: number): number {
  if (!(value >= 1) || (value !== Infinity && Math.floor(value) !== value)) {
    throw new RangeError('limit: concurrency must be an integer of at least 1');
  }

  return value;
}

/** Bind `limit` to one promise implementation following the dependency-injection recipe. */
export function limitFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  const isCancelable = Boolean(deps.cancelable);

  /**
   * Create a limiter that runs at most `concurrency` jobs at once and queues the rest.
   *
   * Throws a RangeError synchronously if `concurrency` is not an integer of at least 1 (or
   * Infinity).
   *
   * Against a cancelable implementation, canceling a returned promise while its job is still queued
   * removes it from the queue, so the job never runs at all and the promise rejects with a
   * CancelError. Canceling it after the job started cancels the job itself, provided the job is
   * cancelable. A plain Promise implementation has neither: a returned promise cannot be canceled
   * on its own, and `cancel` on the limiter rejects the queued jobs (with an AbortError carrying the reason) while
   * whatever is already running is left to finish.
   *
   * When a running job is non-cancelable (such as a plain Promise), canceling the limiter cannot
   * stop the underlying work and leaves the running handle pending until the job finishes. The
   * limiter slot remains held until that job settles; a job that never settles holds its slot
   * forever, preventing active concurrency from exceeding the cap.
   *
   * Lowering `concurrency` while jobs are in flight does not abort running jobs; `active` may
   * temporarily exceed `concurrency` until running jobs settle.
   *
   * Every promise this hands out settles, provided the underlying job itself settles. Jobs dropped
   * from the queue reject rather than staying pending forever.
   */
  return function limit(concurrency: number): ILimited<K> {
    let max = checkConcurrency(concurrency);
    let active = 0;
    let pumping = false;
    const queue: IEntry[] = [];
    const running: IEntry[] = [];

    const pump = (): void => {
      if (pumping) return;
      pumping = true;

      try {
        while (active < max && queue.length > 0) {
          const entry = queue.shift();

          if (entry) entry.start();
        }
      } finally {
        pumping = false;
      }
    };

    const release = (entry: IEntry): void => {
      const index = running.indexOf(entry);

      if (index !== -1) {
        running.splice(index, 1);
        active--;
        pump();
      }
    };

    const run = <T, Args extends unknown[]>(
      fn: (...args: Args) => T | PromiseLike<T>,
      args: Args,
    ): TPromiseOf<K, T> => {
      let created: IEntry | undefined;

      const handle = construct<T, K>(deps.Impl, function (resolve, reject, ctx?: IExecutorCtx) {
        const entry: IEntry = {
          started: false,
          handle: undefined,
          job: undefined,

          start() {
            entry.started = true;
            active++;
            running.push(entry);

            let raw: T | PromiseLike<T>;

            try {
              raw = fn(...args);
            } catch (err) {
              entry.settled = true;
              release(entry);
              reject(err);
              return;
            }

            if (!isThenableLike<T>(raw)) {
              entry.settled = true;
              release(entry);
              resolve(raw);
              return;
            }

            entry.job = raw;

            raw.then(
              (value: T) => {
                release(entry);
                resolve(value);
              },
              (reason: any) => {
                release(entry);
                reject(reason);
              },
            );
          },

          abandon(reason?: any) {
            entry.abandoned = true;
            entry.abandonReason = reason;

            // Route through the handle where there is one: its own cancel handler stops the job,
            // and the implementation is what mints the CancelError the caller sees.
            if (isCancelable && isCancelableLike(entry.handle)) {
              entry.handle.cancel(reason);
              return;
            }

            // Non-cancelable implementation: a queued job can still be dropped by rejecting its
            // promise, but a running one has no cancel surface to reach.
            if (!entry.started) {
              // One message whatever the reason's type, so callers never have to guess the shape
              const err = new AbortError('limit: canceled while queued');

              if (reason !== undefined) (err as any).cause = reason;

              entry.settled = true;
              reject(err);
            }
          },
        };

        if (ctx) {
          ctx.handleCancel(function (reason?: any) {
            if (!entry.started) {
              const index = queue.indexOf(entry);

              if (index !== -1) queue.splice(index, 1);

              return;
            }

            // A running non-cancelable job cannot be aborted; its slot remains held in `running`
            // until settlement (a job that never settles loses its slot forever).
            if (isCancelableLike(entry.job)) entry.job.cancel(reason);
          });
        }

        created = entry;
        queue.push(entry);
        pump();
      });

      // Only reachable from here: the executor, and any job it pumped, ran during construction
      if (created) {
        created.handle = handle;

        // Nothing to cancel once it settled during construction, and strict would throw
        if (created.abandoned && !created.settled && isCancelableLike(handle)) {
          handle.cancel(created.abandonReason);
        }
      }

      return handle;
    };

    const limited = function (fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
      return run(fn, args);
    } as unknown as ILimited<K>;

    Object.defineProperty(limited, 'active', {
      get: function () {
        return active;
      },
    });

    Object.defineProperty(limited, 'pending', {
      get: function () {
        return queue.length;
      },
    });

    Object.defineProperty(limited, 'concurrency', {
      get: function () {
        return max;
      },
      set: function (value: number) {
        max = checkConcurrency(value);
        pump();
      },
    });

    limited.cancel = function (reason?: any): void {
      // Queue first, so a slot freed by canceling a running job finds nothing left to start.
      const dropped = queue.splice(0, queue.length);
      const inFlight = running.slice();

      for (const entry of dropped) entry.abandon(reason);
      for (const entry of inFlight) entry.abandon(reason);
    };

    return limited;
  };
}
