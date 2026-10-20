import { THandleCancel } from './construct';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
type AbortControllerCtor = new () => { abort(reason?: any): void; signal: unknown };

/** Lazily materialized outbound cancel-signal. Calling `getSignal()` returns the AbortSignal (or
 * `undefined` when `Impl` is not cancelable-shaped). */
export type TGetSignal = () => any;

/**
 * Build a lazy outbound cancel-signal off a promise node's `handleCancel`. The returned `getSignal`
 * thunk constructs the controller only on its first call (via the injected `AbortController` ctor,
 * or the ambient global read at that moment, never at module load). A cancel handler is wired up
 * front, so a first call after the node was canceled returns an already aborted signal. A callback
 * that never calls `getSignal()` constructs no controller.
 *
 * `normalizeReason` lets a cancelable consumer brand the abort reason (e.g. wrap it in a
 * CancelError) while the plain/native path passes the reason through raw (the default).
 */
export function makeCancelSignal(
  handleCancel: THandleCancel | undefined,
  AbortControllerCtor?: AbortControllerCtor,
  normalizeReason?: (reason?: any) => any,
): { getSignal: TGetSignal } {
  // No-cancel path: nothing to hand out, and nothing to wire.
  if (typeof handleCancel !== 'function') {
    return { getSignal: () => undefined };
  }

  let controller: InstanceType<AbortControllerCtor> | undefined;
  let canceled = false;
  let cancelReason: unknown;

  const abort = (ac: InstanceType<AbortControllerCtor>) => {
    ac.abort(normalizeReason ? normalizeReason(cancelReason) : cancelReason);
  };

  handleCancel((reason?: any) => {
    canceled = true;
    cancelReason = reason;
    if (controller) {
      abort(controller);
    }
  });

  return {
    getSignal() {
      if (!controller) {
        const Ctor: AbortControllerCtor = AbortControllerCtor || (AbortController as unknown as AbortControllerCtor);
        controller = new Ctor();
        if (canceled) {
          abort(controller);
        }
      }

      return controller.signal;
    },
  };
}
