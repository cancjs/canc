import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, TPromiseCtor } from '../../../_toolbox';
import { promisifyFactory } from '../../../_toolbox/promisify';
import { features } from '../features';

export { gated as gatedWrapped } from '../gate';

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

/** One node call signature, with a cancelable promise in place of the plain one it returned. */
type TCancelableReturn<R> = [R] extends [Promise<infer TValue>] ? CancelablePromise<TValue> : R;

/**
 * Return rewrites the signature ladder below can apply, selected by name because a type alias
 * cannot be passed as an argument.
 */
interface IReturnRewrite<R> {
  cancelable: TCancelableReturn<R>;
  same: R;
}

/** Name of a rewrite in {@link IReturnRewrite}. */
export type TReturnRewrite = keyof IReturnRewrite<unknown>;

/**
 * Node's signatures for `TFn`, each return rewritten by `TRewrite`, with the overloads kept.
 *
 * A single `(...args: Parameters<TFn>) => ...` would collapse an overloaded function to its last
 * signature, which is how `readFile(path, 'utf8')` loses `string` and resolves node's widest
 * `string | Buffer` instead. Inferring a fixed number of call signatures and rebuilding them one for
 * one keeps each overload separate. The ladder tries the widest arity first so a function is matched
 * by the branch with its own overload count; the widest fs member publishes five. Merged properties,
 * such as the `native` on `realpathSync`, are dropped, which is why the ladder also serves the
 * synchronous surface where no return changes at all.
 */
export type TNodeSignatures<TFn, TRewrite extends TReturnRewrite> =
  TFn extends (
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
      (...args: A1): IReturnRewrite<R1>[TRewrite];
      (...args: A2): IReturnRewrite<R2>[TRewrite];
      (...args: A3): IReturnRewrite<R3>[TRewrite];
      (...args: A4): IReturnRewrite<R4>[TRewrite];
      (...args: A5): IReturnRewrite<R5>[TRewrite];
      (...args: A6): IReturnRewrite<R6>[TRewrite];
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
      (...args: A1): IReturnRewrite<R1>[TRewrite];
      (...args: A2): IReturnRewrite<R2>[TRewrite];
      (...args: A3): IReturnRewrite<R3>[TRewrite];
      (...args: A4): IReturnRewrite<R4>[TRewrite];
      (...args: A5): IReturnRewrite<R5>[TRewrite];
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
      (...args: A1): IReturnRewrite<R1>[TRewrite];
      (...args: A2): IReturnRewrite<R2>[TRewrite];
      (...args: A3): IReturnRewrite<R3>[TRewrite];
      (...args: A4): IReturnRewrite<R4>[TRewrite];
    }
  : TFn extends (
    {
      (...args: infer A1): infer R1;
      (...args: infer A2): infer R2;
      (...args: infer A3): infer R3;
    }
  ) ?
    {
      (...args: A1): IReturnRewrite<R1>[TRewrite];
      (...args: A2): IReturnRewrite<R2>[TRewrite];
      (...args: A3): IReturnRewrite<R3>[TRewrite];
    }
  : TFn extends { (...args: infer A1): infer R1; (...args: infer A2): infer R2 } ?
    {
      (...args: A1): IReturnRewrite<R1>[TRewrite];
      (...args: A2): IReturnRewrite<R2>[TRewrite];
    }
  : TFn extends (...args: infer A) => infer R ? (...args: A) => IReturnRewrite<R>[TRewrite]
  : never;

/** Node's signature for `TFn`, returning a cancelable promise, overloads kept. */
export type TCancelable<TFn> = TNodeSignatures<TFn, 'cancelable'>;

/** Node's signature for `TFn` unchanged, minus anything merged onto the function object. */
export type TSignatures<TFn> = TNodeSignatures<TFn, 'same'>;

/** Promise flavor bound into the inlined toolbox algorithms, so every product is cancelable. */
interface ICancelableKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

/** One dependency bag for every toolbox algorithm this package builds on. */
export const toolboxDeps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

/** Promisify bound to CancelablePromise, for the callback API a custom implementation can patch. */
export const promisifyWrapped = promisifyFactory(toolboxDeps);

/**
 * Whether node accepts an AbortSignal for this export on the running release line.
 *
 * The answer is per release line rather than per function, because signal support is backported:
 * a member can accept one on 24 and 26 and reject it on 22. Forwarding stays conditional because a
 * runtime that validates option keys throws on an unknown `signal`, so an unconditional spread is
 * a hard failure there rather than a no-op.
 */
function acceptsSignal(entry: IManifestEntry | undefined): boolean {
  const facts = entry?.nodeSignal;
  if (!facts) {
    return false;
  }

  const byMajor = facts.sinceByMajor;
  if (byMajor) {
    let oldestLine = Infinity;
    for (const major of Object.keys(byMajor)) {
      oldestLine = Math.min(oldestLine, Number(major));
    }
    return features.nodeMajor >= oldestLine;
  }

  // no per-line map means support predates the oldest line this package runs on
  return facts.since !== null;
}

/** A call with the caller's own signal lifted out of the node options bag. */
interface ICallerSignalCall {
  /** The arguments with that `signal` key removed, so nothing later overwrites it. */
  readonly args: unknown[];
  /** What the caller put there, or undefined when there was nothing. */
  readonly callerSignal: AbortSignal | undefined;
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
export function withSignal(options: TNodeOptions, signal: unknown): Record<string, unknown> {
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
function withSignalAt(args: unknown[], optionsIndex: number, signal: unknown): unknown[] {
  const callArgs = args.slice();
  while (callArgs.length < optionsIndex) {
    callArgs.push(undefined);
  }

  callArgs[optionsIndex] = withSignal(callArgs[optionsIndex] as TNodeOptions, signal);
  return callArgs;
}

/**
 * Take the caller's own signal out of the node options bag, so it can be given to the promise
 * instead.
 *
 * The signal this package sends node is the one cancellation drives, and there is room for exactly
 * one. A caller's signal handed to the promise reaches node all the same, one step further back:
 * their abort cancels the promise, cancelling aborts our signal, and node stops. That is one
 * settlement path and one error, where combining the two signals would give the caller node's
 * AbortError or our CancelError depending on timing.
 */
function takeCallerSignal(args: unknown[], optionsIndex: number): ICallerSignalCall {
  const options = args[optionsIndex] as TNodeOptions;
  if (!options || typeof options === 'string') {
    return { args, callerSignal: undefined };
  }

  const callerSignal = options.signal;
  if (!isAbortSignalLike(callerSignal)) {
    return { args, callerSignal: undefined };
  }

  const { signal: _signal, ...rest } = options;
  const callArgs = args.slice();
  callArgs[optionsIndex] = rest;

  return { args: callArgs, callerSignal };
}

/**
 * Wrap a promise-returning node call, forwarding the cancel signal when node accepts one.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 * @param entry - Manifest record stating whether node accepts a signal here.
 * @param optionsIndex - Argument position node reads options from.
 */
export function signalWrapped<R = unknown>(
  nodeFn: TNodeFn,
  entry: IManifestEntry | undefined,
  optionsIndex = 0,
): (...args: unknown[]) => CancelablePromise<R> {
  const forwards = acceptsSignal(entry);

  return function signalWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<R> {
    if (!forwards) {
      return new CancelablePromise<R>((resolve) => {
        resolve(nodeFn.apply(this, args) as R | PromiseLike<R>);
      });
    }

    const call = takeCallerSignal(args, optionsIndex);

    return new CancelablePromise<R>(
      (resolve, _reject, { getSignal }) => {
        // the signal is minted before the call, so a cancel racing the call still aborts it
        resolve(nodeFn.apply(this, withSignalAt(call.args, optionsIndex, getSignal())) as R | PromiseLike<R>);
      },
      { signal: call.callerSignal },
    );
  };
}

/**
 * Promisify a callback-style node call, placing the cancel signal in the options bag when node
 * accepts one. The signal rides the promise promisify already builds, so a call costs one promise.
 *
 * @param nodeFn - Callback-style node function taking an errfirst callback last.
 * @param entry - Manifest record stating whether node accepts a signal here.
 * @param optionsIndex - Argument position node reads options from.
 */
export function promisifySignalWrapped<R = unknown>(
  nodeFn: TNodeFn,
  entry: IManifestEntry | undefined,
  optionsIndex = 0,
): (...args: unknown[]) => CancelablePromise<R> {
  if (!acceptsSignal(entry)) {
    return promisifyWrapped(nodeFn);
  }

  const transformArgs = (args: unknown[], getSignal: () => unknown): unknown[] =>
    withSignalAt(args, optionsIndex, getSignal());

  const plain = promisifyWrapped(nodeFn, { transformArgs });

  return function promisifySignalWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<R> {
    const call = takeCallerSignal(args, optionsIndex);

    // promisify reads its options once, at wrap time, so a per-call signal needs its own binding
    const bound = call.callerSignal ? promisifyWrapped(nodeFn, { transformArgs, signal: call.callerSignal }) : plain;

    return bound.apply(this, call.args) as CancelablePromise<R>;
  };
}

/**
 * Wrap a node call that takes no signal but leaves something to stop, such as an open descriptor.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 * @param teardown - Cleanup for the value the call produced, run once if cancel wins the race.
 */
export function teardownWrapped<R = unknown>(
  nodeFn: TNodeFn,
  teardown: (value: R, args: unknown[]) => void,
): (...args: unknown[]) => CancelablePromise<R> {
  return function teardownWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<R> {
    return new CancelablePromise<R>((resolve, _reject, { handleCancel }) => {
      const started = nodeFn.apply(this, args) as R | PromiseLike<R>;

      // what needs tearing down only exists once the call settles, so the handler waits for it
      handleCancel(() => {
        void Promise.resolve(started).then(
          (value) => {
            try {
              teardown(value, args);
            } catch (_err) {
              // a failing teardown must not replace the CancelError the caller already has
            }
          },
          () => {},
        );
      });

      resolve(started);
    });
  };
}

/**
 * Wrap a node call with nothing to abort. Cancel rejects the chain and the underlying call runs to
 * completion, which is the same guarantee node itself gives for these.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 */
export function adopted<R = unknown>(nodeFn: TNodeFn): (...args: unknown[]) => CancelablePromise<R> {
  return function adoptedCall(this: unknown, ...args: unknown[]): CancelablePromise<R> {
    return new CancelablePromise<R>((resolve) => {
      resolve(nodeFn.apply(this, args) as R | PromiseLike<R>);
    });
  };
}

/**
 * Forward a node call that returns something other than a promise, such as the async iterable
 * `watch` and `glob` hand back.
 *
 * There is nothing to adopt: resolving a promise with an async iterable fulfills WITH the iterable,
 * so `for await` over the result stops working. There is nothing to cancel either, because the
 * caller holds the iterator and node already stops one from a `signal` in the options bag. Leaving
 * the arguments alone is what lets that signal through.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 */
export function passthrough(nodeFn: TNodeFn): TNodeFn {
  return function passthroughCall(this: unknown, ...args: unknown[]): unknown {
    return nodeFn.apply(this, args);
  };
}
