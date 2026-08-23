/**
 * Pipeable operators: lazy transforms taking one async iterable and returning another. They bind no
 * promise implementation; all they do is transform pulls, so every entry re-exports them unchanged.
 *
 * Two rules hold for all of them: a downstream `return()` closes the upstream iterator (and, for
 * flatMap, the active inner one), which lets a stopped consumer run the source's own cleanup; and an
 * in-flight per-item callback is stopped as part of that, with any cancelable value the body is
 * waiting on canceled, then the body resumed so its `finally` blocks run.
 */

import { isGenerator } from '../../_util';
import type { TAnyFn } from '../../_util/guards';
import { isCancelableLike } from '../guards';
import { runCallback } from './callback';
import { callReturn, getSource } from './pull';
import { AnyIterable, IPipeOp, markPipeOp, TPromiseCtor } from './types';

// Operators only ever adopt a callback's outcome, so the platform promise is all they need. Captured
// once here rather than read per call, the same way the rest of the toolbox treats it.
const PlainPromise = Promise as unknown as TPromiseCtor;

/** What a callback produces once its form is resolved: awaited, or driven to the generator's return. */
export type TCallbackValue<R> = R extends Generator<any, infer TReturn, any> ? Awaited<TReturn> : Awaited<R>;

/** The element type of the iterable a flatMap callback produces. */
export type TFlatMapped<R> =
  TCallbackValue<R> extends AsyncIterable<infer E> ? E
  : TCallbackValue<R> extends Iterable<infer E> ? E
  : never;

/**
 * Map each value through a callback in any of its four forms. The callback's index argument counts
 * the values pulled from the source, matching the iterator helpers.
 */
export function map<I, R>(callback: (value: I, index: number) => R): IPipeOp<I, TCallbackValue<R>> {
  type O = TCallbackValue<R>;

  return markPipeOp<I, O>((source) =>
    iterableOf<O>(() => {
      const upstream = openUpstream<I>(source);
      let index = 0;

      return {
        async next(): Promise<IteratorResult<O>> {
          if (upstream.finished) {
            return finished<O>();
          }

          const step = await upstream.it.next();
          if (step.done) {
            upstream.finished = true;
            return finished<O>();
          }

          const item = upstream.run(callback, [step.value, index++]);
          let value: O;
          try {
            value = await item;
          } catch (error) {
            return upstream.fail<O>(error);
          }

          return upstream.finished ? finished<O>() : { done: false, value };
        },

        async return(value?: any): Promise<IteratorResult<O>> {
          await upstream.close();
          return { done: true, value };
        },
      };
    }),
  );
}

/**
 * Keep the values their predicate accepts. A type-guard predicate narrows the element type, the
 * other three callback forms leave it unchanged.
 */
export function filter<I, O extends I>(predicate: (value: I, index: number) => value is O): IPipeOp<I, O>;
export function filter<I, R>(predicate: (value: I, index: number) => R): IPipeOp<I, I>;
export function filter<I>(predicate: (value: I, index: number) => unknown): IPipeOp<I, I> {
  return markPipeOp<I, I>((source) =>
    iterableOf<I>(() => {
      const upstream = openUpstream<I>(source);
      let index = 0;

      return {
        async next(): Promise<IteratorResult<I>> {
          for (;;) {
            if (upstream.finished) {
              return finished<I>();
            }

            const step = await upstream.it.next();
            if (step.done) {
              upstream.finished = true;
              return finished<I>();
            }

            const item = upstream.run(predicate, [step.value, index++]);
            let keep: unknown;
            try {
              keep = await item;
            } catch (error) {
              return upstream.fail<I>(error);
            }

            if (upstream.finished) {
              return finished<I>();
            }

            if (keep) {
              return { done: false, value: step.value };
            }
          }
        },

        async return(value?: any): Promise<IteratorResult<I>> {
          await upstream.close();
          return { done: true, value };
        },
      };
    }),
  );
}

/**
 * Yield at most `limit` values, then close the source. A limit of zero or less yields nothing. The
 * source is closed on the pull that finds the limit spent, which is where the iterator helpers close
 * theirs.
 */
export function take<I>(limit: number): IPipeOp<I, I> {
  return markPipeOp<I, I>((source) =>
    iterableOf<I>(() => {
      const upstream = openUpstream<I>(source);
      let remaining = limit > 0 ? Math.floor(limit) : 0;

      return {
        async next(): Promise<IteratorResult<I>> {
          if (upstream.finished) {
            return finished<I>();
          }

          if (remaining <= 0) {
            await upstream.close();
            return finished<I>();
          }

          remaining--;

          const step = await upstream.it.next();
          if (step.done) {
            upstream.finished = true;
            return finished<I>();
          }

          return { done: false, value: step.value };
        },

        async return(value?: any): Promise<IteratorResult<I>> {
          await upstream.close();
          return { done: true, value };
        },
      };
    }),
  );
}

/** Discard the first `count` values and yield the rest. Discarding past the end yields nothing. */
export function drop<I>(count: number): IPipeOp<I, I> {
  return markPipeOp<I, I>((source) =>
    iterableOf<I>(() => {
      const upstream = openUpstream<I>(source);
      let remaining = count > 0 ? Math.floor(count) : 0;

      return {
        async next(): Promise<IteratorResult<I>> {
          while (remaining > 0) {
            if (upstream.finished) {
              return finished<I>();
            }

            remaining--;

            const dropped = await upstream.it.next();
            if (dropped.done) {
              upstream.finished = true;
              return finished<I>();
            }
          }

          if (upstream.finished) {
            return finished<I>();
          }

          const step = await upstream.it.next();
          if (step.done) {
            upstream.finished = true;
            return finished<I>();
          }

          return { done: false, value: step.value };
        },

        async return(value?: any): Promise<IteratorResult<I>> {
          await upstream.close();
          return { done: true, value };
        },
      };
    }),
  );
}

/**
 * Map each value to an iterable and yield that iterable's values before pulling the next one. A
 * stopped consumer closes the inner iterator it is standing in as well as the source.
 */
export function flatMap<I, R>(callback: (value: I, index: number) => R): IPipeOp<I, TFlatMapped<R>> {
  type O = TFlatMapped<R>;

  return markPipeOp<I, O>((source) =>
    iterableOf<O>(() => {
      const upstream = openUpstream<I>(source);
      let index = 0;

      return {
        async next(): Promise<IteratorResult<O>> {
          for (;;) {
            if (upstream.finished) {
              return finished<O>();
            }

            const inner = upstream.inner;
            if (inner) {
              let innerStep: IteratorResult<O>;
              try {
                innerStep = await inner.next();
              } catch (error) {
                upstream.inner = undefined;
                return upstream.fail<O>(error);
              }

              if (upstream.finished) {
                return finished<O>();
              }

              if (!innerStep.done) {
                return { done: false, value: innerStep.value };
              }

              upstream.inner = undefined;
              continue;
            }

            const step = await upstream.it.next();
            if (step.done) {
              upstream.finished = true;
              return finished<O>();
            }

            const item = upstream.run(callback, [step.value, index++]);
            let mapped: unknown;
            try {
              mapped = await item;
            } catch (error) {
              return upstream.fail<O>(error);
            }

            if (upstream.finished) {
              return finished<O>();
            }

            try {
              upstream.inner = getSource<O>(mapped as AnyIterable<O>).it;
            } catch (error) {
              return upstream.fail<O>(error);
            }
          }
        },

        async return(value?: any): Promise<IteratorResult<O>> {
          await upstream.close();
          return { done: true, value };
        },
      };
    }),
  );
}

interface IUpstream<I> {
  /** The source iterator every operator pulls from. */
  it: AsyncIterator<I>;
  /** The inner iterator flatMap is standing in, closed alongside the source. */
  inner?: AsyncIterator<any>;
  /** Set once nothing more will be yielded, so a late pull answers done instead of pulling again. */
  finished: boolean;
  /** Run one item's callback, keeping a handle on it so `close` can stop it mid-flight. */
  run: (callback: TAnyFn, args: any[]) => Promise<any>;
  /** Stop an in-flight item and close the inner iterator and the source, at most once each. */
  close: () => Promise<void>;
  /** Close on a failed pull and rethrow, unless the consumer already walked away. */
  fail: <T>(error: unknown) => Promise<IteratorResult<T>>;
}

function openUpstream<I>(source: AsyncIterable<I>): IUpstream<I> {
  const { it } = getSource<I>(source);
  let item: IItemRun | undefined;
  let closed = false;

  const upstream: IUpstream<I> = {
    it,
    finished: false,

    run(callback, args) {
      const current = runItem(callback, args);
      item = current;
      return current.result.then(
        (value) => {
          item = undefined;
          return value;
        },
        (error) => {
          item = undefined;
          throw error;
        },
      );
    },

    async close() {
      upstream.finished = true;

      const current = item;
      item = undefined;
      if (current) {
        current.stop();
      }

      const inner = upstream.inner;
      upstream.inner = undefined;
      if (inner) {
        await callReturn(inner);
      }

      if (closed) {
        return;
      }
      closed = true;
      await callReturn(it);
    },

    async fail<T>(error: unknown): Promise<IteratorResult<T>> {
      if (upstream.finished) {
        return finished<T>();
      }
      await upstream.close();
      throw error;
    },
  };

  return upstream;
}

interface IItemRun {
  /** The callback's outcome, whichever form it took. */
  result: Promise<any>;
  /** Abandon the run: cancel what the body waits on, then let the body clean up after itself. */
  stop: () => void;
}

/**
 * Run one item's callback and keep a handle on the work it has in flight. The generator form is
 * driven by the shared driver through a wrapper that reports the value the body is suspended on,
 * which is the only handle there is on a per-item await: canceling that value aborts the real work,
 * and resuming the body with a return completion runs its own cleanup.
 */
function runItem(callback: TAnyFn, args: any[]): IItemRun {
  let body: Generator<any, any, any> | undefined;
  let awaited: unknown;
  let stopped = false;

  const watch = (...values: any[]): unknown => {
    const outcome: unknown = callback(...values);

    if (isGenerator(outcome)) {
      body = outcome;
      return watchGenerator(outcome, (suspendedOn) => {
        awaited = suspendedOn;
      });
    }

    awaited = outcome;
    return outcome;
  };

  return {
    result: Promise.resolve(runCallback(PlainPromise, watch, args)),

    stop() {
      if (stopped) {
        return;
      }
      stopped = true;

      const inFlight = awaited;
      awaited = undefined;
      if (isCancelableLike(inFlight)) {
        inFlight.cancel();
      }

      if (body) {
        unwind(body);
      }
    },
  };
}

function watchGenerator(body: Generator<any, any, any>, onSuspend: (value: unknown) => void): Generator<any, any, any> {
  const report = (step: IteratorResult<any>): IteratorResult<any> => {
    onSuspend(step.done ? undefined : step.value);
    return step;
  };

  const watched = {
    next: (value?: any) => report(body.next(value)),
    throw: (error?: any) => report(body.throw(error)),
    return: (value?: any) => report(body.return(value)),
    [Symbol.iterator]: () => watched,
  };

  return watched as unknown as Generator<any, any, any>;
}

/**
 * Resume a stopped body with a return completion so its own `finally` blocks run, then keep feeding
 * it whatever those blocks yield until it is finished. Failures during that cleanup are swallowed:
 * the consumer has already walked away from this item and has nowhere to report them.
 */
function unwind(body: Generator<any, any, any>): void {
  const step = (resume: () => IteratorResult<any>): IteratorResult<any> => {
    try {
      return resume();
    } catch {
      return { done: true, value: undefined };
    }
  };

  const pump = (result: IteratorResult<any>): void => {
    if (result.done) {
      return;
    }

    void Promise.resolve(result.value).then(
      (value) => pump(step(() => body.next(value))),
      (error) => pump(step(() => body.throw(error))),
    );
  };

  pump(step(() => body.return(undefined)));
}

function iterableOf<T>(createIterator: () => AsyncIterator<T>): AsyncIterable<T> {
  return { [Symbol.asyncIterator]: createIterator };
}

function finished<T>(): IteratorResult<T> {
  return { done: true, value: undefined };
}
