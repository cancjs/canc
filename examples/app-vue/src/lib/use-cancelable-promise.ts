import { type CancelablePromise, isCancelError } from '@cancjs/promise';
import { onScopeDispose, type Ref, ref, shallowRef } from 'vue';

export type PromiseStatus = 'idle' | 'pending' | 'resolved' | 'rejected';

export interface UseCancelablePromise<T> {
  /** The resolved value, or `undefined` until the first run settles. */
  data: Ref<T | undefined>;
  /** The rejection reason, unless it was a `CancelError` (a cancel is not an error to show). */
  error: Ref<unknown>;
  /** True while a run is in flight. */
  pending: Ref<boolean>;
  /** Settlement status of the cancelable promise. */
  status: Ref<PromiseStatus>;
  /** Cancels the in-flight run. Called automatically when the owning scope is disposed. */
  cancel: () => void;
}

/**
 * Runs `source` once and tracks the resulting `CancelablePromise` as reactive state. The chain is
 * canceled automatically when the surrounding effect scope is disposed (component unmount, or an
 * enclosing `effectScope().stop()`), so a pending request never outlives the component that started
 * it. A `CancelError` settles quietly: `status` resets to `idle`, `data` clears, `pending` clears,
 * and `error` stays empty, since a canceled request has no result and no failure to report.
 *
 * `source` is either an already-started `CancelablePromise` or a factory that returns one. The
 * factory form is preferred: it defers starting the chain until this composable runs, so the request
 * begins on setup rather than whenever the caller happened to construct it.
 *
 * The single concern here is "own one cancelable chain and stop it on scope exit". For a chain that
 * should restart when reactive inputs change, drive the factory from `useCancelableWatch` instead.
 *
 * A non-cancel rejection stays local to `error` here rather than reaching `onErrorCaptured` /
 * `app.config.errorHandler` the way `useCancelableWatch` does: this composable's `.then()` is
 * attached at setup time but settles later, detached from any watcher or `setup()` Vue itself is
 * awaiting, so there is no call left to return a rejecting promise through.
 */
export function useCancelablePromise<T>(
  source: CancelablePromise<T> | (() => CancelablePromise<T>),
): UseCancelablePromise<T> {
  const data = shallowRef<T>();
  const error = ref<unknown>();
  const pending = ref(false);
  const status = ref<PromiseStatus>('idle');

  const promise = typeof source === 'function' ? source() : source;
  pending.value = true;
  status.value = 'pending';

  promise.then(
    (value) => {
      data.value = value;
      error.value = undefined;
      pending.value = false;
      status.value = 'resolved';
    },
    (reason) => {
      pending.value = false;
      if (isCancelError(reason)) {
        status.value = 'idle';
        data.value = undefined;
        error.value = undefined;
        return;
      }
      status.value = 'rejected';
      error.value = reason;
      data.value = undefined;
    },
  );

  const cancel = () => promise.cancel();
  onScopeDispose(cancel);

  return { data, error, pending, status, cancel };
}
