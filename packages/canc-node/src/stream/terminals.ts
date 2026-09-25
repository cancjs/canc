import type { Readable } from 'node:stream';

import { CancelablePromise } from '@cancjs/promise';

import readableJson from '../../surface/projected/stream.Readable.json';

// local copy of the signal-forwarding combinator also at packages/canc-node/src/stream/index.ts
// and packages/canc-node/src/timers/index.ts; same names and behavior, dedupe later

/** Signal facts the surface manifest records for one export. */
interface INodeSignalFacts {
  readonly documented: boolean;
  readonly since: string | null;
  readonly sinceByMajor?: Readonly<Record<string, string>> | null;
  readonly probed: string | null;
}

/** The part of a surface manifest export record the wrapper reads. */
interface IManifestEntry {
  readonly name: string;
  readonly nodeSignal: INodeSignalFacts;
}

/** A node call at the wrapping boundary, variadic so a binding can keep node's own signature. */
type TNodeFn = (...args: unknown[]) => unknown;

const entries = new Map<string, IManifestEntry>(
  (readableJson.exports as IManifestEntry[]).map((entry) => [entry.name, entry]),
);

/** Major, minor and patch of a node version, `v` prefix optional, missing or unparsable parts zero. */
function versionParts(version: string): [number, number, number] {
  const digits = version.replace(/^v/, '').split('.');
  return [Number(digits[0]) || 0, Number(digits[1]) || 0, Number(digits[2]) || 0];
}

/** Whether `version` is `since` or later. */
function atLeast(version: string, since: string): boolean {
  const running = versionParts(version);
  const wanted = versionParts(since);

  for (let i = 0; i < 3; i++) {
    if (running[i] !== wanted[i]) {
      return running[i] > wanted[i];
    }
  }

  return true;
}

/** Whether node accepts an AbortSignal for this export on the running version. */
function acceptsSignal(entry: IManifestEntry | undefined, version: string = process.versions.node): boolean {
  const facts = entry?.nodeSignal;
  if (!facts) {
    return false;
  }

  const byMajor = facts.sinceByMajor;
  if (!byMajor) {
    // no per-line map means support predates the oldest line this package runs on
    return facts.since !== null;
  }

  const running = versionParts(version)[0];

  let inherited = -Infinity;
  for (const major of Object.keys(byMajor)) {
    const listed = Number(major);
    if (listed <= running && listed > inherited) {
      inherited = listed;
    }
  }

  if (inherited === -Infinity) {
    return false;
  }

  return inherited < running || atLeast(version, byMajor[String(inherited)]);
}

/** Whether a value is an abort signal, so anything else stays in the options bag untouched. */
function isAbortSignalLike(value: unknown): value is AbortSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { addEventListener?: unknown }).addEventListener === 'function'
  );
}

/** Merge the signal into a node options argument. */
function withSignal(options: Record<string, unknown> | undefined, signal: unknown): Record<string, unknown> {
  return options ? { ...options, signal } : { signal };
}

/** Place the signal in the argument node reads options from, padding shorter call sites. */
function withSignalAt(args: unknown[], optionsIndex: number, signal: unknown): unknown[] {
  const callArgs = args.slice();
  while (callArgs.length < optionsIndex) {
    callArgs.push(undefined);
  }

  callArgs[optionsIndex] = withSignal(callArgs[optionsIndex] as Record<string, unknown> | undefined, signal);
  return callArgs;
}

/** A call with the caller's own signal lifted out of the node options bag. */
interface ICallerSignalCall {
  readonly args: unknown[];
  readonly callerSignal: AbortSignal | undefined;
}

/**
 * Take the caller's own signal out of the node options bag, so it can be given to the promise
 * instead. The caller's abort still reaches node, one step removed: it cancels the promise,
 * cancelling aborts our own signal, node stops.
 */
function takeCallerSignal(args: unknown[], optionsIndex: number): ICallerSignalCall {
  const options = args[optionsIndex] as Record<string, unknown> | undefined;
  if (!options || typeof options !== 'object') {
    return { args, callerSignal: undefined };
  }

  const callerSignal = options.signal;
  if (!isAbortSignalLike(callerSignal)) {
    return { args, callerSignal: undefined };
  }

  const rest = { ...options };
  delete rest.signal;

  const callArgs = args.slice();
  callArgs[optionsIndex] = rest;

  return { args: callArgs, callerSignal };
}

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
function terminalWrapped<TResult>(
  methodName: string,
  optionsIndex: number,
): (stream: Readable, ...args: unknown[]) => CancelablePromise<TResult> {
  const entry = entries.get(methodName);
  const forwards = acceptsSignal(entry);

  return function terminalCall(stream: Readable, ...args: unknown[]): CancelablePromise<TResult> {
    const nodeFn = (stream as unknown as Record<string, TNodeFn>)[methodName];

    if (!forwards) {
      return new CancelablePromise<TResult>((resolve) => {
        resolve(nodeFn.apply(stream, args) as TResult | PromiseLike<TResult>);
      });
    }

    const call = takeCallerSignal(args, optionsIndex);

    return new CancelablePromise<TResult>(
      (resolve, _reject, { getSignal }) => {
        resolve(
          nodeFn.apply(stream, withSignalAt(call.args, optionsIndex, getSignal())) as TResult | PromiseLike<TResult>,
        );
      },
      { signal: call.callerSignal },
    );
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
  options?: Pick<IReadableTerminalOptions, 'signal'>,
): CancelablePromise<T[]> {
  return toArrayCall(stream, options) as CancelablePromise<T[]>;
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
  options?: Pick<IReadableTerminalOptions, 'signal'>,
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

  if (!reduceForwardsSignal) {
    return new CancelablePromise<TAcc>((resolve) => {
      resolve(nodeFn.call(stream, fn, initial, options) as TAcc | PromiseLike<TAcc>);
    });
  }

  const call = takeCallerSignal([fn, initial, options], 2);

  return new CancelablePromise<TAcc>(
    (resolve, _reject, { getSignal }) => {
      resolve(nodeFn.apply(stream, withSignalAt(call.args, 2, getSignal())) as TAcc | PromiseLike<TAcc>);
    },
    { signal: call.callerSignal },
  );
}

// map, filter, take, drop and flatMap are deliberately absent: they return a lazily consumed
// stream, not a promise, so they are not terminals in the sense this module wraps. Use
// @cancjs/toolbox/async-iter for those.
