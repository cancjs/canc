// Callback plumbing shared by both lanes: the operators pull items lazily, the terminals pull them
// in a loop, and both have to run a callback written in any of the four supported forms and be able
// to abandon one that is still in flight.

import { isGenerator } from '../../_util';
import type { TAnyFn } from '../../_util/guards';
import { isCancelableLike, isFunction, isThenableLike } from '../guards';
import type { TPromiseCtor } from './types';

export interface IItemRun {
  /** The callback's outcome, whichever form it took. */
  result: PromiseLike<any>;
  /** Abandon the run: cancel what the body waits on, then let the body clean up after itself. */
  stop: () => void;
}

export interface ICallbackDeps {
  Impl: TPromiseCtor;
}

/**
 * Bind the callback plumbing to one promise implementation. The product functions carry no Impl
 * parameter, so calling code uses the algorithm's own signature without wrapping or casting.
 */
export function callbackFactory(deps: ICallbackDeps) {
  const { Impl } = deps;

  // Built through the executor rather than a rejected native promise, so the reason reaches the
  // consumer untouched and no transient promise of the wrong implementation is created on the way.
  function rejected(reason: unknown): PromiseLike<never> {
    return new Impl((_resolve, reject) => {
      reject(reason);
    }) as PromiseLike<never>;
  }

  function driveGenerator<T>(gen: Generator<any, T, any>): PromiseLike<T> {
    const resume = (value: any): PromiseLike<any> => {
      try {
        const { value: yielded, done } = gen.next(value);

        if (done) {
          return Impl.resolve(yielded);
        }

        return Impl.resolve(yielded).then(resume, (err) => {
          try {
            return driveUnwind(gen, err);
          } catch (throwErr) {
            return rejected(throwErr);
          }
        });
      } catch (err) {
        return rejected(err);
      }
    };

    const driveUnwind = (g: Generator<any, T, any>, err: any): any => {
      const { value: yielded, done } = g.throw(err);

      if (done) {
        return Impl.resolve(yielded);
      }

      return Impl.resolve(yielded).then(resume, (nextErr) => driveUnwind(g, nextErr));
    };

    return Impl.resolve(undefined).then(() => resume(undefined));
  }

  /** Run a callback in whichever of the four forms it was written in, and adopt its outcome. */
  function runCallback(cb: TAnyFn, args: any[]): any {
    let result;
    try {
      result = cb(...args);
    } catch (err) {
      return rejected(err);
    }

    if (isThenableLike(result)) {
      return result;
    }

    if (result && isFunction(result.next)) {
      return driveGenerator(result);
    }

    return Impl.resolve(result);
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
      result: Impl.resolve(runCallback(watch, args)),

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

  return { runItem, runCallback, driveGenerator };
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
