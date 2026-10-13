import { CancelablePromise } from './cancelable-promise';

const NativePromise = Promise;

async function drainMicrotasks(turns = 10): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await NativePromise.resolve();
  }
}

// one host turn: jest fails the running case on an unhandled rejection reported by then
function hostTurn(): Promise<void> {
  return new NativePromise((resolve) => setImmediate(resolve));
}

function pending<T>(): {
  promise: CancelablePromise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new CancelablePromise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('result returned to a canceled then child', () => {
  it('cancels a cancelable returned after the parent was already fulfilled', async () => {
    const work = new CancelablePromise<number>(() => undefined);
    const onFulfilled = jest.fn(() => work);
    const child = CancelablePromise.resolve(1).then(onFulfilled);
    void child.cancel();
    child.catch(() => undefined);

    await drainMicrotasks();

    expect(onFulfilled).toHaveBeenCalledTimes(1);
    expect(work.canceled).toBe(true);
  });

  it('cancels a cancelable returned once a shared parent fulfills', async () => {
    const parent = pending<number>();
    parent.promise.then(() => undefined);
    const work = new CancelablePromise<number>(() => undefined);
    const onWorkCancel = jest.fn();
    work.handleCancel(onWorkCancel);
    const onFulfilled = jest.fn(() => work);
    const child = parent.promise.then(onFulfilled);
    void child.cancel();
    child.catch(() => undefined);

    parent.resolve(1);
    await drainMicrotasks();

    expect(onFulfilled).toHaveBeenCalledTimes(1);
    expect(work.canceled).toBe(true);
    expect(onWorkCancel).toHaveBeenCalledTimes(1);
  });

  it('absorbs a rejected foreign promise returned by the callback', async () => {
    const parent = pending<number>();
    parent.promise.then(() => undefined);
    const onFulfilled = jest.fn(() => NativePromise.reject(new Error('late')));
    const child = parent.promise.then(onFulfilled);
    void child.cancel();
    child.catch(() => undefined);

    parent.resolve(1);
    await drainMicrotasks();
    await hostTurn();

    expect(onFulfilled).toHaveBeenCalledTimes(1);
  });
});

describe('result returned to a canceled finally child', () => {
  it('reports nothing unhandled when a shared parent rejects later', async () => {
    const parent = pending<number>();
    parent.promise.catch(() => undefined);
    const onFinally = jest.fn();
    const child = parent.promise.finally(onFinally);
    child.catch(() => undefined);
    void child.cancel();

    parent.reject(new Error('shared'));
    await drainMicrotasks();
    await hostTurn();

    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('reports nothing unhandled when the finally callback rejects', async () => {
    const parent = new CancelablePromise<number>(() => undefined);
    const onFinally = jest.fn(() => NativePromise.reject(new Error('cleanup failed')));
    const child = parent.finally(onFinally);
    child.catch(() => undefined);
    void child.cancel();

    await drainMicrotasks();
    await hostTurn();

    expect(parent.canceled).toBe(true);
    expect(onFinally).toHaveBeenCalledTimes(1);
  });
});

// the child is canceled before its callback runs, so whatever the callback returns is orphaned
function returnToCanceledChild<T>(result: () => T): CancelablePromise<unknown> {
  const child = CancelablePromise.resolve(1).then(result);
  void child.cancel();
  child.catch(() => undefined);
  return child;
}

describe('cancelable returned to a canceled child is released, not canceled', () => {
  it('keeps a shared source alive for its other consumer', async () => {
    const work = pending<number>();
    const consumer = work.promise.then((value) => value);

    returnToCanceledChild(() => work.promise);
    await drainMicrotasks();
    work.resolve(42);

    await expect(consumer).resolves.toBe(42);
    expect(work.promise.canceled).toBe(false);
    await hostTurn();
  });

  it('cancels a source the child was the sole consumer of, with a bubbled reason', async () => {
    const onCancel = jest.fn();
    const work = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
      handleCancel(onCancel);
    });
    const outcome = NativePromise.prototype.then.call(work, undefined, (reason: unknown) => reason);

    returnToCanceledChild(() => work);
    await drainMicrotasks();

    expect(work.canceled).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    const reason = (await outcome) as { name?: string; bubbled?: boolean };
    expect(reason.name).toBe('CancelError');
    expect(reason.bubbled).toBe(true);
    await hostTurn();
  });

  it('leaves a sole source with bubble off pending', async () => {
    const work = new CancelablePromise<number>(() => undefined, { bubble: false });

    returnToCanceledChild(() => work);
    await drainMicrotasks();
    await hostTurn();

    expect(work.canceled).toBe(false);
    expect(work.cancelable).toBe(true);
  });

  it('leaves a shielded sole source pending', async () => {
    const work = new CancelablePromise<number>(() => undefined, { shield: true });

    returnToCanceledChild(() => work);
    await drainMicrotasks();
    await hostTurn();

    expect(work.canceled).toBe(false);
    expect(work.cancelable).toBe(true);
  });

  it('cancels a source whose only other consumer is already canceled', async () => {
    const work = new CancelablePromise<number>(() => undefined);
    const consumer = work.then((value) => value);
    consumer.catch(() => undefined);
    void consumer.cancel();

    returnToCanceledChild(() => work);
    await drainMicrotasks();
    await hostTurn();

    expect(work.canceled).toBe(true);
  });

  it('cancels a source once its other consumer is canceled after the release', async () => {
    const work = new CancelablePromise<number>(() => undefined);
    const consumer = work.then((value) => value);
    consumer.catch(() => undefined);

    returnToCanceledChild(() => work);
    await drainMicrotasks();
    expect(work.canceled).toBe(false);

    void consumer.cancel();
    await drainMicrotasks();
    await hostTurn();

    expect(work.canceled).toBe(true);
  });

  it('lets any() fulfill when the executor resolves with its input after cancel', async () => {
    let resolveOuter!: (value: CancelablePromise<number>) => void;
    const outer = new CancelablePromise<CancelablePromise<number>>((resolve) => {
      resolveOuter = resolve;
    });
    outer.catch(() => undefined);
    const work = pending<number>();
    const first = CancelablePromise.any([work.promise]);

    void outer.cancel();
    resolveOuter(work.promise);
    await drainMicrotasks();
    work.resolve(42);

    await expect(first).resolves.toBe(42);
    expect(work.promise.canceled).toBe(false);
    await hostTurn();
  });

  it('strict source that already settled does not throw', async () => {
    const work = new CancelablePromise<number>((resolve) => resolve(5), { strict: true });

    returnToCanceledChild(() => work);
    await drainMicrotasks();
    await hostTurn();

    await expect(work).resolves.toBe(5);
  });

  it('strict shielded source does not throw and stays pending', async () => {
    const work = new CancelablePromise<number>(() => undefined, { strict: true, shield: true });

    returnToCanceledChild(() => work);
    await drainMicrotasks();
    await hostTurn();

    expect(work.cancelable).toBe(true);
  });
});

describe('foreign values returned to a canceled child', () => {
  const brand = Symbol.for('@cancjs/promise:CancelablePromise');

  it('releases a branded copy through its _chain, never its cancel', async () => {
    const fake = {
      [brand]: true,
      _chain: jest.fn(),
      _subscribe: jest.fn(),
      cancel: jest.fn(),
      then: jest.fn(),
    };

    returnToCanceledChild(() => fake);
    await drainMicrotasks();
    await hostTurn();

    expect(fake._chain).toHaveBeenCalledTimes(1);
    const standIn = fake._chain.mock.calls[0][0] as CancelablePromise<unknown>;
    expect(standIn.canceled).toBe(true);
    expect(fake.cancel).not.toHaveBeenCalled();
    expect(fake.then).not.toHaveBeenCalled();
  });

  it('cancels the then view of a brand-only copy, not the source', async () => {
    const view = { cancel: jest.fn(), then: jest.fn() };
    const fake = {
      [brand]: true,
      cancel: jest.fn(),
      then: jest.fn(() => view),
    };

    returnToCanceledChild(() => fake);
    await drainMicrotasks();
    await hostTurn();

    expect(fake.then).toHaveBeenCalledTimes(1);
    expect(view.cancel).toHaveBeenCalledTimes(1);
    expect(fake.cancel).not.toHaveBeenCalled();
  });

  it('swallows a throwing view cancel of a brand-only copy', async () => {
    const view = {
      cancel: jest.fn(() => {
        throw new Error('strict');
      }),
    };
    const fake = { [brand]: true, cancel: jest.fn(), then: jest.fn(() => view) };

    returnToCanceledChild(() => fake);
    await drainMicrotasks();
    await hostTurn();

    expect(view.cancel).toHaveBeenCalledTimes(1);
    expect(fake.cancel).not.toHaveBeenCalled();
  });

  it('reads the then getter of a plain returned object once', async () => {
    let reads = 0;
    const thenable = {
      get then() {
        reads++;
        return (_onFulfilled: unknown, onRejected: (reason: unknown) => void) => onRejected(new Error('late'));
      },
    };

    returnToCanceledChild(() => thenable);
    await drainMicrotasks();
    await hostTurn();

    expect(reads).toBe(1);
  });
});
