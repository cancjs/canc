import { ISchedulerImpl, ISchedulerPair, ITimers, TTaskControllerCtor } from './types';

/**
 * A scheduler override: the whole implementation, or neither half of it. Half a pair is rejected
 * at compile time because a polyfill's `postTask` and a native `TaskController` do not understand
 * each other's signals, and the resulting task would simply never be abortable.
 */
export type TSchedulerOverride = ISchedulerPair | { scheduler?: undefined; TaskController?: undefined };

/**
 * A timers override: the whole pair, or neither function. Mixing one source's `setTimeout` with
 * another's `clearTimeout` leaks the timer it believes it cleared, since the handle one produced
 * means nothing to the other.
 */
export type TTimersOverride = ITimers | { setTimeout?: undefined; clearTimeout?: undefined };

/**
 * Every dependency this library takes, flat and overridable per call. A call's value wins over
 * whatever a factory was built with, and the ambient objects are the last resort. Nothing is read
 * at module load: a consumer that installs a scheduler polyfill or a fake clock after import still
 * gets picked up.
 */
export type ISchedulerDeps = TSchedulerOverride & TTimersOverride;

/**
 * Reads the ambient `scheduler` and `TaskController` together, behind one narrow cast, and returns
 * undefined unless both are present. Safari and node have neither; Chrome has both from version 94.
 */
export function getAmbientScheduler(): ISchedulerPair | undefined {
  const ambient = globalThis as { scheduler?: ISchedulerImpl; TaskController?: TTaskControllerCtor };

  if (!ambient.scheduler || !ambient.TaskController) {
    return undefined;
  }

  return { scheduler: ambient.scheduler, TaskController: ambient.TaskController };
}

/**
 * Resolve one whole scheduler, the call's before the factory's before the ambient one. Returning
 * undefined says no scheduler exists anywhere, which is the signal to degrade to timers.
 */
export function resolveScheduler(call?: TSchedulerOverride, factory?: TSchedulerOverride): ISchedulerPair | undefined {
  if (isSchedulerPair(call)) {
    return call;
  }

  if (isSchedulerPair(factory)) {
    return factory;
  }

  return getAmbientScheduler();
}

/**
 * Resolve one whole timers pair, the call's before the factory's before the ambient functions. The
 * ambient fallback reads the globals inside its own body rather than capturing them, so a suite
 * that installs fake timers after import is still honored.
 */
export function resolveTimers(call?: TTimersOverride, factory?: TTimersOverride): ITimers {
  if (isTimersPair(call)) {
    return call;
  }

  if (isTimersPair(factory)) {
    return factory;
  }

  return AMBIENT_TIMERS;
}

const AMBIENT_TIMERS: ITimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

function isSchedulerPair(deps: TSchedulerOverride | undefined): deps is ISchedulerPair {
  return deps != null && typeof deps.scheduler?.postTask === 'function' && typeof deps.TaskController === 'function';
}

function isTimersPair(deps: TTimersOverride | undefined): deps is ITimers {
  return deps != null && typeof deps.setTimeout === 'function' && typeof deps.clearTimeout === 'function';
}
