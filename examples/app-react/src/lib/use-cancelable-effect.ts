import * as canc from '@cancjs/coroutine';
import { type CancelablePromise, isCancelError, isCancPromise, type TCancelReason } from '@cancjs/promise';
import { CANCEL_REASON_DEPS_CHANGED, CANCEL_REASON_UNMOUNTED } from '@shared/util';
import { type DependencyList, useEffect, useRef, useState } from 'react';

/**
 * Effect callback returning a promise, cleanup function, or nothing. Return a `CancelablePromise`
 * to have it canceled automatically when dependencies change or the component unmounts.
 */
export type CancelableEffectCallback = () => CancelablePromise<unknown> | void | (() => void);

/**
 * Generator effect callback. A bare generator function passed to `useCancelableEffect` is wrapped
 * as a coroutine and canceled automatically when dependencies change or the component unmounts.
 */
export type CancelableGeneratorEffectCallback = () => canc.TGeneratorLike<unknown, unknown, any>;

function isGeneratorFunction(value: unknown): value is CancelableGeneratorEffectCallback {
  if (typeof value !== 'function') return false;
  return Object.prototype.toString.call(value) === '[object GeneratorFunction]';
}

/**
 * `useEffect` overload for a bare generator function. Wraps the generator with `canc.async`,
 * running it as a cancelable coroutine and canceling it when dependencies change or the
 * component unmounts.
 */
export function useCancelableEffect(generator: CancelableGeneratorEffectCallback, deps?: DependencyList): void;

/**
 * `useEffect` for cancelable async work. If the callback returns a `CancelablePromise`, its
 * `cancel()` becomes the effect cleanup, so a dependency change or unmount cancels the in-flight
 * chain (rejecting it with a `CancelError` that regular `try/catch` sees). A returned function is
 * used as cleanup unchanged; anything else is ignored.
 *
 * A superseded or unmount-time cancel is expected, not an error, so the hook swallows the
 * resulting `CancelError` itself. Callers never need their own cancel handling for it. The cancel
 * carries "unmounted" or "deps-changed" (the exported reason constants) so a consumer catching
 * the `CancelError` can branch on `error.reason`.
 *
 * This effect has no return channel for its promise's settlement (unlike `usePromiseState`,
 * there is no render state to read), so any OTHER rejection is escalated to the nearest React
 * error boundary instead of being dropped: it is thrown from a state update, which is the
 * supported way to hand an async error to `componentDidCatch`/`getDerivedStateFromError` since
 * effects are not one of the places a boundary looks by itself. Wrap a tree using this hook in an
 * error boundary if the effect's work can fail for a reason other than being canceled.
 *
 * This mirrors the plain `useAsyncEffect` shape one keystroke at a time: the only change is the
 * `isCancPromise` branch that returns `result.cancel` instead of dropping the promise on the floor.
 */
export function useCancelableEffect(callback: CancelableEffectCallback, deps?: DependencyList): void;

export function useCancelableEffect(
  callbackOrGenerator: CancelableEffectCallback | CancelableGeneratorEffectCallback,
  deps?: DependencyList,
): void {
  // cleanup here fires only at true unmount, empty deps never re-run it
  // React tears effects down in registration order, so this flips before the effect below's own
  // cleanup runs at unmount, letting that cleanup tell "unmounting" apart from "deps changed"
  const unmounting = useRef(false);
  useEffect(
    () => () => {
      unmounting.current = true;
    },
    [],
  );

  // Unused slot: calling this setter with an updater that throws makes the next render throw,
  // which is what lets a rejection from outside React's call stack reach a boundary at all.
  const [, escalateToErrorBoundary] = useState<undefined>();

  useEffect(() => {
    const cleanupReason = (): TCancelReason =>
      unmounting.current ? CANCEL_REASON_UNMOUNTED : CANCEL_REASON_DEPS_CHANGED;

    const swallowCancelEscalateRest = (error: unknown): void => {
      if (isCancelError(error)) return;
      escalateToErrorBoundary(() => {
        throw error;
      });
    };

    if (isGeneratorFunction(callbackOrGenerator)) {
      const promise = canc.async(callbackOrGenerator as any)();
      promise.then(undefined, swallowCancelEscalateRest);
      return () => {
        promise.cancel(cleanupReason());
      };
    }

    const result = callbackOrGenerator();

    if (isCancPromise(result)) {
      result.then(undefined, swallowCancelEscalateRest);
      return () => {
        result.cancel(cleanupReason());
      };
    }

    if (typeof result === 'function') {
      return result;
    }
  }, deps);
}
