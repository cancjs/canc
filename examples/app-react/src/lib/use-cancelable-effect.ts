import { type DependencyList, useEffect } from 'react';
import { type CancelablePromise, isCancPromise, suppressCancel } from '@cancjs/promise';

/**
 * Effect callback that may kick off async work. Return a `CancelablePromise` to have it canceled
 * automatically when the dependencies change or the component unmounts, or return a plain cleanup
 * function (or nothing) for the ordinary `useEffect` contract.
 */
export type CancelableEffectCallback = () => CancelablePromise<unknown> | void | (() => void);

/**
 * `useEffect` for cancelable async work. If the callback returns a `CancelablePromise`, its
 * `cancel()` becomes the effect cleanup, so a dependency change or unmount cancels the in-flight
 * chain (rejecting it with a `CancelError` that regular `try/catch` sees). A returned function is
 * used as cleanup unchanged; anything else is ignored.
 *
 * A superseded or unmount-time cancel is expected, not an error, so the hook suppresses the
 * resulting `CancelError` itself. Callers never need their own `suppressCancel` call.
 *
 * This mirrors the plain `useAsyncEffect` shape one keystroke at a time: the only change is the
 * `isCancPromise` branch that returns `result.cancel` instead of dropping the promise on the floor.
 */
export function useCancelableEffect(callback: CancelableEffectCallback, deps?: DependencyList): void {
 useEffect(() => {
 const result = callback();

 if (isCancPromise(result)) {
 suppressCancel(result);
 return () => {
 result.cancel();
 };
 }

 if (typeof result === 'function') {
 return result;
 }
 }, deps);
}
