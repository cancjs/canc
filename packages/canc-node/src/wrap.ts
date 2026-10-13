import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../_util';

// fs module still has its own copy of this file's contents, a later change re-points it here
// instead of keeping the duplicate.

/**
 * A node call at the wrapping boundary. Node overloads each of these per call site, so a wrapper
 * stays variadic and the binding that uses it keeps node's published signature.
 */
export type TNodeFn = (...args: unknown[]) => unknown;

/**
 * Wrap a node call with nothing to abort. Cancel rejects the chain and the underlying call runs to
 * completion, which is the same guarantee node itself gives for these.
 *
 * @param nodeFn - Underlying node function, called with the receiver of the returned wrapper.
 */
export function adopted<R = unknown>(nodeFn: TNodeFn): (...args: unknown[]) => CancelablePromise<R, Unlisted> {
  return function adoptedCall(this: unknown, ...args: unknown[]): CancelablePromise<R, Unlisted> {
    return new CancelablePromise<R, Unlisted>((resolve) => {
      resolve(nodeFn.apply(this, args) as R | PromiseLike<R>);
    });
  };
}
