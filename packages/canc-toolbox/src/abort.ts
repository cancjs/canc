// withSignal has no toolbox options and always returns a plain native promise, so there is no
// resolved Impl to route through; capture the native constructor once at module load instead of
// reading the live global on every call.
const NativePromise = Promise;

/**
 * A plain AbortController convenience: mints a raw controller and returns its signal plus a bound
 * `abort`. No CancelError wiring, this is the native-shaped helper. For a signal that cancels a
 * CancelablePromise with a CancelError, use `createCancelSignal` from `@cancjs/promise`.
 */
export function createAbortSignal(): { signal: AbortSignal; abort: (reason?: unknown) => void } {
  const controller = new AbortController();
  return { signal: controller.signal, abort: controller.abort.bind(controller) };
}

/**
 * Inverse interop: derive an AbortSignal that fires when `promise` cancels (or otherwise rejects).
 * Lets a cancelable operation drive a downstream API that only speaks AbortSignal (fetch, an
 * AbortSignal.any composition, etc). A fulfilled promise never aborts the signal. The returned
 * controller's own `abort()` is also honored, so callers may compose or force-abort it.
 */
export function toAbortSignal(promise: PromiseLike<unknown>): AbortSignal {
  const controller = new AbortController();

  promise.then(
    () => {
      // Fulfilled: nothing to abort.
    },
    (reason) => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
  );

  return controller.signal;
}

/**
 * p-signal-shaped: race `promiseOrFn` against `signal` aborting. A function input receives the
 * signal so it can wire native cancellation, then its result is raced. When `signal` is `undefined`
 * the value passes through unraced (optional-cancellation signatures: callers thread an optional
 * signal without branching). Aborting rejects with the signal's abort reason (a DOMException
 * AbortError); an already-aborted signal rejects immediately.
 */
export function withSignal<T>(
  signal: AbortSignal | undefined,
  promiseOrFn: ((signal?: AbortSignal) => T | PromiseLike<T>) | T | PromiseLike<T>,
): Promise<T> {
  const source: T | PromiseLike<T> =
    typeof promiseOrFn === 'function' ?
      (promiseOrFn as (signal?: AbortSignal) => T | PromiseLike<T>)(signal)
    : promiseOrFn;

  // No signal: pass the value straight through so optional-cancellation call sites need no branch.
  if (signal === undefined) {
    return NativePromise.resolve(source);
  }

  return new NativePromise<T>((resolve, reject) => {
    // A signal's abort reason is a DOMException AbortError (an Error) at runtime.
    const abortReason = () => signal.reason as Error;

    if (signal.aborted) {
      reject(abortReason());
      return;
    }

    const onAbort = () => reject(abortReason());
    signal.addEventListener('abort', onAbort, { once: true });

    NativePromise.resolve(source).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', onAbort);
        // Re-propagate the source's own rejection reason unchanged.
        reject(reason as Error);
      },
    );
  });
}
