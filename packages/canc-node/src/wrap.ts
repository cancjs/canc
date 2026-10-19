import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../_util';
import { takeCallerSignal, TNodeFn, withCallerSignal } from './signal';

// fs module still has its own copy of this file's contents, a later change re-points it here
// instead of keeping the duplicate.

export type { TNodeFn } from './signal';

/**
 * Wrap a node call with nothing to abort. Cancel rejects the chain and the underlying call runs to
 * completion, which is the same guarantee node itself gives for these. A caller's `signal` in the
 * trailing options bag is lifted onto the promise, so its abort rejects `CancelError`.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 */
export function adopted<R = unknown>(nodeFn: TNodeFn): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  return function adoptedCall(this: unknown, ...args: unknown[]): CancelablePromise<R, Unlisted> {
    const call = takeCallerSignal(args, -1);
    return withCallerSignal<R>(call.callerSignal, false, () => nodeFn.apply(this, call.args) as R | PromiseLike<R>);
  };
}
