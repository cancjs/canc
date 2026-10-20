import { lazy, LazyPromise } from './index';

describe('native LazyPromise combinators with a signal', () => {
  it('all resolves with every value', async () => {
    const controller = new AbortController();

    await expect(
      LazyPromise.all([1, lazy<number>((resolve) => resolve(2))], { signal: controller.signal }),
    ).resolves.toEqual([1, 2]);
  });

  it('race settles with the first value', async () => {
    const controller = new AbortController();
    const slow = new Promise<number>(() => undefined);

    await expect(LazyPromise.race([slow, 1], { signal: controller.signal })).resolves.toBe(1);
  });

  it('allSettled and any resolve', async () => {
    const controller = new AbortController();
    const failure = new Error('no');
    const rejected = Promise.reject(failure);
    rejected.catch(() => undefined);

    await expect(LazyPromise.allSettled([1, rejected], { signal: controller.signal })).resolves.toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: failure },
    ]);
    await expect(LazyPromise.any([rejected, 2], { signal: controller.signal })).resolves.toBe(2);
  });

  it('never builds the aggregate when the signal aborts before the first subscription', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const executor = jest.fn((resolve: (value: number) => void) => resolve(1));
    const aggregate = LazyPromise.all([lazy<number>(executor)], { signal: controller.signal });

    controller.abort(reason);

    await expect(aggregate).rejects.toBe(reason);
    expect(executor).not.toHaveBeenCalled();
  });

  it('rejects with the error of an async onFinally that rejects', async () => {
    const failure = new Error('cleanup failed');
    const finalizer = Promise.reject(failure);
    const then = jest.spyOn(finalizer, 'then');

    await expect(lazy<number>((resolve) => resolve(1)).finally(() => finalizer)).rejects.toBe(failure);
    expect(then).toHaveBeenCalled();
  });
});
