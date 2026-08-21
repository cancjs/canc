import {
  IPostTaskOptions,
  ISchedulerPair,
  ITaskSignal,
  TTaskControllerCtor,
  TTaskPriority,
} from '../src/lib/web-scheduler';

/**
 * A scheduler implementation the tests drive by hand. It reproduces the parts of the platform's
 * behavior the library actually relies on: strict priority then arrival order, continuations at the
 * front of their band, aborted entries removed from the queue rather than skipped when their turn
 * comes, and a delay measured against a clock the test advances. No real timers are involved, so
 * every ordering assertion is deterministic.
 */

const BAND_ORDER: Record<TTaskPriority, number> = { 'user-blocking': 0, 'user-visible': 1, background: 2 };

interface IFakeEntry {
  seq: number;
  isContinuation: boolean;
  /** Set only when postTask was given an explicit priority, which pins the entry to that band. */
  pinnedPriority?: TTaskPriority;
  signal?: AbortSignal;
  detach(): void;
  run(): void;
  reject(reason: unknown): void;
}

/** What a test is allowed to see about a pending entry. */
export interface IQueuedTask {
  priority: TTaskPriority;
  isContinuation: boolean;
}

export interface IFakeScheduler {
  /** Spreadable into any options bag: a whole scheduler, never half of one. */
  impl: ISchedulerPair;
  /** Entries waiting for their turn, highest priority first. */
  readonly queued: readonly IQueuedTask[];
  /** Entries still waiting for the virtual clock. */
  readonly delayed: readonly IQueuedTask[];
  /** Move the virtual clock forward, enqueueing whatever became due. */
  advance(ms: number): void;
  /** Run the single highest priority entry. */
  runNext(): void;
  /** Run entries until nothing is left, letting promise reactions settle between each. */
  drain(): Promise<void>;
}

export function createFakeScheduler(): IFakeScheduler {
  const ready: IFakeEntry[] = [];
  const waiting: Array<{ entry: IFakeEntry; readyAt: number }> = [];
  let clock = 0;
  let seq = 0;

  const priorityOf = (entry: IFakeEntry): TTaskPriority =>
    entry.pinnedPriority ?? (entry.signal as ITaskSignal | undefined)?.priority ?? 'user-visible';

  const sortKey = (entry: IFakeEntry): [number, number, number] => [
    BAND_ORDER[priorityOf(entry)],
    entry.isContinuation ? 0 : 1,
    entry.seq,
  ];

  const remove = (entry: IFakeEntry): void => {
    const readyAt = ready.indexOf(entry);
    if (readyAt >= 0) ready.splice(readyAt, 1);

    const waitingAt = waiting.findIndex((held) => held.entry === entry);
    if (waitingAt >= 0) waiting.splice(waitingAt, 1);
  };

  const admit = (entry: IFakeEntry, delay: number): void => {
    if (entry.signal?.aborted) {
      // A pre-aborted signal rejects asynchronously and never occupies the queue, which is what
      // the specification requires and what a caller relies on to avoid zombie entries.
      Promise.resolve().then(() => entry.reject(entry.signal?.reason));

      return;
    }

    if (delay > 0) {
      waiting.push({ entry, readyAt: clock + delay });
    } else {
      ready.push(entry);
    }
  };

  const post = <T>(callback: () => T | PromiseLike<T>, options?: IPostTaskOptions): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const entry: IFakeEntry = {
        seq: (seq += 1),
        isContinuation: false,
        pinnedPriority: options?.priority,
        signal: options?.signal,
        detach: () => {
          if (onAbort && options?.signal) options.signal.removeEventListener('abort', onAbort);
        },
        run: () => {
          entry.detach();
          try {
            resolve(callback());
          } catch (error) {
            reject(error);
          }
        },
        reject: (reason: unknown) => {
          entry.detach();
          reject(reason);
        },
      };

      const onAbort =
        options?.signal ?
          (): void => {
            remove(entry);
            entry.reject(options.signal?.reason);
          }
        : undefined;

      if (onAbort && options?.signal && !options.signal.aborted) {
        options.signal.addEventListener('abort', onAbort);
      }

      admit(entry, options?.delay ?? 0);
    });

  const yieldToScheduler = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const entry: IFakeEntry = {
        seq: (seq += 1),
        isContinuation: true,
        detach: () => undefined,
        run: () => resolve(),
        reject,
      };

      ready.push(entry);
    });

  const describe = (entry: IFakeEntry): IQueuedTask => ({
    priority: priorityOf(entry),
    isContinuation: entry.isContinuation,
  });

  const takeNext = (): IFakeEntry | undefined => {
    if (ready.length === 0) return undefined;

    let best = ready[0];
    for (const entry of ready) {
      if (compareKeys(sortKey(entry), sortKey(best)) < 0) best = entry;
    }

    remove(best);

    return best;
  };

  return {
    impl: {
      scheduler: { postTask: post, yield: yieldToScheduler },
      TaskController: createFakeTaskControllerCtor(),
    },

    get queued(): readonly IQueuedTask[] {
      return [...ready].sort((left, right) => compareKeys(sortKey(left), sortKey(right))).map(describe);
    },

    get delayed(): readonly IQueuedTask[] {
      return waiting.map((held) => describe(held.entry));
    },

    advance(ms: number): void {
      clock += ms;

      const due = waiting.filter((held) => held.readyAt <= clock).sort((left, right) => left.readyAt - right.readyAt);

      for (const held of due) {
        remove(held.entry);
        ready.push(held.entry);
      }
    },

    runNext(): void {
      takeNext()?.run();
    },

    async drain(): Promise<void> {
      while (ready.length > 0) {
        takeNext()?.run();
        await flushMicrotasks();
      }
    },
  };
}

/**
 * Lets the promise reactions of the entry that just ran settle before the next one starts, so a
 * test observing the order in which promises resolved sees the order in which entries ran.
 */
export async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 16; turn += 1) {
    await Promise.resolve();
  }
}

function compareKeys(left: [number, number, number], right: [number, number, number]): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function createFakeTaskControllerCtor(): TTaskControllerCtor {
  class FakeTaskController extends AbortController {
    private _priority: TTaskPriority;

    constructor(init?: { priority?: TTaskPriority }) {
      super();
      this._priority = init?.priority ?? 'user-visible';
      Object.defineProperty(this.signal, 'priority', { get: () => this._priority, configurable: true });
    }

    setPriority(priority: TTaskPriority): void {
      this._priority = priority;
    }
  }

  return FakeTaskController as unknown as TTaskControllerCtor;
}
