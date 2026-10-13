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
