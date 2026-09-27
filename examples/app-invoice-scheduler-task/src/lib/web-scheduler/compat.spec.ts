import { delay } from '@cancjs/toolbox';

import { createSchedulerTimers } from './scheduler-timers';
import { ISchedulerImpl, ITaskController, ITaskSignal, TTaskPriority } from './types';

/**
 * A compile-time guard, not a behavior test. It mimics the declarations the community typings
 * publish today and the ones the DOM library will publish eventually, then proves a value of those
 * shapes is accepted everywhere this library asks for its own. The mimics are module scoped, so
 * they declare no globals and cannot collide with the real thing.
 *
 * The direction is the whole point. Being wider than the platform costs nothing; being narrower
 * turns into a compile error in every consumer on the day those declarations land.
 */

type SpecTaskPriority = 'user-blocking' | 'user-visible' | 'background';

interface SpecTaskSignal extends AbortSignal {
  readonly priority: SpecTaskPriority;
  onprioritychange: ((this: SpecTaskSignal, event: Event) => any) | null;
}

interface SpecTaskController extends AbortController {
  readonly signal: SpecTaskSignal;
  setPriority(priority: SpecTaskPriority): void;
}

interface SpecScheduler {
  postTask<T>(
    callback: () => T | PromiseLike<T>,
    options?: { priority?: SpecTaskPriority; delay?: number; signal?: AbortSignal },
  ): Promise<T>;
  yield(): Promise<void>;
}

const specSignal = null as unknown as SpecTaskSignal;
const specController = null as unknown as SpecTaskController;
const specScheduler = null as unknown as SpecScheduler;

describe('platform compatibility', () => {
  it('accepts platform values wherever it declares a type of its own', () => {
    const signal: ITaskSignal = specSignal;
    const controller: ITaskController = specController;
    const scheduler: ISchedulerImpl = specScheduler;

    // Neither union may gain or lose a member: a mismatch in either direction fails to compile.
    const ourBand: SpecTaskPriority = 'background' as TTaskPriority;
    const theirBand: TTaskPriority = 'background' as SpecTaskPriority;

    // The pair this library builds has to satisfy what the toolbox helpers take, or none of them
    // could schedule through the scheduler.
    const scheduleThroughToolbox = () => delay(1, { ...createSchedulerTimers() });

    expect([signal, controller, scheduler]).toEqual([null, null, null]);
    expect([ourBand, theirBand]).toEqual(['background', 'background']);
    expect(typeof scheduleThroughToolbox).toBe('function');
  });

  it('does not claim its own types are the platform ones', () => {
    const ourSignal = null as unknown as ITaskSignal;

    // @ts-expect-error ours declares only the members this library uses, so it is not a substitute
    const asSpecSignal: SpecTaskSignal = ourSignal;

    expect(asSpecSignal).toBeNull();
  });
});
