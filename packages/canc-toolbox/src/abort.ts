import { CancelablePromise, ICancelable, isCancelError } from '@cancjs/promise';

import { IToolboxOptions, TExecutorCtx } from './options';

// AbortSignal.any (ES2024 / Node 20.3+) exists at runtime in every supported target but is not
// declared by the ambient AbortSignal typing this workspace resolves. Reference it through a narrow
// typed view instead of augmenting the platform type.
const abortSignalAny = (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any;

// withSignal has no toolbox options and always returns a plain native promise, so there is no
// resolved Impl to route through; capture the native constructor once at module load instead of
// reading the live global on every call.
const NativePromise = Promise;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * An error shaped like a DOM AbortError. Rejected/thrown when an operation is aborted. Matches the
 * `name` of the DOMException a real AbortSignal produces so the same code path handles both.
 */
export class AbortError extends Error {
  override readonly name = 'AbortError';
  constructor(message = 'The operation was aborted') {
    super(message);
  }
}

/**
 * Whether `error` is an AbortError (a bare DOMException AbortError or the AbortError class above),
 * detected by `name`. A CancelError is not an AbortError even when it carries an abort as its cause.
 */
export function isAbortError(error: unknown): error is { name: 'AbortError' } {
  return isObject(error) && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * Options recognized by {@link suppress}.
 */
export interface ISuppressOptions extends IToolboxOptions {
  /**
   * Also swallow an AbortError, whether it surfaced as a bare DOMException AbortError or as a
   * CancelError whose abort drove the cancellation. Off by default: only a CancelError is swallowed.
   */
  abort?: boolean;
}

/**
 * Whether `reason` should be swallowed. A CancelError is always caught; an AbortError (bare, or a
 * CancelError whose `aborted` getter is true) is caught only when `abort` is set.
 */
function isSuppressed(reason: unknown, abort: boolean | undefined): boolean {
  if (isCancelError(reason)) {
    return true;
  }

  return Boolean(abort && isAbortError(reason));
}

/**
 * Swallow a cancellation of `promise` and resolve to `undefined` instead, rethrowing anything else.
 * By default only a CancelError is swallowed; pass `{ abort: true }` to also swallow an AbortError.
 * Resolves to the fulfilled value when the promise settles normally. The returned promise is built
 * through the resolved implementation, so it is cancelable by default.
 */
export function suppress<T>(promise: T | PromiseLike<T>, options?: ISuppressOptions): Promise<T | void> {
  const abort = options?.abort;

  return new CancelablePromise<T | void>((resolve, reject, ctx?: TExecutorCtx) => {
    CancelablePromise.resolve(promise).then(
      (value) => resolve(value),
      (reason) => {
        if (isSuppressed(reason, abort)) {
          resolve(undefined);
        } else {
          reject(reason);
        }
      },
    );

    if (ctx) {
      ctx.handleCancel(() => {
        if (isCancelable(promise)) {
          (promise as ICancelable).cancel();
        }
      });
    }
  }, options);
}

/**
 * Swallow both AbortError and CancelError rejections and rethrow everything else. Shorthand for
 * `suppress(promise, { abort: true })`.
 */
export function suppressAbort<T>(promise: T | PromiseLike<T>, options?: IToolboxOptions): Promise<T | void> {
  return suppress(promise, { ...options, abort: true });
}

function isCancelable(value: unknown): value is ICancelable {
  return isObject(value) && typeof (value as { cancel?: unknown }).cancel === 'function';
}

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
 * Reject with the external signal's abort reason if it aborts first, otherwise reject with an
 * AbortError once `ms` elapses, otherwise adopt the underlying promise's settlement. Combines an
 * externally supplied `signal` (fetch-style cancellation) with a timeout in one race and composes
 * them via AbortSignal.any so a single abort listener drives cancellation. The underlying promise is
 * canceled (if cancelable) when either the signal or the timeout wins, leaving no detached work.
 */
export function interopTimeout<T>(
  promise: T | PromiseLike<T>,
  ms: number,
  signal?: AbortSignal,
  options?: IToolboxOptions,
): Promise<T> {
  return new CancelablePromise<T>((resolve, reject, ctx?: TExecutorCtx) => {
    const timeoutSignal = AbortSignal.timeout(ms);
    // Compose the external signal (if any) with the timeout so one listener covers both. When
    // no external signal is supplied, race against the timeout alone.
    const combined = signal ? abortSignalAny([signal, timeoutSignal]) : timeoutSignal;

    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (isCancelable(promise)) {
        (promise as ICancelable).cancel(combined.reason);
      }
      reject(combined.reason);
    };

    if (combined.aborted) {
      onAbort();
      return;
    }

    combined.addEventListener('abort', onAbort, { once: true });

    CancelablePromise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        combined.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (reason) => {
        if (settled) return;
        settled = true;
        combined.removeEventListener('abort', onAbort);
        reject(reason);
      },
    );

    if (ctx) {
      ctx.handleCancel(() => {
        settled = true;
        combined.removeEventListener('abort', onAbort);
        if (isCancelable(promise)) {
          (promise as ICancelable).cancel();
        }
      });
    }
  }, options);
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
