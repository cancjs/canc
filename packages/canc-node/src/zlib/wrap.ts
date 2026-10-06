import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, TPromiseCtor } from '../../../_toolbox';
import { promisifyFactory } from '../../../_toolbox/promisify';
import { NotImplementedError } from '../errors/classes';
import { gated } from '../gate';

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
  if (!available) {
    return class {
      constructor(..._args: any[]) {
        throw new NotImplementedError(`${feature} requires Node >= ${required}`, {
          feature,
          required,
        });
      }
    } as unknown as TCtor;
  }

  let cached: TCtor | undefined;
  return new Proxy(function () {} as unknown as TCtor, {
    construct(_target, args, newTarget) {
      if (cached === undefined) cached = factory();
      return Reflect.construct(cached, args, newTarget === _target ? cached : newTarget);
    },
    get(_target, prop, receiver) {
      if (cached === undefined) cached = factory();
      return Reflect.get(cached, prop, receiver === _target ? cached : receiver);
    },
    set(_target, prop, value, receiver) {
      if (cached === undefined) cached = factory();
      return Reflect.set(cached, prop, value, receiver === _target ? cached : receiver);
    },
    apply(_target, thisArg, args) {
      if (cached === undefined) cached = factory();
      return Reflect.apply(cached as unknown as (...args: unknown[]) => unknown, thisArg, args);
    },
    getPrototypeOf(_target) {
      if (cached === undefined) cached = factory();
      return Reflect.getPrototypeOf(cached);
    },
    setPrototypeOf(_target, proto) {
      if (cached === undefined) cached = factory();
      return Reflect.setPrototypeOf(cached, proto);
    },
    ownKeys(_target) {
      if (cached === undefined) cached = factory();
      return Reflect.ownKeys(cached);
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (cached === undefined) cached = factory();
      return Reflect.getOwnPropertyDescriptor(cached, prop);
    },
    has(_target, prop) {
      if (cached === undefined) cached = factory();
      return Reflect.has(cached, prop);
    },
  });
}

/**
 * A node call at the wrapping boundary. Node overloads each of these per call site, so a wrapper
 * stays variadic and the binding that uses it keeps node's published signature.
 */
export type TNodeFn = (...args: unknown[]) => unknown;

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
  promise: CancelablePromise<this['value']>;
  options: object;
}

/** One dependency bag for every toolbox algorithm this package builds on. */
export const toolboxDeps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

/**
 * Promisify bound to CancelablePromise. zlib has no signal support to forward (fact base: `signal: 0`
 * across the whole module, same as `../crypto`), so this stays a plain promisify with nothing
 * signal-aware layered on top.
 */
export const promisifyWrapped = promisifyFactory(toolboxDeps);

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
): (source: AsyncIterable<unknown> | Iterable<unknown>, ...rest: unknown[]) => CancelablePromise<R> {
  return function iterableCodecCall(
    this: unknown,
    source: AsyncIterable<unknown> | Iterable<unknown>,
    ...rest: unknown[]
  ): CancelablePromise<R> {
    return new CancelablePromise<R>((resolve, _reject, { handleCancel }) => {
      const iterator = sourceIterator(source);
      let stopped = false;

      const guarded: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              if (stopped) {
                return { done: true, value: undefined };
              }
              return iterator.next();
            },
          };
        },
      };

      // registered before the call starts, per the register-before-work rule (`../fs/wrap.ts`):
      // a cancel racing the very first pull still reaches the source's own return()
      handleCancel(() => {
        stopped = true;
        void iterator.return?.(undefined);
      });

      resolve(nodeFn.call(this, guarded, ...rest) as R | PromiseLike<R>);
    });
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
): (items: readonly TItem[]) => CancelablePromise<R[]> {
  return function checkpointWalkCall(items: readonly TItem[]): CancelablePromise<R[]> {
    return new CancelablePromise<R[]>((resolve, _reject, { handleCancel }) => {
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
