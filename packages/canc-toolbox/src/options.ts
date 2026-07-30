import { ICancelablePromiseOptions } from '@cancjs/promise';

/**
 * Options accepted by every toolbox utility. These canc options (bubble, shield, signal, ...) are
 * forwarded to CancelablePromise construction.
 */
export type IToolboxOptions = ICancelablePromiseOptions;

/**
 * A cancel registration callback, supplied inside the executor context object by
 * CancelablePromise.
 */
export type THandleCancel = (onCancel: () => void) => void;

/**
 * The executor context object shape. Cancelable implementations provide this as the executor's
 * third argument; native Promise provides nothing (undefined).
 */
export interface TExecutorCtx {
  handleCancel: THandleCancel;
  getSignal?: () => any;
}

/**
 * The executor shape toolbox utilities construct against. It widens the native
 * `(resolve, reject)` signature with the CancelablePromise context object.
 */
export type TToolboxExecutor<T> = (
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: any) => void,
  ctx?: TExecutorCtx,
) => void;
