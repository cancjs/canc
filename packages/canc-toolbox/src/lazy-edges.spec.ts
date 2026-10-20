import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { lazy, LazyPromise } from './index';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// subscribes in the same turn, unlike Promise.resolve on a thenable
function settle<T>(promise: PromiseLike<T>): PromiseLike<{ value?: T; reason?: unknown }> {
  return promise.then(
    (value) => ({ value }),
    (reason: unknown) => ({ reason }),
  );
}

describe('LazyPromise state edges', () => {
  it('runs no teardown when canceled after the executor resolved synchronously', async () => {
    const teardown = jest.fn();
    const executor = jest.fn((resolve: (value: string) => void) => {
      resolve('ok');
      return teardown;
    });
    const promise = lazy<string>(executor);

    const consumer = promise.then((value) => value);
    promise.cancel();

    await expect(consumer).resolves.toBe('ok');
    expect(teardown).not.toHaveBeenCalled();
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('keeps a delivered value of a resettable lazy canceled in the same turn', async () => {
    let runs = 0;
    const promise = lazy<number>(
      (resolve) => {
        runs++;
        resolve(runs);
      },
      { resettable: true },
    );

    const consumer = promise.then((value) => value);
    promise.cancel();

    await expect(consumer).resolves.toBe(1);
    await expect(promise).resolves.toBe(1);
    expect(runs).toBe(1);
  });

  it('honors a cancel called from inside the executor', async () => {
    const teardown = jest.fn();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise: LazyPromise<string> = lazy<string>((resolve) => {
      promise.cancel('inside');
      timer = setTimeout(() => resolve('done'), 10);
      return teardown;
    });

    const outcome = await settle(promise);
    clearTimeout(timer);

    expect(isCancelError(outcome.reason)).toBe(true);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing teardown: the work is canceled and the error lands in the cleanup results', async () => {
    const boom = new Error('teardown failed');
    const contextTeardown = jest.fn();
    const promise = lazy<string>((_resolve, _reject, handleCancel) => {
      handleCancel(contextTeardown);
      return () => {
        throw boom;
      };
    });

    const consumer = settle(promise);
    let cleanup: unknown;
    expect(() => {
      cleanup = promise.cancel();
    }).not.toThrow();

    const results = await (cleanup as PromiseLike<{ status: string; reason?: unknown }[]>);
    const outcome = await consumer;

    expect(isCancelError(outcome.reason)).toBe(true);
    expect(contextTeardown).toHaveBeenCalledTimes(1);
    expect(results).toContainEqual({ status: 'rejected', reason: boom });
  });

  it('rethrows a teardown error after canceling the work when cancel is not awaitable', async () => {
    const boom = new Error('teardown failed');
    const later = jest.fn();
    const promise = lazy<string>(
      (_resolve, _reject, handleCancel) => {
        handleCancel(later);
        return () => {
          throw boom;
        };
      },
      { asyncCancel: false },
    );

    const consumer = settle(promise);

    expect(() => promise.cancel()).toThrow(boom);
    expect(isCancelError((await consumer).reason)).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('rejects with the error of an async onFinally that rejects, leaving nothing unhandled', async () => {
    const failure = new Error('cleanup failed');
    const finalizer = CancelablePromise.reject(failure);
    const then = jest.spyOn(finalizer, 'then');

    const outcome = await settle(lazy<number>((resolve) => resolve(1)).finally(() => finalizer));

    expect(outcome.reason).toBe(failure);
    expect(then).toHaveBeenCalled();
  });

  it('cancels before start after a reset even once the canceled run has settled', async () => {
    let runs = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = lazy<number>(
      (resolve) => {
        runs++;
        timer = setTimeout(() => resolve(runs), 1000);
      },
      { resettable: true },
    );

    void settle(promise);
    promise.cancel();
    clearTimeout(timer);
    await flush();

    promise.cancel('again');
    const outcome = await settle(promise);

    expect(isCancelError(outcome.reason)).toBe(true);
    expect(runs).toBe(1);
    expect(promise.started).toBe(false);
  });

  describe('resettable consumers', () => {
    function resettableWork() {
      const teardown = jest.fn();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const promise = lazy<string>(
        (resolve) => {
          timer = setTimeout(() => resolve('done'), 20);
          return teardown;
        },
        { resettable: true },
      );

      return { promise, teardown, stop: () => clearTimeout(timer) };
    }

    it('keeps the work running when one of two consumers leaves', async () => {
      const { promise, teardown } = resettableWork();
      const first = promise.then((value) => value) as CancelablePromise<string>;
      const second = promise.then((value) => value);

      void first.cancel();

      await expect(second).resolves.toBe('done');
      expect(isCancelError((await settle(first)).reason)).toBe(true);
      expect(teardown).not.toHaveBeenCalled();
    });

    it('cancels the work once both consumers leave', async () => {
      const { promise, teardown, stop } = resettableWork();
      const first = promise.then((value) => value) as CancelablePromise<string>;
      const second = promise.then((value) => value) as CancelablePromise<string>;

      void first.cancel();
      void second.cancel();
      stop();

      expect(teardown).toHaveBeenCalledTimes(1);
      expect(promise.started).toBe(false);
    });

    it('cancels every consumer on a direct cancel', async () => {
      const { promise, teardown, stop } = resettableWork();
      const first = settle(promise);
      const second = settle(promise);

      promise.cancel();
      stop();

      expect(isCancelError((await first).reason)).toBe(true);
      expect(isCancelError((await second).reason)).toBe(true);
      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });
});
