import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { lazy, LazyPromise, toAbortSignal } from './index';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface IProbe<T> {
  promise: LazyPromise<T>;
  runs: () => number;
  canceled: jest.Mock;
  settle: (value: T) => void;
}

// a lazy whose settlement the test drives, recording runs and cancels
function probe<T>(teardownForm: 'handleCancel' | 'returned' = 'handleCancel'): IProbe<T> {
  let runs = 0;
  let settle: (value: T) => void = () => undefined;
  const canceled = jest.fn();
  const promise = lazy<T>((resolve, _reject, handleCancel) => {
    runs++;
    settle = (value) => resolve(value);

    if (teardownForm === 'returned') {
      return canceled;
    }

    handleCancel(canceled);
  });

  return { promise, runs: () => runs, canceled, settle: (value) => settle(value) };
}

describe('LazyPromise combinators with lazy inputs', () => {
  it('race cancels a started lazy loser once the winner settles', async () => {
    const winner = probe<string>();
    const loser = probe<string>();
    winner.promise.execute();
    loser.promise.execute();

    const raced = LazyPromise.race([winner.promise, loser.promise]);
    const result = raced.then((value) => value);
    winner.settle('win');

    await expect(result).resolves.toBe('win');
    await flush();
    expect(loser.canceled).toHaveBeenCalledTimes(1);
    expect(winner.canceled).not.toHaveBeenCalled();
  });

  it('race runs a teardown the loser executor returned', async () => {
    const winner = probe<string>();
    const loser = probe<string>('returned');

    const result = LazyPromise.race([winner.promise, loser.promise]).then((value) => value);
    await flush();
    winner.settle('win');

    await expect(result).resolves.toBe('win');
    await flush();
    expect(loser.canceled).toHaveBeenCalledTimes(1);
  });

  it('race never starts a lazy that cannot win against a settled one before it', async () => {
    const winner = probe<string>();
    const loser = probe<string>();
    winner.promise.execute();
    winner.settle('win');
    await flush();

    await expect(LazyPromise.race([winner.promise, loser.promise])).resolves.toBe('win');
    await flush();
    expect(loser.runs()).toBe(0);
    expect(loser.promise.started).toBe(false);
  });

  it('race leaves a loser running while another consumer still holds it', async () => {
    const winner = probe<string>();
    const loser = probe<string>();
    const elsewhere = loser.promise.then((value) => value);

    const result = LazyPromise.race([winner.promise, loser.promise]).then((value) => value);
    await flush();
    winner.settle('win');

    await expect(result).resolves.toBe('win');
    await flush();
    expect(loser.canceled).not.toHaveBeenCalled();
    loser.settle('late');
    await expect(elsewhere).resolves.toBe('late');
  });

  it('any cancels the lazy inputs still running once one fulfills', async () => {
    const winner = probe<string>();
    const loser = probe<string>();

    const result = LazyPromise.any([winner.promise, loser.promise]).then((value) => value);
    await flush();
    winner.settle('win');

    await expect(result).resolves.toBe('win');
    await flush();
    expect(loser.canceled).toHaveBeenCalledTimes(1);
  });

  it('all cancels the other lazy inputs once one rejects', async () => {
    const failing = lazy<string>((_resolve, reject) => reject(new Error('boom')));
    const pending = probe<string>();

    await expect(LazyPromise.all([pending.promise, failing])).rejects.toThrow('boom');
    await flush();
    expect(pending.canceled).toHaveBeenCalledTimes(1);
  });

  it('all reaches its lazy inputs when the aggregate is canceled', async () => {
    const first = probe<string>();
    const second = probe<string>();
    const aggregate = LazyPromise.all([first.promise, second.promise]);
    const result = aggregate.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    await flush();

    aggregate.cancel();

    expect(isCancelError(await result)).toBe(true);
    await flush();
    expect(first.canceled).toHaveBeenCalledTimes(1);
    expect(second.canceled).toHaveBeenCalledTimes(1);
  });

  it('keeps lazy inputs cold until the aggregate is subscribed', () => {
    const first = probe<string>();
    const second = probe<string>();

    LazyPromise.race([first.promise, second.promise]);
    LazyPromise.all([first.promise, second.promise]);

    expect(first.runs() + second.runs()).toBe(0);
  });
});

describe('toAbortSignal with a lazy promise', () => {
  it('does not start the executor', async () => {
    const work = probe<string>();

    const signal = toAbortSignal(work.promise);
    await flush();

    expect(work.runs()).toBe(0);
    expect(signal.aborted).toBe(false);
  });

  it('starts the executor once the lazy is awaited', async () => {
    const work = probe<string>();
    const signal = toAbortSignal(work.promise);
    await flush();
    expect(work.runs()).toBe(0);

    const result = work.promise.then((value) => value);
    await flush();
    expect(work.runs()).toBe(1);

    work.settle('done');
    await expect(result).resolves.toBe('done');
    expect(signal.aborted).toBe(false);
  });

  it('aborts on a cancel before the lazy starts', () => {
    const work = probe<string>();
    const signal = toAbortSignal(work.promise);

    work.promise.cancel();

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(work.runs()).toBe(0);
  });

  it('aborts at once for a lazy already canceled before it started', () => {
    const work = probe<string>();
    work.promise.cancel();

    const signal = toAbortSignal(work.promise);

    expect(signal.aborted).toBe(true);
    expect(work.runs()).toBe(0);
  });

  it('aborts on a cancel once the lazy runs and stays quiet on fulfillment', async () => {
    const canceledWork = probe<string>();
    const canceledSignal = toAbortSignal(canceledWork.promise);
    const consumer = canceledWork.promise.then(
      () => undefined,
      () => undefined,
    );
    void canceledWork.promise.cancel();
    await consumer;
    expect(canceledSignal.aborted).toBe(true);

    const fulfilledWork = probe<string>();
    const fulfilledSignal = toAbortSignal(fulfilledWork.promise);
    const done = fulfilledWork.promise.then((value) => value);
    fulfilledWork.settle('ok');
    await expect(done).resolves.toBe('ok');
    expect(fulfilledSignal.aborted).toBe(false);
  });
});

describe('README lazy race example', () => {
  it('starts both at the await and cancels the slower one', async () => {
    const fetchFromA = jest.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve('a'), 0)));
    const slowCanceled = jest.fn();
    const fetchFromB = jest.fn(
      () =>
        new CancelablePromise<string>((resolve, _reject, { handleCancel }) => {
          const timer = setTimeout(() => resolve('b'), 1000);
          handleCancel(() => {
            clearTimeout(timer);
            slowCanceled();
          });
        }),
    );

    const fastest = LazyPromise.race([LazyPromise.try(fetchFromA), LazyPromise.try(fetchFromB)]);
    expect(fetchFromA).not.toHaveBeenCalled();

    await expect(fastest).resolves.toBe('a');
    await flush();
    expect(fetchFromB).toHaveBeenCalledTimes(1);
    expect(slowCanceled).toHaveBeenCalledTimes(1);
  });
});
