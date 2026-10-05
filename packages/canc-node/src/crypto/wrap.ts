import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, TPromiseCtor } from '../../../_toolbox';
import { promisifyFactory } from '../../../_toolbox/promisify';

export { gated as gatedWrapped } from '../gate';

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
 * Same ladder as `../fs/wrap.ts` (not yet shared, see that file's header note). Six rungs is a cap,
 * not a fact about node: a function publishing more overloads than that keeps only its last six as
 * far as this ladder is concerned, which is why `generateKeyPair` (40 overloads across eight key
 * types) is typed by hand in `./key-pair.ts` instead of through here.
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
 * Promisify bound to CancelablePromise. Crypto has no signal support to forward (fact base:
 * `signal: 0` across the whole module), so unlike `../fs/wrap.ts` this stays a plain promisify
 * with nothing signal-aware layered on top.
 */
export const promisifyWrapped = promisifyFactory(toolboxDeps);
