import { CancelError, isCancelError } from '@cancjs/promise';

import { createLazyPromise, lazy, LazyPromise } from './index';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LazyPromise promise options', () => {
  it('never runs the executor when its signal aborts before the first subscription', async () => {
    const controller = new AbortController();
    const executor = jest.fn((resolve: (value: number) => void) => resolve(1));
    const promise = lazy<number>(executor, { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(executor).toHaveBeenCalledTimes(0);
    expect(promise.started).toBe(false);
  });

  it('never runs the work of createLazyPromise when its signal aborts before the first subscription', async () => {
    const controller = new AbortController();
    const work = jest.fn(() => 1);
    const promise = createLazyPromise(work, { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(work).toHaveBeenCalledTimes(0);
  });

  it('treats an already aborted signal as a cancel before start', async () => {
    const controller = new AbortController();
    controller.abort();
    const executor = jest.fn();
    const promise = lazy(executor, { signal: controller.signal });

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(executor).toHaveBeenCalledTimes(0);
  });

  it('normalizes an object reason before start the way cancel does on a promise', async () => {
    const reason = { why: 1 };
    const controller = new AbortController();
    const promise = lazy(jest.fn(), { signal: controller.signal });

    controller.abort(reason);

    const error = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(isCancelError(error)).toBe(true);
    expect((error as CancelError).cause).toBe(reason);
    expect((error as CancelError).message).toBe('');
  });

  it('normalizes an object reason passed to cancel before start', async () => {
    const reason = { why: 1 };
    const promise = lazy(jest.fn());

    promise.cancel(reason);

    const error = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(isCancelError(error)).toBe(true);
    expect((error as CancelError).cause).toBe(reason);
  });

  it('cancels the running work when its signal aborts after start', async () => {
    const controller = new AbortController();
    const onCancel = jest.fn();
    const promise = lazy<number>(
      (_resolve, _reject, handleCancel) => {
        handleCancel(onCancel);
      },
      { signal: controller.signal },
    );

    const settled = promise.then(
      () => 'fulfilled',
      (e: unknown) => e,
    );

    controller.abort();

    expect(isCancelError(await settled)).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps shielded work running when canceled after start', async () => {
    let resolveWork!: (value: number) => void;
    const teardown = jest.fn();
    const onCancel = jest.fn();
    const promise = lazy<number>(
      (resolve, _reject, handleCancel) => {
        resolveWork = resolve;
        handleCancel(onCancel);

        return teardown;
      },
      { shield: true },
    );

    const settled = promise.then(
      (value) => value,
      (e: unknown) => e,
    );

    promise.cancel();
    await flush();
    resolveWork(42);

    await expect(settled).resolves.toBe(42);
    expect(onCancel).not.toHaveBeenCalled();
    expect(teardown).not.toHaveBeenCalled();
  });

  it('rejects instead of throwing synchronously for a strict lazy with an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const executor = jest.fn();
    const promise = lazy(executor, { signal: controller.signal, strict: true });

    let subscribed: PromiseLike<unknown> | undefined;

    expect(() => {
      subscribed = promise.then(
        () => 'fulfilled',
        (e: unknown) => e,
      );
    }).not.toThrow();

    expect(isCancelError(await subscribed)).toBe(true);
    expect(executor).toHaveBeenCalledTimes(0);
  });

  it('applies the options of the combinator statics to the result', async () => {
    const controller = new AbortController();
    const promise = LazyPromise.all([1, 2], { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });
});
