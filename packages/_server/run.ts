import { cancAsync } from '@cancjs/coroutine';
import { CancelablePromise, ICancelablePromiseFlagOptions, makeCancelable, resolvePromiseImpl } from '@cancjs/promise';

import { isFunction, isGenerator, isObject, isThenable, readProp, TAnyFn } from '../_util';
import { IRequestCancelState } from './holder';
import { applyRequestOptions, ensureRequestCancelState, isResponseClosed, stopRequestDeadline } from './node-signal';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike } from './types';

// captured at load: observing a task through its own then would count as a consumer of it
const NativePromise = Promise;

/** How the wrapped handler is invoked: the receiver it runs against and the framework's arguments. */
export interface IHandlerCall {
  thisArg?: unknown;
  args?: unknown[];
  /**
   * The framework's continuation, passed to the handler after `args`. A handler that calls it has
   * handed the request on, so its own settling does not end the request deadline.
   */
  next?: TAnyFn;
  /**
   * Whether the handler hands the request on by settling, the way a hook does, rather than answering
   * it. Read when the handler settles.
   */
  handsOn?: () => boolean;
}

/**
 * Merges plugin level options with a single route's own. The route wins on every key it sets, so a
 * plugin can supply the defaults for a whole app and one route can still opt out.
 */
export function mergeHandlerOptions(
  base?: ICancelableHandlerOptions,
  override?: ICancelableHandlerOptions,
): ICancelableHandlerOptions {
  if (!base) {
    return override ?? {};
  }

  return override ? { ...base, ...override } : base;
}

/**
 * Runs a handler under the request's cancel signal.
 *
 * A generator handler is driven as a coroutine and stops at its next suspension point. Anything
 * else runs signal-only: a cancelable promise it returns is canceled with the request, but a plain
 * async body has no suspension points to unwind and runs to completion.
 */
export function runCancelableHandler<TReturn = unknown>(
  handler: TAnyFn,
  req: IRequestLike,
  res: IResponseLike,
  routeOptions?: ICancelableHandlerOptions,
  call?: IHandlerCall,
): CancelablePromise<TReturn> {
  const state = ensureRequestCancelState(req, res);
  const options = mergeHandlerOptions(state.options, routeOptions);

  // a route's own timeout restarts the request deadline, an inherited one is already running
  if (routeOptions) {
    applyRequestOptions(state, routeOptions);
  }

  // a closed response is over: nothing here is tracked or holds the deadline open
  const tracked = !isResponseClosed(res);
  const hold = holdRequest(state, tracked);
  const flags = pickFlags(options);
  // resolved once per call, registry precedence only, so a setPromiseImpl consumer gets its own
  // class back from this layer instead of the built-in one
  const Impl = resolvePromiseImpl() as unknown as typeof CancelablePromise;

  // a signal already aborted at wrap time (client gone, or a caller supplied one) means the handler
  // is never invoked: there is nobody to answer, and starting a query for a dead socket is the
  // cost this whole layer exists to avoid
  const aborted = findAbortedSignal(state, options);
  const task =
    aborted ?
      canceledTask<TReturn>(Impl, aborted, flags)
    : startHandler<TReturn>(Impl, handler, withPassOn(call, hold.release), {
        ...flags,
        // a tracked task is canceled through the request's in-flight set, so the request
        // signal is not listened to per layer; an untracked one keeps the signal itself
        signal: tracked ? callerSignals(options) : collectSignals(state, options),
      });

  if (!tracked) {
    return task;
  }

  state.live.add(task);
  state.watch?.(task);
  if (state.signal.aborted) {
    task.cancel(state.signal.reason);
  }

  // the deadline covers the handler, not the body a framework streams after it returned
  const settle = () => {
    state.live.delete(task);

    if (hold.release() && state.holding === 0 && call?.handsOn?.() !== true) {
      stopRequestDeadline(state);
    }
  };

  void NativePromise.prototype.then.call(task, settle, settle);

  return task;
}

function holdRequest(state: IRequestCancelState, tracked: boolean): { release: () => boolean } {
  let holding = tracked;

  if (holding) {
    state.holding = (state.holding ?? 0) + 1;
  }

  return {
    release: () => {
      if (!holding) {
        return false;
      }

      holding = false;
      state.holding = (state.holding ?? 1) - 1;

      return true;
    },
  };
}

function withPassOn(call: IHandlerCall | undefined, release: () => boolean): IHandlerCall | undefined {
  const next = call?.next;

  if (!next) {
    return call;
  }

  return {
    ...call,
    args: [
      ...(call.args ?? []),
      function passOn(this: unknown, ...rest: unknown[]): unknown {
        release();

        return next.apply(this, rest);
      },
    ],
  };
}

function startHandler<TReturn>(
  Impl: typeof CancelablePromise,
  handler: TAnyFn,
  call: IHandlerCall | undefined,
  promiseOptions: ICancelablePromiseFlagOptions & { signal: AbortSignal | AbortSignal[] },
): CancelablePromise<TReturn> {
  let result: unknown;

  try {
    result = handler.apply(call?.thisArg, call?.args ?? []);
  } catch (error) {
    // a plain handler throws before it has a promise to reject, and letting that escape would skip
    // the teardown the caller registers next, stranding an armed deadline on a dead request
    // the thrown value travels as-is: an error handler downstream discriminates on identity
    return makeCancelable(Impl.reject(error), promiseOptions) as CancelablePromise<TReturn>;
  }

  // handler kind is read off the RESULT, not off the function: at the es5 target a generator
  // function transpiles into a plain function returning a generator-like object, so
  // GeneratorFunction identity is not observable
  // calling first is free either way, a generator body does not run until its first step
  if (isGenerator(result)) {
    return cancAsync(() => result, undefined, promiseOptions)() as CancelablePromise<TReturn>;
  }

  if (isAsyncGeneratorResult(result)) {
    // an async generator would resolve the task with the generator object itself and no framework
    // answers for it, so the request would hang or send an empty body
    return makeCancelable(
      Impl.reject(
        new TypeError(
          'Cancelable handler returned an async generator. Use a synchronous generator or an async function.',
        ),
      ),
      promiseOptions,
    ) as CancelablePromise<TReturn>;
  }

  const thenable = isThenable(result) ? result : Impl.resolve(result);

  return makeCancelable(thenable, promiseOptions) as CancelablePromise<TReturn>;
}

function isAsyncGeneratorResult(value: unknown): boolean {
  // read off the result like the sync check above: transpiled async generators are plain objects
  return (
    isObject(value) &&
    !isThenable(value) &&
    typeof Symbol.asyncIterator === 'symbol' &&
    isFunction(readProp(value, Symbol.asyncIterator)) &&
    isFunction(readProp(value, 'next'))
  );
}

function canceledTask<TReturn>(
  Impl: typeof CancelablePromise,
  signal: AbortSignal,
  flags: ICancelablePromiseFlagOptions,
): CancelablePromise<TReturn> {
  const { cancel, promise } = Impl.withResolvers<TReturn>(flags);

  // the request signal's reason is already a CancelError and travels through cancel() untouched,
  // a caller signal's reason is wrapped, the same as a mid-flight cancellation would have done
  cancel(signal.reason);

  return promise;
}

function findAbortedSignal(state: IRequestCancelState, options: ICancelableHandlerOptions): AbortSignal | undefined {
  if (state.signal.aborted) {
    return state.signal;
  }

  const extra = options.signal;

  if (!extra) {
    return undefined;
  }

  return (
    Array.isArray(extra) ? extra.find((signal) => signal.aborted)
    : extra.aborted ? extra
    : undefined
  );
}

/** The signals a layer names itself. The request signal is not among them: the in-flight set carries it. */
function callerSignals(options: ICancelableHandlerOptions): AbortSignal[] {
  const extra = options.signal;

  if (!extra) {
    return [];
  }

  return Array.isArray(extra) ? extra : [extra];
}

function collectSignals(state: IRequestCancelState, options: ICancelableHandlerOptions): AbortSignal | AbortSignal[] {
  const extra = options.signal;

  if (!extra) {
    return state.signal;
  }

  return Array.isArray(extra) ? [state.signal, ...extra] : [state.signal, extra];
}

function pickFlags(options: ICancelableHandlerOptions): ICancelablePromiseFlagOptions {
  const flags: ICancelablePromiseFlagOptions = {};

  if (options.asyncCancel !== undefined) flags.asyncCancel = options.asyncCancel;
  if (options.forceCancelable !== undefined) flags.forceCancelable = options.forceCancelable;
  if (options.bubble !== undefined) flags.bubble = options.bubble;
  if (options.strict !== undefined) flags.strict = options.strict;
  if (options.shield !== undefined) flags.shield = options.shield;

  return flags;
}
