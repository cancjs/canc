import nodeEvents from 'node:events';

import { CancelablePromise } from '@cancjs/promise';

import { features } from '../features';

/**
 * Node's EventEmitter, unchanged. It is the argument type of {@link once} and {@link on}, so it is
 * re-exported to save a second import rather than to add anything.
 */
export { default as EventEmitter } from 'node:events';

/** Options node reads when waiting for a single event. */
export interface IOnceOptions {
  /**
   * A signal of the caller's own. Its abort cancels the returned promise, so there is one
   * settlement path whether the caller aborts or cancels.
   */
  signal?: AbortSignal;
}

/** Options node reads when iterating events. */
export interface IOnOptions extends IOnceOptions {
  /** Event names that end the iteration. */
  close?: string[];
  /** Buffer size above which an emitter implementing `pause()` is paused. */
  highWaterMark?: number;
  /** Buffer size below which a paused emitter is resumed. */
  lowWaterMark?: number;
}

/**
 * The iterator {@link on} returns.
 *
 * Every pull is a cancellation point. Canceling a pending `next()` ends the iteration through the
 * iterator protocol's own `return()`, which is what makes node drop every listener it added.
 */
export interface ICancelableEventIterator extends AsyncIterableIterator<any[]> {
  next(): CancelablePromise<IteratorResult<any[], undefined>>;
  return(value?: undefined): Promise<IteratorResult<any[], undefined>>;
  throw(error?: unknown): Promise<IteratorResult<any[], undefined>>;
  [Symbol.asyncIterator](): ICancelableEventIterator;
}

/**
 * Wait for one event.
 *
 * Cancel category B: the emitter keeps running and whoever was going to emit still emits. What
 * stops is the wait, and with it the listener.
 *
 * The listener survives for as long as anything still consumes the returned promise. Two consumers,
 * cancel one, the other still gets its event; cancel both and the listener goes. An AbortController
 * cannot express that without tracking consumers by hand.
 *
 * @param emitter - Emitter or event target to listen on.
 * @param eventName - Event to wait for.
 * @param options - Node's own options bag.
 * @returns The emitted arguments.
 */
export function once(
  emitter: NodeJS.EventEmitter,
  eventName: string | symbol,
  options?: IOnceOptions,
): CancelablePromise<any[]>;
export function once(emitter: EventTarget, eventName: string, options?: IOnceOptions): CancelablePromise<any[]>;
export function once(
  emitter: NodeJS.EventEmitter | EventTarget,
  eventName: string | symbol,
  options?: IOnceOptions,
): CancelablePromise<any[]> {
  // the caller's signal drives the promise instead of riding along in the options bag, so an abort
  // and a cancel settle the same way and node is left with exactly one signal to watch
  const { signal: callerSignal, ...rest } = options ?? {};

  return new CancelablePromise<any[]>(
    (resolve, _reject, { getSignal }) => {
      // node drops its listener on abort as well as on settle, so this adds no listener of its own
      resolve(
        nodeEvents.once(emitter as NodeJS.EventEmitter, eventName, {
          ...rest,
          signal: getSignal() as unknown as AbortSignal,
        }),
      );
    },
    { signal: callerSignal },
  );
}

/**
 * Iterate events as they are emitted.
 *
 * Cancel category A: the iteration really stops and node removes the listeners it added, including
 * the one on `error`.
 *
 * @param emitter - Emitter or event target to listen on.
 * @param eventName - Event to iterate.
 * @param options - Node's own options bag.
 * @returns An async iterator of the emitted arguments, cancelable at every pull.
 */
export function on(
  emitter: NodeJS.EventEmitter,
  eventName: string | symbol,
  options?: IOnOptions,
): ICancelableEventIterator;
export function on(emitter: EventTarget, eventName: string, options?: IOnOptions): ICancelableEventIterator;
export function on(
  emitter: NodeJS.EventEmitter | EventTarget,
  eventName: string | symbol,
  options?: IOnOptions,
): ICancelableEventIterator {
  // node hands back an async generator, so return and throw are always there, unlike the optional
  // members the async iterator type declares
  const source = nodeEvents.on(
    emitter as NodeJS.EventEmitter,
    eventName,
    options,
  ) as unknown as Required<ICancelableEventIterator> & { next(): Promise<IteratorResult<any[], undefined>> };

  const iterator: ICancelableEventIterator = {
    next(): CancelablePromise<IteratorResult<any[], undefined>> {
      return new CancelablePromise<IteratorResult<any[], undefined>>((resolve, _reject, { handleCancel }) => {
        // registered before the pull, so a cancel arriving while it is in flight still ends it
        handleCancel(() => source.return(undefined));
        resolve(source.next());
      });
    },
    return(value?: undefined): Promise<IteratorResult<any[], undefined>> {
      return source.return(value);
    },
    throw(error?: unknown): Promise<IteratorResult<any[], undefined>> {
      return source.throw(error);
    },
    [Symbol.asyncIterator](): ICancelableEventIterator {
      return iterator;
    },
  };

  return iterator;
}

// paired with the removal below, where the two names have to agree
const ABORT_EVENT = 'abort';

// resolved once: the runtimes the fallback below exists for also predate Symbol.dispose
const DISPOSE: symbol = (Symbol as { dispose?: symbol }).dispose ?? Symbol.for('Symbol.dispose');

/** Signature of node's `addAbortListener`, which the fallback below has to match exactly. */
export type TAddAbortListener = (signal: AbortSignal, listener: (event: Event) => void) => Disposable;

/**
 * What node's `addAbortListener` does, for the versions that predate it.
 *
 * Registering a listener on the caller's signal is this function's entire contract, and the
 * returned disposable is what takes it off again. That makes it the one place in this module where
 * a listener is added by hand, and it is not the leaking kind: nothing here outlives the disposable.
 */
function addAbortListenerFallback(signal: AbortSignal, listener: (event: Event) => void): Disposable {
  if (signal.aborted) {
    // node calls the listener on a microtask, with no event, when the signal aborted already
    queueMicrotask(() => (listener as () => void)());

    return { [DISPOSE]: (): void => {} } as unknown as Disposable;
  }

  signal.addEventListener(ABORT_EVENT, listener, { once: true });

  return {
    [DISPOSE]: (): void => {
      signal.removeEventListener(ABORT_EVENT, listener);
    },
  } as unknown as Disposable;
}

/**
 * Listen for a signal's abort and get a disposable that stops listening.
 *
 * Node grew this in 20.5.0 and 18.18.0. Below that the fallback above stands in, so the export is
 * present on every version this package supports.
 */
export const addAbortListener: TAddAbortListener =
  features.hasAddAbortListener ?
    (nodeEvents as { addAbortListener: TAddAbortListener }).addAbortListener
  : addAbortListenerFallback;
