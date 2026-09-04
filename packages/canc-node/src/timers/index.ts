import * as nodeTimersPromises from 'node:timers/promises';

import { CancelablePromise } from '@cancjs/promise';

import timersJson from '../../surface/timers.json';

// local copy of the signal-forwarding combinator also at packages/canc-node/src/stream/index.ts
// and packages/canc-node/src/fs/wrap.ts (once that module reaches this branch); same names and
// behavior, dedupe later

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

const entries = new Map<string, IManifestEntry>(
  timersJson.exports.map((entry) => [entry.name, entry as IManifestEntry]),
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

/** Merge the signal into a node options bag. */
function withSignal(options: Record<string, unknown> | undefined, signal: unknown): Record<string, unknown> {
  return options ? { ...options, signal } : { signal };
}

/** A call with the caller's own signal lifted out of the node options bag. */
interface ICallerSignalCall {
  readonly options: Record<string, unknown> | undefined;
  readonly callerSignal: AbortSignal | undefined;
}

/**
 * Take the caller's own signal out of a node options bag, so it can be given to the promise
 * instead. The caller's abort still reaches node, one step removed: it cancels the promise,
 * cancelling aborts our own signal, node stops.
 */
function takeCallerSignal(options: Record<string, unknown> | undefined): ICallerSignalCall {
  if (!options) {
    return { options, callerSignal: undefined };
  }

  const callerSignal = options.signal;
  if (!isAbortSignalLike(callerSignal)) {
    return { options, callerSignal: undefined };
  }

  const rest = { ...options };
  delete rest.signal;

  return { options: rest, callerSignal };
}

/** Node's timer options: `{ ref, signal }`. */
export interface ITimersOptions {
  /** Set to false to let a pending timer skip holding the event loop open. Default true. */
  ref?: boolean;
  /** A signal of the caller's own. Its abort cancels the returned promise, same as calling `cancel()`. */
  signal?: AbortSignal;
}

/** `scheduler.wait`'s options: `ref` is not supported here, only `signal`. */
export interface ISchedulerWaitOptions {
  signal?: AbortSignal;
}

const setTimeoutEntry = entries.get('setTimeout');
const setImmediateEntry = entries.get('setImmediate');
const waitEntry = entries.get('wait');

/**
 * Cancelable `setTimeout`. Category C (trivial): canceling clears the timer, which costs nothing.
 * Ships for drop-in symmetry with `node:timers/promises`. For most call sites `delay` from
 * `@cancjs/toolbox` is the idiomatic choice; reach for this one when porting code that already
 * calls `node:timers/promises` directly, or when `ref: false` is needed.
 */
export function setTimeout<T = void>(delay?: number, value?: T, options?: ITimersOptions): CancelablePromise<T> {
  if (!acceptsSignal(setTimeoutEntry)) {
    return new CancelablePromise<T>((resolve) => {
      resolve(nodeTimersPromises.setTimeout<T>(delay, value, options));
    });
  }

  const call = takeCallerSignal(options as Record<string, unknown> | undefined);

  return new CancelablePromise<T>(
    (resolve, _reject, { getSignal }) => {
      resolve(nodeTimersPromises.setTimeout<T>(delay, value, withSignal(call.options, getSignal()) as ITimersOptions));
    },
    { signal: call.callerSignal },
  );
}

/**
 * Cancelable `setImmediate`. Category C (trivial): canceling clears the queued immediate.
 * Same drop-in-symmetry reasoning as {@link setTimeout}.
 */
export function setImmediate<T = void>(value?: T, options?: ITimersOptions): CancelablePromise<T> {
  if (!acceptsSignal(setImmediateEntry)) {
    return new CancelablePromise<T>((resolve) => {
      resolve(nodeTimersPromises.setImmediate<T>(value, options));
    });
  }

  const call = takeCallerSignal(options as Record<string, unknown> | undefined);

  return new CancelablePromise<T>(
    (resolve, _reject, { getSignal }) => {
      resolve(nodeTimersPromises.setImmediate<T>(value, withSignal(call.options, getSignal()) as ITimersOptions));
    },
    { signal: call.callerSignal },
  );
}

/**
 * The iterator {@link setInterval} returns: an async iterable with one addition, `cancel()`.
 */
export interface ICancelableIntervalIterator<T> extends AsyncIterableIterator<T> {
  /**
   * Ends iteration and clears the underlying interval. Delegates to the iterator protocol's own
   * `return()`, which is what node already uses to clear the timer when a `for await` loop breaks,
   * so iteration ends cleanly and nothing throws into the loop.
   */
  cancel(): void;
}

/**
 * Iterate values on an interval of `delay` ms. Category C (trivial): canceling clears the timer.
 *
 * Returns an async iterable, not a promise, so there is nothing to `.then()`. Stop it by calling
 * `cancel()`, or simply `break` out of a `for await` loop over it; node calls `return()` on the
 * iterator either way and clears the timer.
 *
 * A caller-supplied `options.signal` is passed straight through to node, unmodified: node already
 * ends the iteration and clears the timer when it aborts.
 */
export function setInterval<T = number>(
  delay?: number,
  value?: T,
  options?: ITimersOptions,
): ICancelableIntervalIterator<T> {
  const source = nodeTimersPromises.setInterval<T>(delay, value, options) as unknown as AsyncIterableIterator<T>;

  return Object.assign(source, {
    cancel(): void {
      void source.return?.(undefined as unknown as T);
    },
  });
}

/**
 * `scheduler.wait`. Category C (trivial), same shape as {@link setTimeout} minus a `value` and
 * minus `ref` (node's own type does not offer it for this call).
 */
function schedulerWait(delay: number, options?: ISchedulerWaitOptions): CancelablePromise<void> {
  if (!acceptsSignal(waitEntry)) {
    return new CancelablePromise<void>((resolve) => {
      resolve(nodeTimersPromises.scheduler.wait(delay, options));
    });
  }

  const call = takeCallerSignal(options as Record<string, unknown> | undefined);

  return new CancelablePromise<void>(
    (resolve, _reject, { getSignal }) => {
      resolve(nodeTimersPromises.scheduler.wait(delay, withSignal(call.options, getSignal()) as ISchedulerWaitOptions));
    },
    { signal: call.callerSignal },
  );
}

/**
 * Mirrors `node:timers/promises`' `scheduler` namespace. `wait` is wrapped like {@link setTimeout};
 * `yield` takes no options at all, so it is node's own function, unwrapped and not cancelable.
 */
export const scheduler = {
  wait: schedulerWait,
  // bound: node's own `yield` reads internal state off `this`, which a plain property copy loses
  yield: nodeTimersPromises.scheduler.yield.bind(nodeTimersPromises.scheduler),
};
