import { onScopeDispose, ref, shallowRef, type Ref } from 'vue';
import { type CancelablePromise, isCancelError } from '@cancjs/promise';

export interface UseCancelablePromise<T> {
 /** The resolved value, or `undefined` until the first run settles. */
 data: Ref<T | undefined>;
 /** The rejection reason, unless it was a `CancelError` (a cancel is not an error to show). */
 error: Ref<unknown>;
 /** True while a run is in flight. */
 pending: Ref<boolean>;
 /** Cancels the in-flight run. Called automatically when the owning scope is disposed. */
 cancel: () => void;
}

/**
 * Runs `factory` once and tracks the resulting `CancelablePromise` as reactive state. The chain is
 * canceled automatically when the surrounding effect scope is disposed (component unmount, or an
 * enclosing `effectScope().stop()`), so a pending request never outlives the component that started
 * it. A `CancelError` settles quietly: `pending` clears and `error` stays empty, since a canceled
 * request has no result and no failure to report.
 *
 * The single concern here is "own one cancelable chain and stop it on scope exit". For a chain that
 * should restart when reactive inputs change, drive the factory from `useCancelableWatch` instead.
 */
export function useCancelablePromise<T>(factory: () => CancelablePromise<T>): UseCancelablePromise<T> {
 const data = shallowRef<T>();
 const error = ref<unknown>();
 const pending = ref(false);

 const promise = factory();
 pending.value = true;

 promise.then(
 (value) => {
 data.value = value;
 pending.value = false;
 },
 (reason) => {
 pending.value = false;
 if (!isCancelError(reason)) error.value = reason;
 }
 );

 const cancel = () => promise.cancel();
 onScopeDispose(cancel);

 return { data, error, pending, cancel };
}
