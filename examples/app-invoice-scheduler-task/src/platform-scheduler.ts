/** Priority band accepted by the platform scheduler's postTask, matching the WICG IDL exactly. */
export type TTaskPriority = 'user-blocking' | 'user-visible' | 'background';

/** Structural shape of a platform TaskSignal: an AbortSignal that also reports its priority. */
export interface ITaskSignal extends AbortSignal {
  readonly priority: TTaskPriority;
}

/**
 * Structural shape of a platform TaskController: an AbortController whose signal carries a
 * priority and can be reprioritized after the task has already been queued.
 */
export interface ITaskController extends AbortController {
  readonly signal: ITaskSignal;
  setPriority(priority: TTaskPriority): void;
}

/** Structural shape of the ambient `scheduler` object's task-posting surface. */
export interface ISchedulerImpl {
  postTask<T>(
    callback: () => T | PromiseLike<T>,
    options?: { priority?: TTaskPriority; delay?: number; signal?: AbortSignal },
  ): Promise<T>;
  yield?(): Promise<void>;
}

/** The platform scheduler pair: the ambient scheduler object plus its TaskController constructor. */
export interface IPlatformScheduler {
  scheduler: ISchedulerImpl;
  TaskController: new (init?: { priority?: TTaskPriority }) => ITaskController;
}

/**
 * Reads `scheduler` and `TaskController` off `globalThis` together, behind one narrow cast.
 * Returns undefined unless both are present, so a caller never sees half a platform pair. Safari
 * and node have neither today; Chrome has both from 94.
 */
export function getPlatformScheduler(): IPlatformScheduler | undefined {
  const platform = globalThis as unknown as Partial<IPlatformScheduler>;
  if (!platform.scheduler || !platform.TaskController) {
    return undefined;
  }
  return { scheduler: platform.scheduler, TaskController: platform.TaskController };
}
