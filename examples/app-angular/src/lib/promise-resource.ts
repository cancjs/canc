/** Settlement state of the latest run. `idle` also covers a run that was dropped as stale. */
export type ResourceStatus = 'idle' | 'pending' | 'fulfilled' | 'rejected';

/**
 * Plain-promise twin of `CancelableResource`. It can drop a stale response, which is all a plain
 * promise allows: the superseded request still runs to completion, and so does the one left in
 * flight when the component is destroyed. The request-id compare below is the workaround every
 * codebase writes once per component.
 */
export class PromiseResource<T> {
  status: ResourceStatus = 'idle';
  value: T | undefined;
  error: unknown;

  // (no cancel counterpart, see cancelable-resource.ts) A destroyed component leaves its last
  // request running; nothing reads the fields afterwards, so the result is simply wasted work.
  private requestId = 0;

  /** Starts tracking a load. The one it supersedes keeps running, its result is discarded. */
  run(promise: Promise<T>): void {
    const id = this.invalidate();
    this.status = 'pending';
    this.value = undefined;
    this.error = undefined;

    promise.then(
      (value) => {
        if (this.requestId !== id) return;
        this.status = 'fulfilled';
        this.value = value;
      },
      (reason: unknown) => {
        if (this.requestId !== id) return;
        this.status = 'rejected';
        this.error = reason;
      },
    );
  }

  /** Drops the pending load's result, if any, and clears the state. */
  reset(): void {
    this.invalidate();
    this.status = 'idle';
    this.value = undefined;
    this.error = undefined;
  }

  private invalidate(): number {
    // Only the response is dropped here; the request behind it cannot be stopped.
    return ++this.requestId;
  }
}

/** Creates a resource. Kept as a factory so both flavors read the same at the call site. */
export function promiseResource<T>(): PromiseResource<T> {
  return new PromiseResource<T>();
}
