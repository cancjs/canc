/**
 * Structural types for the platform's prioritized task scheduler.
 *
 * Nothing here is declared in the global scope on purpose. TypeScript's DOM library ships none of
 * these types today and will ship them one day, and a consumer may already have installed the
 * community typings for the same API. Type aliases and `declare var` do not merge, so a global
 * declaration here would become a duplicate identifier the moment either of those lands. Every
 * name below is module scoped and prefixed instead.
 *
 * The direction that matters is that a real platform value must be assignable TO these types. Only
 * the members used by this library are declared, and the priority union carries exactly the three
 * values the specification defines. Being wider than the platform is safe; being narrower is a
 * future compile error.
 */

/** Priority band accepted by the scheduler, matching the specification's enum exactly. */
export type TTaskPriority = 'user-blocking' | 'user-visible' | 'background';

/** An AbortSignal that also reports the priority of the task it governs. */
export interface ITaskSignal extends AbortSignal {
  readonly priority: TTaskPriority;
}

/**
 * An AbortController whose signal carries a priority. `setPriority` reorders a task that is
 * already queued, which a plain timer callback cannot offer.
 */
export interface ITaskController extends AbortController {
  readonly signal: ITaskSignal;
  setPriority(priority: TTaskPriority): void;
}

/** Constructor shape of the platform's TaskController. */
export type TTaskControllerCtor = new (init?: { priority?: TTaskPriority }) => ITaskController;

/**
 * Options accepted by `postTask`. `signal` is typed as a plain AbortSignal because the interface
 * definition types it that way: a task signal is one accepted value, an `AbortSignal.timeout()`
 * result is another. `delay` counts milliseconds before the task is ENQUEUED, not before it runs,
 * and unlike `setTimeout` it is not clamped to a signed 32 bit integer.
 */
export interface IPostTaskOptions {
  priority?: TTaskPriority;
  delay?: number;
  signal?: AbortSignal;
}

/** The task-posting surface of the ambient `scheduler` object. */
export interface ISchedulerImpl {
  postTask<T>(callback: () => T | PromiseLike<T>, options?: IPostTaskOptions): Promise<T>;
  /** Absent before Chrome 129 and in the community polyfill, so every caller feature detects it. */
  yield?(): Promise<void>;
}

/**
 * A whole scheduler implementation: the object that posts tasks plus the controller class that
 * governs them. The two are resolved together and never mixed, because a polyfill's `postTask`
 * does not recognize a native controller's signal.
 */
export interface ISchedulerPair {
  scheduler: ISchedulerImpl;
  TaskController: TTaskControllerCtor;
}

/**
 * The timer functions this library schedules against when no scheduler is available. The shape is
 * the one the toolbox helpers accept, so a pair produced here can be handed straight to `delay`,
 * `timeout`, `retry`, `waitFor`, `debounce` or `throttle`.
 */
export interface ITimers {
  setTimeout: (handler: () => void, ms?: number) => any;
  clearTimeout: (handle: any) => void;
}
