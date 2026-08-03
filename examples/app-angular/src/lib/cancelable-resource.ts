import { DestroyRef, inject } from '@angular/core';
import { type CancelablePromise, isCancelError } from '@cancjs/promise';

/** Settlement state of the latest run. `idle` also covers a run that was canceled. */
export type ResourceStatus = 'idle' | 'pending' | 'fulfilled' | 'rejected';

/**
 * Holds the latest cancelable load for a component: its state for the template, and the cancel
 * wiring a component would otherwise hand-roll. Latest wins, so a superseded response can never
 * overwrite fresher data, and the superseded request is canceled rather than left running.
 *
 * Angular 19 ships a `resource()` primitive with the same vocabulary (`value`, `error`, `status`).
 * This is the same idea for an app on an earlier version, backed by a cancelable promise.
 */
export class CancelableResource<T> {
  status: ResourceStatus = 'idle';
  value: T | undefined;
  error: unknown;

  private pending: CancelablePromise<T> | undefined;

  constructor(destroyRef: DestroyRef) {
    // Destroy cancels whatever is still in flight, which aborts its request.
    destroyRef.onDestroy(() => this.reset());
  }

  /** Starts tracking a load, canceling the one it supersedes. */
  run(promise: CancelablePromise<T>): void {
    this.cancelPending();
    this.pending = promise;
    this.status = 'pending';
    this.value = undefined;
    this.error = undefined;

    promise.then(
      (value) => {
        if (this.pending !== promise) return;
        this.pending = undefined;
        this.status = 'fulfilled';
        this.value = value;
      },
      (reason: unknown) => {
        if (this.pending !== promise) return;
        this.pending = undefined;
        // A canceled run has no result to show, so it goes back to idle instead of surfacing.
        this.status = isCancelError(reason) ? 'idle' : 'rejected';
        this.error = isCancelError(reason) ? undefined : reason;
      },
    );
  }

  /** Cancels the pending load, if any, and clears the state. */
  reset(): void {
    this.cancelPending();
    this.status = 'idle';
    this.value = undefined;
    this.error = undefined;
  }

  private cancelPending(): void {
    const pending = this.pending;
    // Cleared first, so the cancel rejection lands on a run this resource no longer tracks.
    this.pending = undefined;
    pending?.cancel();
  }
}

/** Creates a resource bound to the current component's lifetime. Call it in an injection context. */
export function cancelableResource<T>(): CancelableResource<T> {
  return new CancelableResource<T>(inject(DestroyRef));
}
