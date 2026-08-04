import { _TimeoutError, CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IToolboxDeps, TPromiseCtor } from '../../_toolbox';
import { IToolboxOptions } from './options';

/**
 * The promise flavor every helper in this package is bound to. Naming it once here is what makes
 * `delay(100)` type as a CancelablePromise the caller can `.cancel()`, and what makes every helper
 * accept the canc options, without a wrapper or a cast per helper.
 */
export interface ICancelableKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: IToolboxOptions;
}

/**
 * The one dependency bag this package binds the shared factories with, built once at module load.
 * Timers are left out on purpose so the helpers schedule against the ambient ones.
 *
 * The cast is the single place stating that CancelablePromise satisfies the minimal constructor
 * shape the factories need; TypeScript cannot see that across the package boundary on its own.
 */
export const deps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  // CancelablePromise products expose `cancel` and pass a `handleCancel`-bearing ctx into every
  // executor, which is what lets a `{ lazy: true }` deferred wrapper built from this deps object
  // cancel before its first subscription and not just after.
  cancelable: true,
  TimeoutError: _TimeoutError,
};
