import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { delay } from '@cancjs/toolbox';

import { createFakeScheduler } from '../../../test/fake-scheduler';
import { IPostSchedulerTaskOptions, postSchedulerTask } from './post-scheduler-task';
import { createSchedulerTimers } from './scheduler-timers';
import { toTaskSignal } from './task-signal';
import { ITimers } from './types';
import { yieldSchedulerTask } from './yield-scheduler-task';

describe('postSchedulerTask', () => {
  it('runs tasks in strict priority order regardless of when they were posted', async () => {
    const fake = createFakeScheduler();
    const order: string[] = [];

    const background = postSchedulerTask(() => order.push('background'), { ...fake.impl, priority: 'background' });
    const blocking = postSchedulerTask(() => order.push('user-blocking'), { ...fake.impl, priority: 'user-blocking' });
    const visible = postSchedulerTask(() => order.push('user-visible'), { ...fake.impl, priority: 'user-visible' });

    await fake.drain();
    await Promise.all([background, blocking, visible]);

    expect(order).toEqual(['user-blocking', 'user-visible', 'background']);
  });

  it('moves a queued task when its priority is raised', async () => {
    const fake = createFakeScheduler();
    const order: string[] = [];

    const promoted = postSchedulerTask(() => order.push('promoted'), { ...fake.impl, priority: 'background' });
    const visible = postSchedulerTask(() => order.push('visible'), { ...fake.impl, priority: 'user-visible' });

    promoted.priority = 'user-blocking';

    await fake.drain();
    await Promise.all([promoted, visible]);

    expect(order).toEqual(['promoted', 'visible']);
  });

  it('removes a canceled task from the queue instead of skipping it later', async () => {
    const fake = createFakeScheduler();
    const body = jest.fn();

    const task = postSchedulerTask(body, { ...fake.impl });
    const rejection = task.catch((reason: unknown) => reason);

    expect(fake.queued).toHaveLength(1);

    task.cancel();

    expect(fake.queued).toHaveLength(0);

    await rejection;
    await fake.drain();

    expect(body).not.toHaveBeenCalled();
  });

  it('rejects a canceled task with a cancel error carrying the reason', async () => {
    const fake = createFakeScheduler();

    const task = postSchedulerTask(() => 'invoice', { ...fake.impl });
    const rejection = task.catch((reason: unknown) => reason);

    task.cancel('the filter changed');

    const reason = await rejection;

    expect(isCancelError(reason)).toBe(true);
    expect((reason as Error).message).toBe('the filter changed');
  });

  it('hands back a caller signal abort reason unchanged', async () => {
    const fake = createFakeScheduler();
    const body = jest.fn();
    const controller = new AbortController();
    const stopReason = { code: 'stale-filter' };

    const task = postSchedulerTask(body, { ...fake.impl, signal: controller.signal });
    const rejection = task.catch((reason: unknown) => reason);

    controller.abort(stopReason);

    expect(await rejection).toBe(stopReason);
    expect(body).not.toHaveBeenCalled();
  });

  it('removes its forwarded abort listener once the task settles', async () => {
    const fake = createFakeScheduler();
    const caller = createSignalStub();

    const task = postSchedulerTask(() => 'done', { ...fake.impl, signal: caller.signal });

    expect(caller.listenerCount).toBe(1);

    await fake.drain();

    await expect(task).resolves.toBe('done');
    expect(caller.removeCalls).toBe(1);
    expect(caller.listenerCount).toBe(0);
  });

  it('holds a delayed task out of the queue until the clock passes', async () => {
    const fake = createFakeScheduler();
    const body = jest.fn();

    const task = postSchedulerTask(body, { ...fake.impl, delay: 50 });

    expect(fake.queued).toHaveLength(0);
    expect(fake.delayed).toHaveLength(1);

    fake.advance(50);

    expect(fake.queued).toHaveLength(1);

    await fake.drain();
    await task;

    expect(body).toHaveBeenCalledTimes(1);

    const abandonedBody = jest.fn();
    const abandoned = postSchedulerTask(abandonedBody, { ...fake.impl, delay: 100 });
    const rejection = abandoned.catch((reason: unknown) => reason);

    abandoned.cancel();

    expect(fake.delayed).toHaveLength(0);

    fake.advance(100);

    expect(fake.queued).toHaveLength(0);

    await rejection;

    expect(abandonedBody).not.toHaveBeenCalled();
  });

  it('degrades to an injected timers pair and still cancels', async () => {
    const timers = createManualTimers();
    const body = jest.fn();

    const task = postSchedulerTask(body, timers.pair);
    const rejection = task.catch((reason: unknown) => reason);

    expect(timers.pending).toBe(1);

    task.cancel();

    expect(timers.pending).toBe(0);

    timers.runAll();

    expect(isCancelError(await rejection)).toBe(true);
    expect(body).not.toHaveBeenCalled();
  });

  it('rejects half a timers pair', () => {
    // @ts-expect-error a lone setTimeout would be paired with someone else's clearTimeout
    const options: IPostSchedulerTaskOptions = { setTimeout: (handler: () => void) => handler };

    expect(options).toBeDefined();
  });
});

describe('yieldSchedulerTask', () => {
  it('resumes ahead of a task already queued at the same priority', async () => {
    const fake = createFakeScheduler();
    const order: string[] = [];

    const queued = postSchedulerTask(() => order.push('task'), { ...fake.impl });
    const resumed = yieldSchedulerTask({ ...fake.impl }).then(() => order.push('yield'));

    await fake.drain();
    await Promise.all([queued, resumed]);

    expect(order).toEqual(['yield', 'task']);
  });

  it('cancels into a cancel error and never runs the continuation', async () => {
    const fake = createFakeScheduler();
    const continuation = jest.fn();

    const yielding = yieldSchedulerTask({ ...fake.impl });
    const rejection = yielding.then(continuation, (reason: unknown) => reason);

    yielding.cancel();

    expect(isCancelError(await rejection)).toBe(true);

    await fake.drain();

    expect(continuation).not.toHaveBeenCalled();
  });
});

describe('toTaskSignal', () => {
  it('aborts on cancellation only, and leaves bubbling intact', async () => {
    const pending = new CancelablePromise<string>(() => undefined);
    const signal = toTaskSignal(pending);

    expect(signal.aborted).toBe(false);

    // Taking the signal must not count as consuming the promise, so a single canceled child still
    // bubbles up and cancels the source.
    const child = pending.then((value) => value);
    child.cancel();

    expect(pending.canceled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);

    const failing = new CancelablePromise<string>((_resolve, reject) => reject(new Error('lookup failed')));
    const failingSignal = toTaskSignal(failing);

    await expect(failing).rejects.toThrow('lookup failed');

    expect(failingSignal.aborted).toBe(false);
  });
});

describe('createSchedulerTimers', () => {
  it('clears a timer without producing an unhandled rejection', async () => {
    const fake = createFakeScheduler();
    const timers = createSchedulerTimers({ ...fake.impl });
    const unhandled = jest.fn();

    process.on('unhandledRejection', unhandled);

    try {
      const handle = timers.setTimeout(() => undefined, 0);

      timers.clearTimeout(handle);

      // One turn of the event loop is what node needs before it decides a rejection went unhandled.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('carries a toolbox helper onto the scheduler at the chosen priority', async () => {
    const fake = createFakeScheduler();
    const timers: ITimers = createSchedulerTimers({ ...fake.impl, priority: 'background' });

    const waited = delay(50, { ...timers });

    expect(fake.delayed).toHaveLength(1);
    expect(fake.delayed[0].priority).toBe('background');

    fake.advance(50);

    expect(fake.queued).toHaveLength(1);

    await fake.drain();
    await expect(waited).resolves.toBeUndefined();

    const abandoned = delay(50, { ...timers });
    const rejection = abandoned.catch((reason: unknown) => reason);

    abandoned.cancel();

    expect(fake.delayed).toHaveLength(0);
    expect(isCancelError(await rejection)).toBe(true);
  });
});

/** Counts what the library attaches and detaches, which a real AbortController cannot report. */
function createSignalStub() {
  const listeners = new Set<() => void>();
  let removeCalls = 0;

  const signal = {
    aborted: false,
    reason: undefined,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      removeCalls += 1;
      listeners.delete(listener);
    },
  };

  return {
    signal: signal as unknown as AbortSignal,
    get listenerCount(): number {
      return listeners.size;
    },
    get removeCalls(): number {
      return removeCalls;
    },
  };
}

/** A timers pair with no clock at all: the test decides when a handler runs. */
function createManualTimers() {
  const handlers = new Map<number, () => void>();
  let nextHandle = 0;

  return {
    pair: {
      setTimeout: (handler: () => void) => {
        nextHandle += 1;
        handlers.set(nextHandle, handler);

        return nextHandle;
      },
      clearTimeout: (handle: number) => {
        handlers.delete(handle);
      },
    },
    get pending(): number {
      return handlers.size;
    },
    runAll(): void {
      const pending = [...handlers.values()];

      handlers.clear();

      for (const handler of pending) {
        handler();
      }
    },
  };
}
