import { createLazyPromise, delay, isLazyPromise, LazyPromise } from './index';

// runtime view of either spelling, typed loosely so both compile whatever the helper returns
interface ILazyLike extends PromiseLike<string> {
  execute?: () => void;
  started?: boolean;
}

type TMake = (job: () => string, ms: number, options?: { signal?: AbortSignal }) => ILazyLike;

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

describe.each(spellings)('native %s', (_name, make) => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has no cancel', () => {
    expect('cancel' in make(() => 'done', 10)).toBe(false);
  });

  it('is a lazy promise with execute and started', async () => {
    const job = jest.fn(() => 'done');
    const promise = make(job, 10);

    expect(promise).toBeInstanceOf(LazyPromise);
    expect(isLazyPromise(promise)).toBe(true);
    expect(promise.started).toBe(false);
    expect(job).toHaveBeenCalledTimes(0);

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

  it('never runs the work and rejects with the reason when its signal aborts before start', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const job = jest.fn(() => 'done');
    const promise = make(job, 10, { signal: controller.signal });

    controller.abort(reason);
    const settled = promise.then(
      () => 'fulfilled',
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(20);

    await expect(settled).resolves.toBe(reason);
    expect(job).toHaveBeenCalledTimes(0);
  });
});
