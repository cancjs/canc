import { THandleCancel } from './construct';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
type AbortControllerCtor = new () => { abort(reason?: any): void; signal: unknown };

/** Lazily materialized outbound cancel-signal. Calling `getSignal()` returns the AbortSignal (or
 * `undefined` when `Impl` is not cancelable-shaped). */
export type TGetSignal = () => any;

/**
 * Build a lazy outbound cancel-signal off a promise node's `handleCancel`. The returned `getSignal`
 * thunk constructs the controller only on its first call (via the injected `AbortController` ctor,
 * or the ambient global read at that moment, never at module load) and wires one cancel handler
 * that aborts it with the cancel reason. A callback that never calls `getSignal()` costs nothing:
 * no controller, no listener.
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

  let signal: unknown;
  let built = false;

  return {
    getSignal() {
      if (!built) {
        built = true;
        const Ctor: AbortControllerCtor = AbortControllerCtor || (AbortController as unknown as AbortControllerCtor);
        const controller = new Ctor();
        signal = controller.signal;

        (handleCancel as unknown as (onCancel: (reason?: any) => void) => void)((reason?: any) => {
          controller.abort(normalizeReason ? normalizeReason(reason) : reason);
        });
      }

      return signal;
    },
  };
}
