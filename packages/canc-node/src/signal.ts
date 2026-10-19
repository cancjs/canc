import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../_util';
import { setFnName } from '../../_util';
import { features } from './features';

// caller signal rule: lifted onto the promise a wrapper owns, raw where node hands back a handle

/** Signal facts the surface manifest records for one export. */
export interface INodeSignalFacts {
  readonly documented: boolean;
  readonly since: string | null;
  readonly sinceByMajor?: Readonly<Record<string, string>> | null;
  readonly probed: string | null;
}

/** The part of a surface manifest export record the wrappers read. */
export interface IManifestEntry {
  readonly name: string;
  readonly nodeSignal: INodeSignalFacts;
}

/**
 * A node call at the wrapping boundary. Node overloads each of these per call site, so a wrapper
 * stays variadic and the binding that uses it keeps node's published signature.
 */
export type TNodeFn = (...args: unknown[]) => unknown;

/** A node options bag, or the encoding shorthand node accepts in its place. */
export type TNodeOptions = string | Readonly<Record<string, unknown>> | null | undefined;

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

/**
 * Whether node accepts an AbortSignal for this export on the running version.
 *
 * The answer is per release line rather than per function, because signal support is backported: a
 * member can accept one on 24 and 26 and reject it on 22. It is also per minor, because a backport
 * lands partway through a line: `stat` accepts a signal from 26.8.0 and not from 26.0.0, so
 * comparing majors alone forwards an option that does not exist yet on 26.0 through 26.7. Forwarding
 * stays conditional because a runtime that validates option keys throws on an unknown `signal`, so
 * an unconditional spread is a hard failure there rather than a no-op.
 */
export function acceptsSignal(entry: IManifestEntry | undefined, version: string = features.nodeVersion): boolean {
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

  // the newest line the map names that is not newer than this one; a later line inherits its answer
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

/** Merge the signal into a node options argument, honoring the encoding-string shorthand. */
export function withSignal(options: TNodeOptions | object, signal: unknown): Record<string, unknown> {
  if (typeof options === 'string') {
    return { encoding: options, signal };
  }
  if (options) {
    return { ...options, signal };
  }
  return { signal };
}

/**
 * Place the signal in the argument node reads options from for this call. The position is per
 * function: `readFile(path, options)` and `writeFile(path, data, options)` do not agree, and
 * merging into whatever came last would turn `writeFile(path, 'text')` into an encoding.
 */
export function withSignalAt(args: unknown[], optionsIndex: number, signal: unknown): unknown[] {
  const callArgs = args.slice();
  while (callArgs.length < optionsIndex) {
    callArgs.push(undefined);
  }

  callArgs[optionsIndex] = withSignal(callArgs[optionsIndex] as TNodeOptions, signal);
  return callArgs;
}

/** A node options bag with the caller's own signal lifted out of it. */
export interface ICallerSignalOptions<TOptions> {
  /** The options without a `signal` key, so nothing later overwrites it and node never sees it. */
  readonly options: TOptions;
  /** What the caller put there, or undefined when there was nothing. */
  readonly callerSignal: AbortSignal | undefined;
}

/**
 * Take the caller's own signal out of a node options bag, so it can be given to the promise
 * instead.
 *
 * The signal this package sends node is the one cancellation drives, and there is room for exactly
 * one. A caller's signal handed to the promise reaches node all the same, one step further back:
 * their abort cancels the promise, cancelling aborts our signal, and node stops. That is one
 * settlement path and one error, where combining the two signals would give the caller node's
 * AbortError or our CancelError depending on timing.
 */
export function liftCallerSignal<TOptions>(options: TOptions): ICallerSignalOptions<TOptions> {
  if (typeof options !== 'object' || options === null) {
    return { options, callerSignal: undefined };
  }

  const callerSignal = (options as Record<string, unknown>).signal;
  if (!isAbortSignalLike(callerSignal)) {
    return { options, callerSignal: undefined };
  }

  const { signal: _signal, ...rest } = options as Record<string, unknown>;

  return { options: rest as TOptions, callerSignal };
}

/** A call with the caller's own signal lifted out of the node options bag. */
export interface ICallerSignalCall {
  /** The arguments with that `signal` key removed. */
  readonly args: unknown[];
  /** What the caller put there, or undefined when there was nothing. */
  readonly callerSignal: AbortSignal | undefined;
}

/**
 * {@link liftCallerSignal} for the options bag at `optionsIndex` in an argument list. A negative
 * index counts from the end, for calls whose options always come last but whose arity varies.
 */
export function takeCallerSignal(args: unknown[], optionsIndex: number): ICallerSignalCall {
  const index = optionsIndex < 0 ? args.length + optionsIndex : optionsIndex;
  if (index < 0 || index >= args.length) {
    return { args, callerSignal: undefined };
  }

  const lifted = liftCallerSignal(args[index]);
  if (!lifted.callerSignal) {
    return { args, callerSignal: undefined };
  }

  const callArgs = args.slice();
  callArgs[index] = lifted.options;

  return { args: callArgs, callerSignal: lifted.callerSignal };
}

/**
 * Start a node call under a promise the caller's signal drives.
 *
 * When `forwards` is set, `start` is handed the signal cancellation aborts, minted before the call so
 * a cancel racing the call still reaches node. Otherwise `start` gets nothing and cancel only stops
 * the wait. Either way the caller's own abort rejects `CancelError`.
 *
 * @param callerSignal - The signal lifted out of the caller's options, if any.
 * @param forwards - Whether node accepts a signal for this call on the running version.
 * @param start - Makes the node call, placing the given signal wherever node reads it.
 */
export function withCallerSignal<R, TFailure = Unlisted>(
  callerSignal: AbortSignal | undefined,
  forwards: boolean,
  start: (signal: AbortSignal | undefined) => R | PromiseLike<R>,
): CancelablePromise<R, TFailure> {
  return new CancelablePromise<R, TFailure>(
    (resolve, _reject, { getSignal }) => {
      resolve(start(forwards ? (getSignal() as unknown as AbortSignal) : undefined));
    },
    { signal: callerSignal },
  );
}

/**
 * Wrap a promise-returning node call at a fixed options position, lifting any caller signal to the
 * promise and forwarding the cancel signal when node accepts one.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 * @param entry - Manifest record stating whether node accepts a signal here.
 * @param optionsIndex - Argument position node reads options from.
 */
export function signalWrapped<R = unknown>(
  nodeFn: TNodeFn,
  entry: IManifestEntry | undefined,
  optionsIndex = 0,
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  const forwards = acceptsSignal(entry);

  return function signalWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<R, Unlisted> {
    const call = takeCallerSignal(args, optionsIndex);

    return withCallerSignal<R>(
      call.callerSignal,
      forwards,
      (signal) =>
        nodeFn.apply(this, signal ? withSignalAt(call.args, optionsIndex, signal) : call.args) as R | PromiseLike<R>,
    );
  };
}

/** The promisify shape the callback wrappers below build on, bound to CancelablePromise. */
export type TPromisify = (
  fn: TNodeFn,
  options?: { signal?: AbortSignal; [key: string]: unknown },
) => (...args: unknown[]) => unknown;

/**
 * Promisify a callback-style node call, lifting any caller signal out of the options bag at
 * `optionsIndex` and onto the promise.
 *
 * @param promisify - Promisify bound to CancelablePromise.
 * @param nodeFn - Callback-style node function taking an errfirst callback last.
 * @param optionsIndex - Argument position node reads options from, negative to count from the end.
 * @param options - Promisify options shared by every call.
 */
export function promisifyLifted<R = unknown>(
  promisify: TPromisify,
  nodeFn: TNodeFn,
  optionsIndex: number,
  options?: Record<string, unknown>,
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  const plain = promisify(nodeFn, options);

  const lifted = function promisifyLiftedCall(this: unknown, ...args: unknown[]): CancelablePromise<R, Unlisted> {
    const call = takeCallerSignal(args, optionsIndex);

    // promisify reads its options once, at wrap time, so a per-call signal needs its own binding
    const bound = call.callerSignal ? promisify(nodeFn, { ...options, signal: call.callerSignal }) : plain;

    return bound.apply(this, call.args) as CancelablePromise<R, Unlisted>;
  };

  return setFnName(lifted, 'promisify', nodeFn);
}
