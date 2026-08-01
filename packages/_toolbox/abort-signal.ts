import { TExecutor, TExecutorCtx, TPromiseCtor } from './construct';
import { isObjectLike } from './guards';

/**
 * Structural AbortSignal shape, so this module carries no dependency on the ambient DOM/Node
 * AbortSignal type. Matches what `AbortController.prototype.signal` and Node's `AbortSignal` both
 * expose.
 */
export interface IAbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: unknown): void;
  removeEventListener(type: 'abort', listener: () => void, options?: unknown): void;
}

/** The one option this module reads. A helper's real options bag carries plenty more, ignored here. */
export interface IAbortSignalOptions {
  signal?: IAbortSignalLike | IAbortSignalLike[];
}

function readSignals(options: unknown): IAbortSignalLike[] {
  if (!isObjectLike(options)) return [];

  const signal = (options as IAbortSignalOptions).signal;

  if (!signal) return [];

  return Array.isArray(signal) ? signal : [signal];
}

/**
 * Wrap a promise constructor so every promise it builds honors an `options.signal` (a single
 * signal, or an array where the first to abort wins), even though the wrapped constructor itself
 * has no idea what a signal is. That is exactly the native `Promise` constructor's situation: it
 * ignores its second argument entirely, so `delay(1000, { signal })` from the native toolbox
 * otherwise type-checks, does nothing, and the caller cannot tell - the worst failure mode
 * available on a cancellation API.
 *
 * On abort the built promise rejects with the signal's own `reason` - never a CancelError, since
 * the wrapped constructor has no cancellation semantics of its own for this to fake; `isAbortError`
 * then works on the result the same way it does for any other signal-driven code. A pre-aborted
 * signal rejects immediately and the executor never runs, matching a cancelable implementation's
 * own pre-abort short-circuit. The abort listener is attached only while a signal is present and is
 * removed the moment the built promise settles, so a long-lived, reused signal does not accumulate
 * listeners across many calls.
 *
 * A synthesized executor context (`ctx.handleCancel`) is threaded through to the executor whenever
 * a signal is present, so every existing per-helper cleanup already written for the cancelable case
 * (clearing a pending timer, canceling an eagerly-supplied cancelable input) also runs here on
 * abort - no per-helper change needed. What this can never do is stop work already in flight: an
 * attempt already called, a callback already invoked, a promise already mid-resolution. A plain
 * promise built by the wrapped constructor has no way to interrupt that; aborting only ends the
 * WAITING for it, the same characterization the native `timeout` helper's own docs use.
 */
export function withAbortSignal(Ctor: TPromiseCtor): TPromiseCtor {
  function AbortAwareCtor(executor: TExecutor<any>, options?: object) {
    const signals = readSignals(options);

    if (signals.length === 0) {
      return new Ctor(executor, options);
    }

    return new Ctor((resolve, reject) => {
      const preAborted = signals.find((signal) => signal.aborted);

      if (preAborted) {
        // Pre-aborted: the executor never runs, matching a cancelable implementation's own
        // pre-abort short-circuit.
        reject(preAborted.reason);

        return;
      }

      let settled = false;
      const cancelHandlers: Array<(reason?: unknown) => void> = [];
      const listeners: Array<[IAbortSignalLike, () => void]> = [];

      const detachListeners = (): void => {
        for (const [signal, listener] of listeners) {
          signal.removeEventListener('abort', listener);
        }
      };

      const settleOnce = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        detachListeners();
        fn();
      };

      // Threaded through to the executor as its third argument, so any per-helper
      // `ctx.handleCancel(...)` cleanup written for the cancelable case (stop a pending timer,
      // cancel an eager cancelable input) also fires here on abort.
      const ctx: TExecutorCtx = {
        handleCancel: (onCancel: (reason?: unknown) => void) => {
          cancelHandlers.push(onCancel);
        },
      };

      for (const signal of signals) {
        const listener = (): void => {
          settleOnce(() => {
            for (const onCancel of cancelHandlers) onCancel(signal.reason);
            reject(signal.reason);
          });
        };

        signal.addEventListener('abort', listener, { once: true });
        listeners.push([signal, listener]);
      }

      executor(
        (value) => settleOnce(() => resolve(value)),
        (reason?: unknown) => settleOnce(() => reject(reason)),
        ctx,
      );
    }, options);
  }

  (AbortAwareCtor as unknown as { resolve: TPromiseCtor['resolve'] }).resolve = Ctor.resolve.bind(Ctor);

  return AbortAwareCtor as unknown as TPromiseCtor;
}
