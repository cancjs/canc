import { createLazyPromise, lazy } from './index';

describe('native LazyPromise promise options', () => {
  it('never runs the executor when its signal aborts before the first subscription', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const executor = jest.fn((resolve: (value: number) => void) => resolve(1));
    const promise = lazy<number>(executor, { signal: controller.signal });

    controller.abort(reason);

    await expect(promise).rejects.toBe(reason);
    expect(executor).toHaveBeenCalledTimes(0);
  });

  it('never runs the work of createLazyPromise when its signal aborts before the first subscription', async () => {
    const controller = new AbortController();
    const work = jest.fn(() => 1);
    const promise = createLazyPromise(work, { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toBe(controller.signal.reason);
    expect(work).toHaveBeenCalledTimes(0);
  });

  it('stops waiting and runs both teardown forms when its signal aborts after start', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const onCancel = jest.fn();
    const teardown = jest.fn();
    const promise = lazy<number>(
      (_resolve, _reject, handleCancel) => {
        handleCancel(onCancel);

        return teardown;
      },
      { signal: controller.signal },
    );

    const settled = promise.then(
      () => 'fulfilled',
      (e: unknown) => e,
    );

    controller.abort(reason);

    await expect(settled).resolves.toBe(reason);
    expect(onCancel).toHaveBeenCalledWith(reason);
    expect(teardown).toHaveBeenCalledWith(reason);
  });
});
