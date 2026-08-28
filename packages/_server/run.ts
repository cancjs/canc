import { cancAsync } from '@cancjs/coroutine';
import {
  CancelablePromise,
  CancelError,
  ICancelablePromiseFlagOptions,
  isCancelError,
  makeCancelable,
} from '@cancjs/promise';

import { isGenerator, isThenable, TAnyFn } from '../_util';
import { IRequestCancelState } from './holder';
import { ensureRequestCancelState } from './node-signal';
import { createTimeoutError, normalizeTimeout, startHandlerTimeout, stopHandlerTimeout } from './timeout';
import { ICancelableHandlerOptions, IRequestLike, IResponseLike } from './types';

/** How the wrapped handler is invoked: the receiver it runs against and the framework's arguments. */
export interface IHandlerCall {
  thisArg?: unknown;
  args?: unknown[];
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

  armDeadline(state, options);
  const stopWatching = watchCancelReason(state, options);
  const flags = pickFlags(options);

  // client already gone at wrap time, so the handler is never invoked: there is nobody to answer,
  // and starting a query for a dead socket is the cost this whole layer exists to avoid
  const task =
    state.signal.aborted ?
      canceledTask<TReturn>(state, flags)
    : startHandler<TReturn>(handler, call, { ...flags, signal: collectSignals(state, options) });

  state.live.add(task);

  // teardown hangs off the response rather than off the task: a `then` here would register as a
  // consumer of the handler's promise and change how a cancel bubbles through its own chain
  res.once('close', () => {
    state.live.delete(task);
    stopHandlerTimeout(state.timer);
    state.timer = undefined;
    stopWatching();
  });

  return task;
}

function startHandler<TReturn>(
  handler: TAnyFn,
  call: IHandlerCall | undefined,
  promiseOptions: ICancelablePromiseFlagOptions & { signal: AbortSignal | AbortSignal[] },
): CancelablePromise<TReturn> {
  const result = handler.apply(call?.thisArg, call?.args ?? []);

  // handler kind is read off the RESULT, not off the function: at the es5 target a generator
  // function transpiles into a plain function returning a generator-like object, so
  // GeneratorFunction identity is not observable
  // calling first is free either way, a generator body does not run until its first step
  if (isGenerator(result)) {
    return cancAsync(() => result, undefined, promiseOptions)() as CancelablePromise<TReturn>;
  }

  const thenable = isThenable(result) ? result : CancelablePromise.resolve(result);

  return makeCancelable(thenable, promiseOptions) as CancelablePromise<TReturn>;
}

function canceledTask<TReturn>(
  state: IRequestCancelState,
  flags: ICancelablePromiseFlagOptions,
): CancelablePromise<TReturn> {
  const { cancel, promise } = CancelablePromise.withResolvers<TReturn>(flags);

  // the signal reason is already a CancelError, so it travels through cancel() untouched and the
  // adapter sees the same error a mid-flight cancellation would have produced
  cancel(state.signal.reason);

  return promise;
}

function armDeadline(state: IRequestCancelState, options: ICancelableHandlerOptions): void {
  const spec = normalizeTimeout(options.timeout);

  if (!spec || state.timer !== undefined || state.signal.aborted) {
    return;
  }

  state.timer = startHandlerTimeout(spec.ms, () => {
    state.timer = undefined;
    // the deadline aborts the request signal itself rather than the handler's promise, so
    // request-scoped work other consumers started stops with the handler instead of outliving it
    state.cancel(createTimeoutError(spec));
  });
}

function watchCancelReason(state: IRequestCancelState, options: ICancelableHandlerOptions): () => void {
  const { onDisconnect, onTimeout } = options;

  if (!onDisconnect && !onTimeout) {
    return noop;
  }

  const notify = () => {
    // a drain cancels the signal to reach the consumers a handler never awaited, and neither
    // callback reports that: the client has not left and no deadline was missed
    if (state.draining) {
      return;
    }

    // the documented discriminator, never a message check: the request signal always aborts with a
    // CancelError, so anything else reaching here came from a foreign signal and reads as a
    // disconnect
    const reason = state.signal.reason;

    if (isCancelError(reason) && reason.timedOut) {
      onTimeout?.(reason);
    } else {
      onDisconnect?.(reason as CancelError);
    }
  };

  if (state.signal.aborted) {
    notify();

    return noop;
  }

  state.signal.addEventListener('abort', notify, { once: true });

  return () => state.signal.removeEventListener('abort', notify);
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

function noop(): void {
  /**/
}
