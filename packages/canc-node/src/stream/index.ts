import type { DuplexOptions } from 'node:stream';
import * as nodeStream from 'node:stream';
import { addAbortSignal, Duplex, PassThrough, Readable, Transform, Writable } from 'node:stream';
import * as nodeStreamPromises from 'node:stream/promises';

import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import streamJson from '../../surface/projected/stream.json';
import { gated, hasDuplexPair } from '../gate';
import {
  acceptsSignal,
  ICallerSignalCall,
  IManifestEntry,
  signalWrapped,
  takeCallerSignal,
  TNodeFn,
  withCallerSignal,
  withSignal,
} from '../signal';

const duplexPairImpl = gated(
  hasDuplexPair,
  'duplexPair',
  '20.17.0 / 22.6.0',
  () => (nodeStream as unknown as { duplexPair: (options?: DuplexOptions) => [Duplex, Duplex] }).duplexPair,
  'sync',
);

export function duplexPair(options?: DuplexOptions): [Duplex, Duplex] {
  return duplexPairImpl(options);
}

export { addAbortSignal, Duplex, PassThrough, Readable, Transform, Writable };

const entries = new Map<string, IManifestEntry>(
  streamJson.exports.map((entry) => [entry.name, entry as IManifestEntry]),
);

/** One node call signature, with a cancelable promise in place of the plain one it returned. */
type TCancelableReturn<R, TFailure> = [R] extends [Promise<infer TValue>] ? CancelablePromise<TValue, TFailure> : R;

/**
 * Node's overloaded signatures for `TFn`, each return rewritten to a cancelable promise.
 *
 * A single `(...args: Parameters<TFn>) => ...` would collapse an overloaded function to its last
 * signature. Inferring a fixed number of call signatures and rebuilding them one for one keeps each
 * overload separate; `pipeline` publishes seven.
 */
// seven rungs covers pipeline, the widest signature this module wraps
type TCancelable<TFn, TFailure = Unlisted> =
  TFn extends (
    {
      (...args: infer A1): infer TRet1;
      (...args: infer A2): infer TRet2;
      (...args: infer A3): infer TRet3;
      (...args: infer A4): infer TRet4;
      (...args: infer A5): infer TRet5;
      (...args: infer A6): infer TRet6;
      (...args: infer A7): infer TRet7;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<TRet1, TFailure>;
      (...args: A2): TCancelableReturn<TRet2, TFailure>;
      (...args: A3): TCancelableReturn<TRet3, TFailure>;
      (...args: A4): TCancelableReturn<TRet4, TFailure>;
      (...args: A5): TCancelableReturn<TRet5, TFailure>;
      (...args: A6): TCancelableReturn<TRet6, TFailure>;
      (...args: A7): TCancelableReturn<TRet7, TFailure>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer TRet1;
      (...args: infer A2): infer TRet2;
      (...args: infer A3): infer TRet3;
      (...args: infer A4): infer TRet4;
      (...args: infer A5): infer TRet5;
      (...args: infer A6): infer TRet6;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<TRet1, TFailure>;
      (...args: A2): TCancelableReturn<TRet2, TFailure>;
      (...args: A3): TCancelableReturn<TRet3, TFailure>;
      (...args: A4): TCancelableReturn<TRet4, TFailure>;
      (...args: A5): TCancelableReturn<TRet5, TFailure>;
      (...args: A6): TCancelableReturn<TRet6, TFailure>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer TRet1;
      (...args: infer A2): infer TRet2;
      (...args: infer A3): infer TRet3;
      (...args: infer A4): infer TRet4;
      (...args: infer A5): infer TRet5;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<TRet1, TFailure>;
      (...args: A2): TCancelableReturn<TRet2, TFailure>;
      (...args: A3): TCancelableReturn<TRet3, TFailure>;
      (...args: A4): TCancelableReturn<TRet4, TFailure>;
      (...args: A5): TCancelableReturn<TRet5, TFailure>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer TRet1;
      (...args: infer A2): infer TRet2;
      (...args: infer A3): infer TRet3;
      (...args: infer A4): infer TRet4;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<TRet1, TFailure>;
      (...args: A2): TCancelableReturn<TRet2, TFailure>;
      (...args: A3): TCancelableReturn<TRet3, TFailure>;
      (...args: A4): TCancelableReturn<TRet4, TFailure>;
    }
  : TFn extends (
    {
      (...args: infer A1): infer TRet1;
      (...args: infer A2): infer TRet2;
      (...args: infer A3): infer TRet3;
    }
  ) ?
    {
      (...args: A1): TCancelableReturn<TRet1, TFailure>;
      (...args: A2): TCancelableReturn<TRet2, TFailure>;
      (...args: A3): TCancelableReturn<TRet3, TFailure>;
    }
  : TFn extends { (...args: infer A1): infer TRet1; (...args: infer A2): infer TRet2 } ?
    {
      (...args: A1): TCancelableReturn<TRet1, TFailure>;
      (...args: A2): TCancelableReturn<TRet2, TFailure>;
    }
  : TFn extends (...args: infer A) => infer R ? (...args: A) => TCancelableReturn<R, TFailure>
  : never;

/**
 * Whether the last positional argument to a `pipeline` call is an options bag rather than a
 * stream, a transform function or the array form's stream list.
 */
function isPipelineOptionsBag(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  // web streams have no pipe() or write(); their getWriter/getReader or readable/writable pair marks them
  const maybeStream = value as { pipe?: unknown; write?: unknown; getWriter?: unknown; getReader?: unknown };
  if (typeof maybeStream.getWriter === 'function' || typeof maybeStream.getReader === 'function') {
    return false;
  }
  if ('readable' in value && 'writable' in value) {
    return false;
  }
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
): (...args: unknown[]) => CancelablePromise<unknown, unknown> {
  const forwards = acceptsSignal(entry);

  return function pipelineWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<unknown, unknown> {
    const call = takeCallerSignalFromPipeline(args);

    return withCallerSignal<unknown, unknown>(call.callerSignal, forwards, (signal) =>
      nodeFn.apply(this, signal ? withPipelineSignal(call.args, signal) : call.args),
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
  typeof nodeStreamPromises.pipeline,
  unknown
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
