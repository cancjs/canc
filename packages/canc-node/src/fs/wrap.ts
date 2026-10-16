import type * as nodeFsPromises from 'node:fs/promises';

import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, TPromiseCtor } from '../../../_toolbox';
import { promisifyFactory } from '../../../_toolbox/promisify';
import type { Unlisted } from '../../../_util';
import { isCancelable } from '../../../_util';
import {
  acceptsSignal,
  IManifestEntry,
  promisifyLifted,
  takeCallerSignal,
  TNodeFn,
  TPromisify,
  withCallerSignal,
  withSignalAt,
} from '../signal';

export { gated as gatedWrapped } from '../gate';
export type { IManifestEntry, INodeSignalFacts, TNodeFn, TNodeOptions } from '../signal';
export { acceptsSignal, signalWrapped, withSignal } from '../signal';

/** Handle method names overridden by this package to return cancelable promises. */
export type TOverriddenHandleKeys =
  'appendFile' | 'close' | 'read' | 'readFile' | 'readv' | 'stat' | 'write' | 'writeFile' | 'writev';

/**
 * A node FileHandle decorated by this package.
 *
 * Wrapped members return cancelable promises with their overloads kept.
 * Passthrough members keep node's exact type.
 */
export type TCancelableFileHandle<THandle = nodeFsPromises.FileHandle> = {
  [K in keyof THandle]: K extends keyof THandle & TOverriddenHandleKeys ? TNodeSignatures<THandle[K], 'cancelable'>
  : THandle[K];
};

/** One node call signature, with a cancelable promise in place of the plain one it returned. */
type TCancelableReturn<R> =
  [R] extends [Promise<infer TValue>] ?
    CancelablePromise<TValue extends nodeFsPromises.FileHandle ? TCancelableFileHandle<TValue> : TValue, Unlisted>
  : R;

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
// six rungs is a cap, not a fact about node: past it, TS keeps the newest six signatures and
// silently drops the oldest one instead of erroring, so a function's original call shape is the
// one that quietly stops type-checking once a function it wraps grows a seventh overload
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
  promise: CancelablePromise<this['value'], Unlisted>;
  options: object;
}

/** One dependency bag for every toolbox algorithm this package builds on. */
export const toolboxDeps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

/** Promisify bound to CancelablePromise, for the callback API a custom implementation can patch. */
const promisify = promisifyFactory(toolboxDeps);

/**
 * Promisify a callback-style node call, lifting any caller signal to the promise and leaving
 * the options bag without a signal key for node.
 *
 * @param nodeFn - Callback-style node function taking an errfirst callback last.
 * @param optionsIndex - Argument position node reads options from.
 */
export function promisifyWrapped<R = unknown>(
  nodeFn: TNodeFn,
  optionsIndex = 0,
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  return promisifyLifted<R>(promisify as TPromisify, nodeFn, optionsIndex);
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
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  const forwards = acceptsSignal(entry);
  const transformArgs =
    forwards ?
      (args: unknown[], getSignal: () => unknown): unknown[] => withSignalAt(args, optionsIndex, getSignal())
    : undefined;

  return promisifyLifted<R>(
    promisify as TPromisify,
    nodeFn,
    optionsIndex,
    transformArgs ? { transformArgs } : undefined,
  );
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
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  return function teardownWrappedCall(this: unknown, ...args: unknown[]): CancelablePromise<R, Unlisted> {
    return new CancelablePromise<R, Unlisted>((resolve, _reject, { handleCancel }) => {
      const started = nodeFn.apply(this, args) as R | PromiseLike<R>;
      if (isCancelable(started)) {
        // shield cancelable inner so teardown can run once the underlying work resolves
        (started as unknown as { shield?: boolean }).shield = true;
      }

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
 * @param optionsIndex - Argument position node reads options from.
 */
export function adopted<R = unknown>(
  nodeFn: TNodeFn,
  optionsIndex = 0,
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  return function adoptedCall(this: unknown, ...args: unknown[]): CancelablePromise<R, Unlisted> {
    const call = takeCallerSignal(args, optionsIndex);
    return withCallerSignal<R>(call.callerSignal, false, () => nodeFn.apply(this, call.args) as R | PromiseLike<R>);
  };
}

/**
 * Forward a node call that returns something other than a promise, such as the async iterable
 * `watch` and `glob` hand back.
 *
 * There is nothing to adopt: resolving a promise with an async iterable fulfills WITH the iterable,
 * so `for await` over the result stops working. There is nothing to cancel either, because the
 * caller holds the iterator and node already stops one from a `signal` in the options bag. Leaving
 * the arguments alone is what lets that signal through. This is the one deliberate exception to
 * lifting the caller signal to the promise.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 */
export function passthrough(nodeFn: TNodeFn): TNodeFn {
  return function passthroughCall(this: unknown, ...args: unknown[]): unknown {
    return nodeFn.apply(this, args);
  };
}
