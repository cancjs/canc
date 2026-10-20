import type { Readable } from 'node:stream';

import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import readableJson from '../../surface/projected/stream.Readable.json';
import { acceptsSignal, IManifestEntry, takeCallerSignal, TNodeFn, withCallerSignal, withSignalAt } from '../signal';

const entries = new Map<string, IManifestEntry>(
  (readableJson.exports as IManifestEntry[]).map((entry) => [entry.name, entry]),
);

/**
 * Node's per-call options for the terminals below: `signal` is honored everywhere, `concurrency`
 * only where node's own implementation reads it (`some`, `every`, `find`, `forEach`). Passing it to
 * `toArray` or `reduce` is accepted, matching the wider shape node itself documents for the group,
 * but has no effect there: neither iterates with any parallelism.
 */
export interface IReadableTerminalOptions {
  /** Maximum concurrent invocations of the visitor function. Ignored by `toArray` and `reduce`. */
  concurrency?: number;
  /** Aborting destroys the source and rejects the returned promise, same as calling `cancel()`. */
  signal?: AbortSignal;
  /**
   * Set false to leave the source open when the returned promise is canceled. Default true.
   *
   * With `false` the source is not destroyed and stays readable, but the read already in flight is
   * abandoned: chunks it has taken are not handed back, so a later read does not see them.
   */
  destroyOnCancel?: boolean;
}

/** The `{ signal }` companion node passes to a terminal's own visitor function on each call. */
export interface IReadableVisitorOptions {
  readonly signal: AbortSignal;
}

/**
 * Wrap a `Readable` promise terminal, forwarding the cancel signal into the fixed argument position
 * node reads its options from. Resolved against the stream instance at call time rather than
 * patched onto `Readable.prototype`, so this stays a free function: `toArray(stream)`, never
 * `stream.toArray()`.
 */
function destroyOnCancelOption(options: unknown): boolean {
  return (options as Pick<IReadableTerminalOptions, 'destroyOnCancel'> | undefined)?.destroyOnCancel !== false;
}

/**
 * Cancels `promise` when the returned one is canceled, and destroys `stream` unless the caller opted
 * out. Node's own terminals reject on abort but leave the source open, so the wrapper owns the destroy.
 */
function destroyingOnCancel<TResult>(
  stream: Readable,
  promise: CancelablePromise<TResult, Unlisted>,
  destroy: boolean,
): CancelablePromise<TResult, Unlisted> {
  return new CancelablePromise<TResult, Unlisted>((resolve, reject, { handleCancel }) => {
    handleCancel(() => {
      if (destroy) {
        stream.destroy();
      }
      promise.cancel();
    });
    promise.then(resolve, reject);
  });
}

/**
 * What node's terminal iterates. A source the caller keeps is read through an iterator that leaves
 * it open on return, so the abort ends the loop without destroying the stream.
 */
function terminalReceiver(stream: Readable, destroy: boolean): unknown {
  if (destroy) {
    return stream;
  }

  return {
    [Symbol.asyncIterator]: () => stream.iterator({ destroyOnReturn: false }),
  };
}

function terminalWrapped<TResult>(
  methodName: string,
  optionsIndex: number,
): (stream: Readable, ...args: unknown[]) => CancelablePromise<TResult, Unlisted> {
  const entry = entries.get(methodName);
  const forwards = acceptsSignal(entry);

  return function terminalCall(stream: Readable, ...args: unknown[]): CancelablePromise<TResult, Unlisted> {
    const nodeFn = (stream as unknown as Record<string, TNodeFn>)[methodName];
    const destroy = destroyOnCancelOption(args[optionsIndex]);

    const call = takeCallerSignal(args, optionsIndex);
    const receiver = terminalReceiver(stream, destroy);

    const promise = withCallerSignal<TResult, Unlisted>(
      call.callerSignal,
      forwards,
      (signal) =>
        nodeFn.apply(receiver, signal ? withSignalAt(call.args, optionsIndex, signal) : call.args) as
          TResult | PromiseLike<TResult>,
    );

    return destroyingOnCancel(stream, promise, destroy);
  };
}

const toArrayCall = terminalWrapped<unknown[]>('toArray', 0);
const someCall = terminalWrapped<boolean>('some', 1);
const everyCall = terminalWrapped<boolean>('every', 1);
const findCall = terminalWrapped<unknown>('find', 1);
const forEachCall = terminalWrapped<void>('forEach', 1);

/**
 * Reads the whole stream into an array. Free function, not a prototype patch.
 *
 * As this reads the entire stream into memory it negates the point of streaming; it exists for
 * interoperability and convenience, the same tradeoff node's own version documents.
 *
 * Canceling stops pulling from the source, destroys it and rejects `CancelError`.
 */
export function toArray<T = unknown>(
  stream: Readable,
  options?: Pick<IReadableTerminalOptions, 'signal' | 'destroyOnCancel'>,
): CancelablePromise<T[], Unlisted> {
  return toArrayCall(stream, options) as CancelablePromise<T[], Unlisted>;
}

/**
 * Calls `fn` on each chunk until it returns a truthy value, the same shape as `Array.prototype.some`.
 * Free function, not a prototype patch.
 *
 * Canceling stops pulling from the source, destroys it and rejects `CancelError`.
 */
export function some<T = unknown>(
  stream: Readable,
  fn: (data: T, options: IReadableVisitorOptions) => boolean | Promise<boolean>,
  options?: IReadableTerminalOptions,
): CancelablePromise<boolean> {
  return someCall(stream, fn, options) as CancelablePromise<boolean>;
}

/**
 * Calls `fn` on each chunk until it returns a falsy value, the same shape as `Array.prototype.every`.
 * Free function, not a prototype patch.
 *
 * Canceling stops pulling from the source, destroys it and rejects `CancelError`.
 */
export function every<T = unknown>(
  stream: Readable,
  fn: (data: T, options: IReadableVisitorOptions) => boolean | Promise<boolean>,
  options?: IReadableTerminalOptions,
): CancelablePromise<boolean> {
  return everyCall(stream, fn, options) as CancelablePromise<boolean>;
}

/**
 * Finds the first chunk for which `fn` returns a truthy value, the same shape as
 * `Array.prototype.find`. Free function, not a prototype patch.
 *
 * Canceling stops pulling from the source, destroys it and rejects `CancelError`.
 */
export function find<T = unknown>(
  stream: Readable,
  fn: (data: T, options: IReadableVisitorOptions) => boolean | Promise<boolean>,
  options?: IReadableTerminalOptions,
): CancelablePromise<T | undefined> {
  return findCall(stream, fn, options) as CancelablePromise<T | undefined>;
}

/**
 * Calls `fn` on every chunk, in order by default or with up to `options.concurrency` calls in
 * flight at once. Free function, not a prototype patch.
 *
 * Canceling stops pulling from the source, destroys it and rejects `CancelError`.
 */
export function forEach<T = unknown>(
  stream: Readable,
  fn: (data: T, options: IReadableVisitorOptions) => void | Promise<void>,
  options?: IReadableTerminalOptions,
): CancelablePromise<void> {
  return forEachCall(stream, fn, options) as CancelablePromise<void>;
}

const reduceEntry = entries.get('reduce');
const reduceForwardsSignal = acceptsSignal(reduceEntry);

/**
 * Reduces the stream to a single value, calling `fn` with the accumulator and each chunk in order,
 * the same shape as `Array.prototype.reduce`. Free function, not a prototype patch. With no
 * `initial` value, the first chunk seeds the reduction, same as node's own version.
 *
 * With `initial` supplied, canceling forwards the signal into node's own implementation the same
 * way the other terminals do. Without `initial`, node's own `reduce` has no argument position left
 * for an options bag: its seed-detection reads how many arguments the call received, so a bag
 * passed in that slot would be read as the seed rather than as options. Canceling then falls back to
 * destroying the source stream directly. Either way the outcome is the same: the stream stops being
 * read and the promise rejects `CancelError`.
 */
export function reduce<T = unknown, TAcc = T>(
  stream: Readable,
  fn: (previous: TAcc, data: T, options: IReadableVisitorOptions) => TAcc | Promise<TAcc>,
  initial?: TAcc,
  options?: Pick<IReadableTerminalOptions, 'signal' | 'destroyOnCancel'>,
): CancelablePromise<TAcc> {
  const hasInitial = arguments.length > 2;
  const nodeFn = (stream as unknown as Record<string, TNodeFn>).reduce;

  if (!hasInitial) {
    return new CancelablePromise<TAcc>((resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        stream.destroy();
      });
      resolve(nodeFn.call(stream, fn) as TAcc | PromiseLike<TAcc>);
    });
  }

  const call = takeCallerSignal([fn, initial, options], 2);
  const destroy = destroyOnCancelOption(options);
  const receiver = terminalReceiver(stream, destroy);

  const promise = withCallerSignal<TAcc, Unlisted>(
    call.callerSignal,
    reduceForwardsSignal,
    (signal) =>
      nodeFn.apply(receiver, signal ? withSignalAt(call.args, 2, signal) : call.args) as TAcc | PromiseLike<TAcc>,
  );

  return destroyingOnCancel(stream, promise, destroy);
}

// map, filter, take, drop and flatMap are deliberately absent: they return a lazily consumed
// stream, not a promise, so they are not terminals in the sense this module wraps; use
// @cancjs/toolbox/async-iter for those.
