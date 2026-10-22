import { isCancelError } from '@cancjs/promise';

import { createLazyPromise, delay, isLazyPromise, LazyPromise } from './index';
import { IToolboxOptions } from './options';

// runtime view of either spelling, typed loosely so both compile whatever the helper returns
interface ILazyLike extends PromiseLike<string> {
  cancel(reason?: unknown): unknown;
  execute?: () => void;
  started?: boolean;
}

type TMake = (job: () => string, ms: number, options?: IToolboxOptions) => ILazyLike;

const spellings: [string, TMake][] = [
  [
    'delay with the lazy option',
    (job, ms, options) => delay(job, ms, { ...options, lazy: true }) as unknown as ILazyLike,
  ],
  [
    'LazyPromise.try over delay',
    (job, ms, options) => LazyPromise.try(() => delay(job, ms, options)) as unknown as ILazyLike,
  ],
];

interface IOutcome {
  state: 'pending' | 'fulfilled' | 'rejected';
  value?: unknown;
}

function observe(promise: PromiseLike<unknown>): IOutcome {
  const outcome: IOutcome = { state: 'pending' };

  promise.then(
    (value) => {
      outcome.state = 'fulfilled';
      outcome.value = value;
    },
    (reason: unknown) => {
      outcome.state = 'rejected';
      outcome.value = reason;
    },
  );

  return outcome;
}

describe.each(spellings)('%s', (_name, make) => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never runs the work when canceled before start', async () => {
    const job = jest.fn(() => 'done');
    const promise = make(job, 10);

    promise.cancel();
    const outcome = observe(promise);
    await jest.advanceTimersByTimeAsync(20);

    expect(job).toHaveBeenCalledTimes(0);
    expect(outcome.state).toBe('rejected');
    expect(isCancelError(outcome.value)).toBe(true);
  });

  it('makes an object reason given before start the cause of the CancelError', async () => {
    const reason = { why: 1 };
    const promise = make(() => 'done', 10);

    promise.cancel(reason);
    const outcome = observe(promise);
    await jest.advanceTimersByTimeAsync(0);

    expect(isCancelError(outcome.value)).toBe(true);
    expect((outcome.value as Error).message).toBe('');
    expect((outcome.value as Error).cause).toBe(reason);
  });

  it('stops the work when canceled after start', async () => {
    const job = jest.fn(() => 'done');
    const promise = make(job, 10);
    const outcome = observe(promise);

    await jest.advanceTimersByTimeAsync(5);
    promise.cancel();
    await jest.advanceTimersByTimeAsync(20);

    expect(job).toHaveBeenCalledTimes(0);
    expect(outcome.state).toBe('rejected');
  });

  it('stops the work when the only derived promise is canceled', async () => {
    const job = jest.fn(() => 'done');
    const promise = make(job, 10);
    const derived = promise.then((value) => value) as PromiseLike<string> & { cancel(): void };
    const outcome = observe(derived);

    await jest.advanceTimersByTimeAsync(5);
    derived.cancel();
    await jest.advanceTimersByTimeAsync(20);

    expect(job).toHaveBeenCalledTimes(0);
    expect(outcome.state).toBe('rejected');
  });

  it('rejects a shielded work canceled before start instead of staying pending', async () => {
    const job = jest.fn(() => 'done');
    const promise = make(job, 10, { shield: true });

    promise.cancel();
    const outcome = observe(promise);
    await jest.advanceTimersByTimeAsync(20);

    expect(job).toHaveBeenCalledTimes(0);
    expect(outcome.state).toBe('rejected');
  });

  it('rejects instead of throwing when strict meets an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const job = jest.fn(() => 'done');
    const promise = make(job, 10, { strict: true, signal: controller.signal });

    let outcome: IOutcome | undefined;
    expect(() => {
      outcome = observe(promise);
    }).not.toThrow();
    await jest.advanceTimersByTimeAsync(20);

    expect(job).toHaveBeenCalledTimes(0);
    expect(outcome?.state).toBe('rejected');
  });

  it('never runs the work when its signal aborts before start', async () => {
    const controller = new AbortController();
    const job = jest.fn(() => 'done');
    const promise = make(job, 10, { signal: controller.signal });

    controller.abort();
    const outcome = observe(promise);
    await jest.advanceTimersByTimeAsync(20);

    expect(job).toHaveBeenCalledTimes(0);
    expect(outcome.state).toBe('rejected');
  });

  it('is a lazy promise with execute and started', async () => {
    const job = jest.fn(() => 'done');
    const promise = make(job, 10);

    expect(promise).toBeInstanceOf(LazyPromise);
    expect(isLazyPromise(promise)).toBe(true);
    expect(promise.started).toBe(false);

    promise.execute?.();
    expect(promise.started).toBe(true);
    await jest.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBe('done');
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('comes back unchanged from createLazyPromise', () => {
    const promise = make(() => 'done', 10);

    expect(createLazyPromise(promise)).toBe(promise);
  });

  it('returns undefined from cancel', () => {
    expect(make(() => 'done', 10).cancel()).toBeUndefined();
  });
});
