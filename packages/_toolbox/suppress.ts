import { isAbortError, isTimeoutError } from '../_util';
import { construct, IExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { isCancelableLike, isCancelErrorLike, isObjectLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/**
 * Options recognized by {@link suppressFactory}'s product and, through it, its `{ abort: true }`
 * shorthand. Loosely typed (`[key: string]: unknown`) so a package's own richer options bag
 * (bubble, shield, signal, lazy, ...) passes through unchanged; see `IToolboxOptions` in
 * `@cancjs/toolbox` for the cancelable flavor's stronger typing of the same bag.
 */
export interface ISuppressOptions {
  /**
   * Also match an AbortError: a bare DOMException AbortError, or (on the cancelable flavor) a
   * CancelError-shaped rejection whose cause is one. Off by default: only a CancelError-shaped
   * rejection is matched.
   */
  abort?: boolean;
  /**
   * Also match a TimeoutError, the same way `abort` matches an AbortError. Independent of `abort`:
   * each option widens the match for its own kind only.
   */
  timeout?: boolean;
  [key: string]: unknown;
}

function causeNameIs(value: unknown, name: string): boolean {
  const cause = isObjectLike(value) ? (value as { cause?: unknown }).cause : undefined;

  return isObjectLike(cause) && (cause as { name?: unknown }).name === name;
}

/**
 * Whether `reason` is matched by `options`. A CancelError-shaped rejection (any object carrying
 * the CancelError registry brand, from any @cancjs/promise copy, checked structurally so this
 * module needs no dependency on the package itself, see `isCancelErrorLike` in `./guards`) is
 * always matched; an AbortError (bare, or a CancelError-shaped rejection whose cause is one) is
 * matched only under `{ abort: true }`, and a TimeoutError the same way under `{ timeout: true }`.
 * Ported from the same predicate core's suppressCancel/catchCancel use
 * (`canc-promise/src/catch-suppress.ts`) so the two families agree on what counts as a
 * cancellation; the port is deliberate duplication, not an import, because the native toolbox
 * twin built from this module must carry zero runtime dependency on `@cancjs/promise`.
 */
function isCaught(reason: unknown, options: ISuppressOptions | undefined): boolean {
  if (isCancelErrorLike(reason)) {
    return true;
  }

  if (options?.abort && (isAbortError(reason) || causeNameIs(reason, 'AbortError'))) {
    return true;
  }

  if (options?.timeout && (isTimeoutError(reason) || causeNameIs(reason, 'TimeoutError'))) {
    return true;
  }

  return false;
}

function wireCancelInput(ctx: IExecutorCtx | undefined, promise: unknown): void {
  // Inert on the native flavor: a native Promise executor is invoked with no third argument, so
  // ctx is undefined there and this never registers anything - the same degradation every other
  // native-twin toolbox helper already documents. The cancelable flavor propagates an outer
  // cancel down to a cancelable input, same as every other toolbox helper that adopts one.
  if (!ctx) return;

  ctx.handleCancel(() => {
    if (isCancelableLike(promise)) {
      promise.cancel();
    }
  });
}

/**
 * Bind `suppress` to one promise implementation. A matched rejection (see `isCaught`) resolves to
 * `undefined` instead of rejecting; a fulfilled input passes through unchanged; anything unmatched
 * keeps rejecting. This is the toolbox-family name: `@cancjs/promise` ships the unrelated
 * `suppressCancel`/`catchCancel` pair with the same matching logic (cancelable only, zero extra
 * dependency); this pair carries the toolbox name and, via this factory, is available on both the
 * cancelable and native toolbox, so a plain native-Promise consumer can filter a cancellation too.
 * The overlap with core is deliberate, not a duplicate left behind by mistake.
 */
export function suppressFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  return function suppress<T>(promise: T | PromiseLike<T>, options?: ISuppressOptions): TPromiseOf<K, T | void> {
    return construct<T | void, K>(
      deps.Impl,
      (resolve, reject, ctx?: IExecutorCtx) => {
        deps.Impl.resolve(promise).then(
          (value: T) => resolve(value),
          (reason: any) => {
            if (isCaught(reason, options)) {
              resolve(undefined);
            } else {
              reject(reason);
            }
          },
        );

        wireCancelInput(ctx, promise);
      },
      options,
    );
  };
}
