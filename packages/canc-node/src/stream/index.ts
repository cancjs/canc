import { addAbortSignal, Duplex, duplexPair, PassThrough, Readable, Transform, Writable } from 'node:stream';
import * as nodeStreamPromises from 'node:stream/promises';

import { CancelablePromise } from '@cancjs/promise';

import streamJson from '../../surface/projected/stream.json';

export { addAbortSignal, Duplex, duplexPair, PassThrough, Readable, Transform, Writable };

// local copy of the signal-forwarding combinator also at packages/canc-node/src/fs/wrap.ts
// written before that module reached this branch, same names and behavior, dedupe later

/** Signal facts the surface manifest records for one export. */
interface INodeSignalFacts {
  readonly documented: boolean;
  readonly since: string | null;
  readonly sinceByMajor?: Readonly<Record<string, string>> | null;
  readonly probed: string | null;
}

/** The part of a surface manifest export record the wrappers read. */
interface IManifestEntry {
  readonly name: string;
  readonly nodeSignal: INodeSignalFacts;
}

/** A node call at the wrapping boundary, variadic so a binding can keep node's own signature. */
type TNodeFn = (...args: unknown[]) => unknown;

/** A node options bag, or the encoding shorthand node accepts in its place. */
type TNodeOptions = string | Readonly<Record<string, unknown>> | null | undefined;

const entries = new Map<string, IManifestEntry>(
  streamJson.exports.map((entry) => [entry.name, entry as IManifestEntry]),
);

/** One node call signature, with a cancelable promise in place of the plain one it returned. */
type TCancelableReturn<R> = [R] extends [Promise<infer TValue>] ? CancelablePromise<TValue> : R;

/**
 * Node's overloaded signatures for `TFn`, each return rewritten to a cancelable promise.
 *
 * A single `(...args: Parameters<TFn>) => ...` would collapse an overloaded function to its last
 * signature. Inferring a fixed number of call signatures and rebuilding them one for one keeps each
 * overload separate; `pipeline` publishes seven.
 */
// seven rungs covers pipeline, the widest signature this module wraps
type TCancelable<TFn> =
  TFn extends (
    {
      (...args: infer A1): infer R1;
      (...args: infer A2): infer R2;
      (...args: infer A3): infer R3;
      (...args: infer A4): infer R4;
      (...args: infer A5): infer R5;
      (...args: infer A6): infer R6;
      (...args: infer A7): infer R7;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<R1>;
      (...args: A2): TCancelableReturn<R2>;
      (...args: A3): TCancelableReturn<R3>;
      (...args: A4): TCancelableReturn<R4>;
      (...args: A5): TCancelableReturn<R5>;
      (...args: A6): TCancelableReturn<R6>;
      (...args: A7): TCancelableReturn<R7>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer R1;
      (...args: infer A2): infer R2;
      (...args: infer A3): infer R3;
      (...args: infer A4): infer R4;
      (...args: infer A5): infer R5;
      (...args: infer A6): infer R6;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<R1>;
      (...args: A2): TCancelableReturn<R2>;
      (...args: A3): TCancelableReturn<R3>;
      (...args: A4): TCancelableReturn<R4>;
      (...args: A5): TCancelableReturn<R5>;
      (...args: A6): TCancelableReturn<R6>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer R1;
      (...args: infer A2): infer R2;
      (...args: infer A3): infer R3;
      (...args: infer A4): infer R4;
      (...args: infer A5): infer R5;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<R1>;
      (...args: A2): TCancelableReturn<R2>;
      (...args: A3): TCancelableReturn<R3>;
      (...args: A4): TCancelableReturn<R4>;
      (...args: A5): TCancelableReturn<R5>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer R1;
      (...args: infer A2): infer R2;
      (...args: infer A3): infer R3;
      (...args: infer A4): infer R4;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<R1>;
      (...args: A2): TCancelableReturn<R2>;
      (...args: A3): TCancelableReturn<R3>;
      (...args: A4): TCancelableReturn<R4>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer R1;
      (...args: infer A2): infer R2;
      (...args: infer A3): infer R3;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<R1>;
      (...args: A2): TCancelableReturn<R2>;
      (...args: A3): TCancelableReturn<R3>;
    }
  : TFn extends { (...args: infer A1): infer R1; (...args: infer A2): infer R2 } ?
    {
      (...args: A1): TCancelableReturn<R1>;
      (...args: A2): TCancelableReturn<R2>;
    }
  : TFn extends (...args: infer A) => infer R ? (...args: A) => TCancelableReturn<R>
  : never;

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

/** Merge the signal into a node options argument, honoring the encoding-string shorthand. */
function withSignal(options: TNodeOptions, signal: unknown): Record<string, unknown> {
  if (typeof options === 'string') {
    return { encoding: options, signal };
  }
  if (options) {
    return { ...options, signal };
  }
  return { signal };
}

/** Place the signal in the argument node reads options from, padding shorter call sites. */
function withSignalAt(args: unknown[], optionsIndex: number, signal: unknown): unknown[] {
  const callArgs = args.slice();
  while (callArgs.length < optionsIndex) {
    callArgs.push(undefined);
  }

  callArgs[optionsIndex] = withSignal(callArgs[optionsIndex] as TNodeOptions, signal);
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
 * cancelling aborts our own signal, node stops. A raw signal the caller placed in the options bag
 * stays theirs; converting it would claim a cancellation they never asked this package for.
 */
function takeCallerSignal(args: unknown[], optionsIndex: number): ICallerSignalCall {
  const options = args[optionsIndex] as TNodeOptions;
  if (!options || typeof options === 'string') {
    return { args, callerSignal: undefined };
  }

  const callerSignal = (options as Record<string, unknown>).signal;
  if (!isAbortSignalLike(callerSignal)) {
    return { args, callerSignal: undefined };
  }

  const rest = { ...(options as Record<string, unknown>) };
  delete rest.signal;

  const callArgs = args.slice();
  callArgs[optionsIndex] = rest;

  return { args: callArgs, callerSignal };
}

/**
 * Wrap a promise-returning node call at a fixed options position, forwarding the cancel signal
 * when node accepts one.
 */
function signalWrapped(
  nodeFn: TNodeFn,
  entry: IManifestEntry | undefined,
  optionsIndex = 0,
): (...args: unknown[]) => CancelablePromise<unknown> {
  const forwards = acceptsSignal(entry);

  return function signalWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<unknown> {
    if (!forwards) {
      return new CancelablePromise<unknown>((resolve) => {
        resolve(nodeFn.apply(this, args));
      });
    }

    const call = takeCallerSignal(args, optionsIndex);

    return new CancelablePromise<unknown>(
      (resolve, _reject, { getSignal }) => {
        resolve(nodeFn.apply(this, withSignalAt(call.args, optionsIndex, getSignal())));
      },
      { signal: call.callerSignal },
    );
  };
}

/**
 * Whether the last positional argument to a `pipeline` call is an options bag rather than a
 * stream, a transform function or the array form's stream list.
 */
function isPipelineOptionsBag(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const maybeStream = value as { pipe?: unknown; write?: unknown };
  return typeof maybeStream.pipe !== 'function' && typeof maybeStream.write !== 'function';
}

/**
 * Merge the signal into a `pipeline` call, whose options position moves with the argument count:
 * merge into an options bag already in last position, or append a fresh one after the last stream.
 */
function withPipelineSignal(args: unknown[], signal: unknown): unknown[] {
  const last = args[args.length - 1];
  if (isPipelineOptionsBag(last)) {
    return [...args.slice(0, -1), withSignal(last, signal)];
  }
  return [...args, withSignal(undefined, signal)];
}

/** Take the caller's own signal out of a `pipeline` call's trailing options bag, if present. */
function takeCallerSignalFromPipeline(args: unknown[]): ICallerSignalCall {
  const last = args[args.length - 1];
  if (!isPipelineOptionsBag(last)) {
    return { args, callerSignal: undefined };
  }
  return takeCallerSignal(args, args.length - 1);
}

/**
 * Wrap `pipeline`, whose options argument sits after a variable number of streams rather than at a
 * fixed position.
 */
function pipelineSignalWrapped(
  nodeFn: TNodeFn,
  entry: IManifestEntry | undefined,
): (...args: unknown[]) => CancelablePromise<unknown> {
  const forwards = acceptsSignal(entry);

  return function pipelineWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<unknown> {
    if (!forwards) {
      return new CancelablePromise<unknown>((resolve) => {
        resolve(nodeFn.apply(this, args));
      });
    }

    const call = takeCallerSignalFromPipeline(args);

    return new CancelablePromise<unknown>(
      (resolve, _reject, { getSignal }) => {
        resolve(nodeFn.apply(this, withPipelineSignal(call.args, getSignal())));
      },
      { signal: call.callerSignal },
    );
  };
}

const rawPipeline = nodeStreamPromises.pipeline as unknown as TNodeFn;
const rawFinished = nodeStreamPromises.finished as unknown as TNodeFn;

/**
 * Runs every stream in the chain to completion or failure. Canceling destroys every stream in the
 * chain, the same teardown node already runs for its own aborted pipeline: source, every transform
 * and the destination all end up `destroyed`. A failure of the pipeline's own (a stream emitting an
 * error) rejects that error unchanged, never `CancelError`.
 */
export const pipeline = pipelineSignalWrapped(rawPipeline, entries.get('pipeline')) as TCancelable<
  typeof nodeStreamPromises.pipeline
>;

/**
 * Resolves once a stream ends, errors or closes. Canceling removes the listeners this function
 * attached to observe completion, the same cleanup node already runs when its own `signal` option
 * aborts.
 */
export const finished = signalWrapped(rawFinished, entries.get('finished'), 1) as TCancelable<
  typeof nodeStreamPromises.finished
>;

// the /stream subpath's public surface also carries the consumers and the Readable promise
// terminals; each lives in its own file so a reader following just pipeline and finished does not
// scroll past the rest
export type { IConsumerOptions } from './consumers';
export { arrayBuffer, blob, buffer, bytes, json, text } from './consumers';
export type { IReadableTerminalOptions, IReadableVisitorOptions } from './terminals';
export { every, find, forEach, reduce, some, toArray } from './terminals';
