import { toAbortSignal } from '@cancjs/toolbox';

import { ISchedulerDeps, resolveScheduler } from './deps';
import { ITaskSignal, TTaskPriority } from './types';

/** Default band of the platform scheduler, used wherever a caller states no preference. */
export const DEFAULT_PRIORITY: TTaskPriority = 'user-visible';

/** Anything a lifetime can be taken from: a promise, an abort signal, or several of either. */
export type TTaskSignalSource = PromiseLike<unknown> | AbortSignal | Array<PromiseLike<unknown> | AbortSignal>;

/** Options for `createTaskSignal`. */
export type ICreateTaskSignalOptions = ISchedulerDeps & {
  /** Band the signal reports, and the band of every task governed by it. */
  priority?: TTaskPriority;
};

/** A minted task signal together with the function that aborts it. */
export interface ITaskSignalHandle {
  signal: ITaskSignal;
  abort(reason?: unknown): void;
  /** The band that was requested. Without a scheduler this is all the priority there is. */
  priority: TTaskPriority;
}

/** Options for `toTaskSignal`. */
export type IToTaskSignalOptions = ISchedulerDeps & {
  /**
   * Either a fixed band, or a live task signal to take the band from. A live source keeps the
   * derived signal in step with a task that is reprioritized later.
   */
  priority?: TTaskPriority | ITaskSignal;
};

/**
 * Mint a signal that governs a task's priority as well as its lifetime. With a scheduler present
 * this is a real task controller, so `setPriority` on it reorders tasks that are already queued.
 * Without one it is a plain abort signal carrying the requested band as a read-only property, and
 * the band is a documented no-op that still reports what was asked for.
 */
export function createTaskSignal(options?: ICreateTaskSignalOptions): ITaskSignalHandle {
  const priority = options?.priority ?? DEFAULT_PRIORITY;
  const pair = resolveScheduler(options);

  if (pair) {
    const controller = new pair.TaskController({ priority });

    return { signal: controller.signal, abort: (reason?: unknown) => controller.abort(reason), priority };
  }

  // Minting a raw controller is the point of this function: it is the lowest level of the signal
  // interop, and everything above it consumes what this returns.
  const controller = new AbortController();

  return {
    signal: withPriority(controller.signal, priority),
    abort: (reason?: unknown) => controller.abort(reason),
    priority,
  };
}

/**
 * Lift a lifetime into a signal a task can be posted with. A cancelable promise contributes its
 * cancellation, taken through the cancel handler rather than through `then`, so deriving a signal
 * never counts as consuming the promise and never suppresses its own propagation. An ordinary
 * rejection of a cancelable promise does not abort the signal; for a plain thenable, which has no
 * cancellation to tell apart from a rejection, any rejection does.
 *
 * The result carries a priority only where the platform can compose one. Everywhere else it is a
 * plain abort signal, which every `postTask` accepts, with the priority left to the call site.
 */
export function toTaskSignal(source: TTaskSignalSource, options?: IToTaskSignalOptions): ITaskSignal | AbortSignal {
  const sources = Array.isArray(source) ? source : [source];
  const signals = sources.map(asAbortSignal);
  const composeTaskSignal = getTaskSignalAny();

  if (composeTaskSignal) {
    return options?.priority === undefined ?
        composeTaskSignal(signals)
      : composeTaskSignal(signals, { priority: options.priority });
  }

  return signals.length === 1 ? signals[0] : composeAbortSignals(signals);
}

function asAbortSignal(source: PromiseLike<unknown> | AbortSignal): AbortSignal {
  return typeof (source as PromiseLike<unknown>).then === 'function' ?
      toAbortSignal(source as PromiseLike<unknown>)
    : (source as AbortSignal);
}

/**
 * Composition of the platform's task signals, absent before Chrome 116 and missing from the
 * community polyfill entirely, which is why nothing in this library depends on it.
 */
type TTaskSignalAny = (signals: AbortSignal[], options?: { priority?: TTaskPriority | ITaskSignal }) => ITaskSignal;

function getTaskSignalAny(): TTaskSignalAny | undefined {
  const ambient = globalThis as { TaskSignal?: { any?: TTaskSignalAny } };
  const compose = ambient.TaskSignal?.any;

  return compose ? compose.bind(ambient.TaskSignal) : undefined;
}

function composeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const nativeAny = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;

  if (nativeAny) {
    return nativeAny.call(AbortSignal, signals);
  }

  const controller = new AbortController();
  // Attach listeners through a cleanup-capable AbortController's signal so the platform
  // removes them when the controller aborts. Without this fallback, listeners accumulate
  // on source signals that outlive the composed result.
  const cleanupSignal = new AbortController();

  const forward = (aborted: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(aborted.reason);
    }
  };

  for (const signal of signals) {
    if (signal.aborted) {
      forward(signal);
      break;
    }

    signal.addEventListener('abort', () => forward(signal), { signal: cleanupSignal.signal });
  }

  // When the composed signal aborts, abort the cleanup signal to remove all listeners
  controller.signal.addEventListener('abort', () => cleanupSignal.abort());

  return controller.signal;
}

function withPriority(signal: AbortSignal, priority: TTaskPriority): ITaskSignal {
  Object.defineProperty(signal, 'priority', { get: () => priority, configurable: true });

  return signal as ITaskSignal;
}
