import { NotImplementedError } from '@cancjs/node';
import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, TPromiseCtor } from '../../../_toolbox';
import { promisifyFactory, TCallbackFn } from '../../../_toolbox/promisify';
import type { Unlisted } from '../../../_util';
import { gated } from '../gate';
import { promisifyLifted, takeCallerSignal, TNodeFn, TPromisify } from '../signal';

export { gated as gatedWrapped };

/**
 * Return a constructor unchanged when available, or one throwing `NotImplementedError`.
 *
 * `../gate.ts`'s `gated()` is constrained to callable signatures, which a `new`-able class does not
 * structurally match, so the gated stream classes (`ZstdCompress`, `ZipBuffer`, ...) route through
 * this instead of that one.
 */
export function gatedClassWrapped<TCtor extends abstract new (...args: any[]) => any>(
  available: boolean,
  feature: string,
  required: string,
  factory: () => TCtor,
): TCtor {
  if (available) {
    return factory();
  }
  return class {
    constructor(..._args: any[]) {
      throw new NotImplementedError(`${feature} requires Node >= ${required}`, {
        feature,
        required,
      });
    }
  } as unknown as TCtor;
}

export type { TNodeFn } from '../signal';

/** One node call signature, with a cancelable promise in place of the plain one it returned. */
type TCancelableReturn<R> = [R] extends [Promise<infer TValue>] ? CancelablePromise<TValue, Unlisted> : R;

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
 * Same ladder as `../crypto/wrap.ts` and `../fs/wrap.ts` (not yet shared, see `../wrap.ts`'s header
 * note). Six rungs is a cap, not a fact about node.
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

/** Node's signature for `TFn` unchanged. */
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

const promisify = promisifyFactory(toolboxDeps);

/** The one-shot calls read their options right after the input buffer. */
const OPTIONS_INDEX = 1;

/**
 * Promisify bound to CancelablePromise, with a caller's `signal` lifted out of node's options and onto
 * the promise. zlib has no signal support of its own to forward (fact base: `signal: 0` across the
 * whole module), so canceling stops the wait and the caller's abort rejects `CancelError`.
 *
 * @param nodeFn - Callback-style node function taking an errfirst callback last.
 */
export function promisifyWrapped<R = unknown>(
  nodeFn: TCallbackFn,
): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  return promisifyLifted<R>(promisify as TPromisify, nodeFn, OPTIONS_INDEX);
}

/** An async or sync iterator: the common surface both node and the guard below walk. */
type TSourceIterator<T> = AsyncIterator<T> | Iterator<T>;

/** Pull the iterator out of whichever iterable shape the caller passed. */
function sourceIterator<T>(source: AsyncIterable<T> | Iterable<T>): TSourceIterator<T> {
  const asyncSource = source as Partial<AsyncIterable<T>>;
  if (typeof asyncSource[Symbol.asyncIterator] === 'function') {
    return asyncSource[Symbol.asyncIterator]!();
  }
  return (source as Iterable<T>)[Symbol.iterator]();
}

/**
 * Wrap a node call that consumes an async-iterable source, so cancel takes effect between chunks
 * instead of only at the end.
 *
 * The trick is standing between the caller's iterable and node: node pulls from a guard iterable
 * this function owns, not from the source directly. Cancel flips a flag the guard checks before each
 * pull and calls the real source's own `return()`, which is what lets an upstream generator's
 * `finally` run and is the property this wrapper exists to guarantee. Node keeps whatever it already
 * pulled; nothing more is fed to it after that point, which is the actual work stopping rather than
 * a short-circuited wait.
 *
 * @param nodeFn - Underlying node function, called with the caller's receiver and the guard iterable
 *   standing in for the source argument.
 */
export function iterableCodecWrapped<R = unknown>(
  nodeFn: TNodeFn,
): (source: AsyncIterable<unknown> | Iterable<unknown>, ...rest: unknown[]) => CancelablePromise<R, Unlisted> {
  return function iterableCodecCall(
    this: unknown,
    source: AsyncIterable<unknown> | Iterable<unknown>,
    ...rest: unknown[]
  ): CancelablePromise<R, Unlisted> {
    const call = takeCallerSignal(rest, 0);

    return new CancelablePromise<R, Unlisted>(
      (resolve, _reject, { handleCancel }) => {
        const iterator = sourceIterator(source);
        let stopped = false;
        let sourceReturn: Promise<IteratorResult<unknown>> | undefined;

        // cancel and an early stop by node (a consumer's break or throw) both reach the source.
        // Its return() runs once: whichever asks first starts it, the other shares that settlement
        const returnSource = (value?: unknown): Promise<IteratorResult<unknown>> => {
          stopped = true;
          if (sourceReturn === undefined) {
            sourceReturn = (async () => (iterator.return ? iterator.return(value) : { done: true as const, value }))();
          }
          return sourceReturn;
        };

        const guarded: AsyncIterable<unknown> = {
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                if (stopped) {
                  return { done: true, value: undefined };
                }
                return iterator.next();
              },
              return: (value?: unknown) => returnSource(value),
              throw: async (error?: unknown) => {
                stopped = true;
                if (iterator.throw) {
                  return iterator.throw(error);
                }
                throw error;
              },
            };
          },
        };

        // registered before the call starts, per the register-before-work rule (`../fs/wrap.ts`):
        // a cancel racing the very first pull still reaches the source's own return().
        // The caller already got its CancelError, so a rejecting return() is swallowed here
        // instead of surfacing as an unhandled rejection
        handleCancel(() => {
          returnSource().catch(() => undefined);
        });

        resolve(nodeFn.call(this, guarded, ...call.args) as R | PromiseLike<R>);
      },
      { signal: call.callerSignal },
    );
  };
}

/**
 * Walk `items` one at a time, checking cancellation before each step so a cancel takes effect at an
 * item boundary rather than mid-item. No rollback, matching `cancellation-model`'s partial-recursion
 * corner case: whatever `step` already committed for earlier items is left exactly as it is when
 * cancel wins the race.
 *
 * @param step - Per-item work, given the item and its index.
 */
export function checkpointWalkWrapped<TItem, R = unknown>(
  step: (item: TItem, index: number) => R | PromiseLike<R>,
): (items: readonly TItem[]) => CancelablePromise<R[], Unlisted> {
  return function checkpointWalkCall(items: readonly TItem[]): CancelablePromise<R[], Unlisted> {
    return new CancelablePromise<R[], Unlisted>((resolve, _reject, { handleCancel }) => {
      let stopped = false;
      handleCancel(() => {
        stopped = true;
      });

      const run = async (): Promise<R[]> => {
        const results: R[] = [];
        for (let i = 0; i < items.length; i++) {
          if (stopped) {
            break;
          }
          results.push(await step(items[i], i));
        }
        return results;
      };

      resolve(run());
    });
  };
}
