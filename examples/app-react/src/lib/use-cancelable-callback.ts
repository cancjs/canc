import { CancelablePromise, isCancelError, type TCancelReason } from '@cancjs/promise';
import { CANCEL_REASON_SUPERSEDED, CANCEL_REASON_UNMOUNTED } from '@shared/util';
import { useCallback, useRef, useState } from 'react';

/**
 * `cancelPrevious: false` behavior: a call made while one is already pending is REJECTED
 * immediately, leaving the in-flight run untouched (queuing was the other option considered;
 * rejection was chosen so a caller sees the conflict at the call site instead of a silent
 * backlog building up behind an event handler).
 */
export interface UseCancelableCallbackOptions {
  /**
   * `true` (default) cancels a previous still-pending run and starts the new one, latest wins.
   * `false` rejects the new call instead of touching the pending one, see file header.
   */
  cancelPrevious?: boolean;
}

/**
 * Wraps a factory that starts a cancelable chain into an imperative call for event handlers
 * (a click, a keystroke), rather than a dependency array. `pending` reflects whether a call is
 * currently in flight, derived from its own settlement, never a timer. `cancelPending` cancels
 * the in-flight call; its default reason is "unmounted" (the common wiring is an unmount
 * cleanup) and accepts an override for other call sites.
 *
 * A superseded or unmount-time cancel is expected, not an error, so the hook swallows the
 * resulting `CancelError` itself. Any other rejection is escalated to the nearest React error
 * boundary by throwing from a state update, matching `useCancelableEffect`. This prevents
 * fire-and-forget `void run()` calls from silently dropping unexpected failures.
 */
export function useCancelableCallback<TArgs extends unknown[], TResult>(
  factory: (...args: TArgs) => CancelablePromise<TResult>,
  options: UseCancelableCallbackOptions = {},
): {
  run: (...args: TArgs) => CancelablePromise<TResult>;
  cancelPending: (reason?: TCancelReason) => void;
  pending: boolean;
} {
  const { cancelPrevious = true } = options;
  const pendingRun = useRef<CancelablePromise<TResult> | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [, escalateToErrorBoundary] = useState<undefined>();

  const cancelPending = useCallback((reason: TCancelReason = CANCEL_REASON_UNMOUNTED) => {
    pendingRun.current?.cancel(reason);
    pendingRun.current = undefined;
    setPending(false);
  }, []);

  const run = useCallback(
    (...args: TArgs) => {
      if (pendingRun.current) {
        if (!cancelPrevious) {
          // Explicit TFailure=unknown collapses the reject overload back to the same undeclared
          // (never) failure type factory() itself carries, so this branch and the happy path
          // below return the same CancelablePromise<TResult> shape.
          const rejected = CancelablePromise.reject<TResult, unknown>(
            new Error('useCancelableCallback: a call is already pending (cancelPrevious is false)'),
          );
          rejected.then(undefined, (error: unknown) => {
            if (isCancelError(error)) return;
            escalateToErrorBoundary(() => {
              throw error;
            });
          });
          return rejected;
        }
        pendingRun.current.cancel(CANCEL_REASON_SUPERSEDED);
      }

      const promise = factory(...args);
      pendingRun.current = promise;
      setPending(true);

      // Settlement is the only source of truth for "pending"; a superseding run reassigns
      // pendingRun.current first, so this no-ops for the run it replaced.
      const clearIfCurrent = (): void => {
        if (pendingRun.current === promise) {
          pendingRun.current = undefined;
          setPending(false);
        }
      };
      promise.then(clearIfCurrent, (error: unknown) => {
        clearIfCurrent();
        if (isCancelError(error)) return;
        escalateToErrorBoundary(() => {
          throw error;
        });
      });

      return promise;
    },
    [factory, cancelPrevious],
  );

  return { run, cancelPending, pending };
}
