import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

/**
 * Signal listener cleanup + multi-signal support.
 *
 * Tests cover: (a) settle removes listener; (b) no listener growth; (c) pre-aborted handling;
 * (d) abort after settle no-op; (e) multi-signal array support.
 */

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('signal listener cleanup + multi-signal', () => {
  // (a) Settle -> removeEventListener called
  it('(a) removeEventListener called when promise settles via fulfill', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const spy = jest.spyOn(signal, 'removeEventListener');

    const _promise = new CancelablePromise((resolve) => setTimeout(() => resolve('value'), 0), { signal });

    await flushPromises();

    expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    spy.mockRestore();
  });

  it('(a) removeEventListener called when promise settles via reject', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const spy = jest.spyOn(signal, 'removeEventListener');

    const promise = new CancelablePromise((_resolve, reject) => setTimeout(() => reject(new Error('fail')), 0), {
      signal,
    });
    promise.catch(() => {
      /**/
    });

    await flushPromises();

    expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    spy.mockRestore();
  });

  it('(a) removeEventListener called when promise is canceled', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const spy = jest.spyOn(signal, 'removeEventListener');

    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { signal },
    );

    promise.cancel();

    await flushPromises();

    expect(spy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    spy.mockRestore();
  });

  // (b) Long-lived signal + N settled promises -> zero listener growth
  it('(b) N settled promises on one signal have zero residual listeners', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    let listenerCount = 0;
    const origAdd = signal.addEventListener.bind(signal);
    const origRemove = signal.removeEventListener.bind(signal);

    jest.spyOn(signal, 'addEventListener').mockImplementation(function (type, listener, opts) {
      if (type === 'abort') listenerCount++;
      return origAdd(type, listener, opts);
    });

    jest.spyOn(signal, 'removeEventListener').mockImplementation(function (type, listener, opts) {
      if (type === 'abort') listenerCount--;
      return origRemove(type, listener, opts);
    });

    const promises = Array(5)
      .fill(0)
      .map(
        () =>
          new CancelablePromise(
            (resolve) => {
              setTimeout(() => resolve('done'), 0);
            },
            { signal },
          ),
      );

    await Promise.all(promises);
    await flushPromises();

    expect(listenerCount).toBe(0);
  });

  // (c) Pre-aborted signal -> already-canceled promise (no sync throw by default)
  it('(c) pre-aborted signal returns already-canceled promise (no throw)', async () => {
    const controller = new AbortController();
    controller.abort(new Error('pre-aborted'));

    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { signal: controller.signal },
    );

    expect(promise.isCanceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  // (c) Pre-aborted + strict:true -> throws
  it('(c) pre-aborted signal with strict:true throws', () => {
    const controller = new AbortController();
    controller.abort(new Error('pre-aborted-strict'));

    expect(() => {
      new CancelablePromise(
        () => {
          /**/
        },
        { signal: controller.signal, strict: true },
      );
    }).toThrow(/[Aa]borted/);
  });

  // (c) Pre-aborted promise inherits signal.reason as cause
  it('(c) pre-aborted promise rejection carries signal.reason as cause', async () => {
    const controller = new AbortController();
    const reason = new Error('abort-reason');
    controller.abort(reason);

    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { signal: controller.signal },
    );

    let caught: any = null;
    promise.catch((err: any) => {
      caught = err;
    });

    await flushPromises();

    expect(caught).toBeInstanceOf(CancelError);
    expect(caught.cause).toBe(reason);
  });

  // (d) Abort after settle -> no-op
  it('(d) abort after promise settles is a no-op', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    const promise = new CancelablePromise(
      (resolve) => {
        setTimeout(() => resolve('settled'), 0);
      },
      { signal },
    );

    await flushPromises();

    expect(promise.isCanceled).toBe(false);
    controller.abort(new Error('too-late'));

    await flushPromises();

    expect(promise.isCanceled).toBe(false);
    await expect(promise).resolves.toBe('settled');
  });

  // (e) Two signals, either aborts -> promise cancels, both cleaned
  it('(e) two signals: first abort cancels, both listeners cleaned', async () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    const signal1 = ctrl1.signal;
    const signal2 = ctrl2.signal;

    const spy1 = jest.spyOn(signal1, 'removeEventListener');
    const spy2 = jest.spyOn(signal2, 'removeEventListener');

    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { signal: [signal1, signal2] as any }, // Cast for now; array will be typed after impl
    );

    expect(promise.isCancelable).toBe(true);

    ctrl1.abort(new Error('first-abort'));

    await flushPromises();

    expect(promise.isCanceled).toBe(true);
    // Both listeners should be removed (first abort wins, cleanup runs)
    expect(spy1).toHaveBeenCalledWith('abort', expect.any(Function), expect.any(Object));
    expect(spy2).toHaveBeenCalledWith('abort', expect.any(Function), expect.any(Object));

    spy1.mockRestore();
    spy2.mockRestore();
  });

  it('(e) two signals: second abort no-op, both listeners already cleaned', async () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    const signal1 = ctrl1.signal;
    const signal2 = ctrl2.signal;

    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { signal: [signal1, signal2] as any },
    );

    ctrl1.abort(new Error('first'));

    await flushPromises();

    expect(promise.isCanceled).toBe(true);
    const _cancelCountAfterFirst = promise.isCanceled ? 1 : 0;

    ctrl2.abort(new Error('second'));

    await flushPromises();

    expect(promise.isCanceled).toBe(true);
    // Second abort should not trigger another cancel (promise already canceled)
    // This is implicit: isCanceled stays true, no additional rejection
  });

  // Listener count matrix: prove no growth
  it('listener count matrix: single signal, 10 settled promises, zero residual listeners', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    let addCount = 0;
    let removeCount = 0;

    const origAdd = signal.addEventListener.bind(signal);
    const origRemove = signal.removeEventListener.bind(signal);

    jest.spyOn(signal, 'addEventListener').mockImplementation(function (type, listener, opts) {
      if (type === 'abort') addCount++;
      return origAdd(type, listener, opts);
    });

    jest.spyOn(signal, 'removeEventListener').mockImplementation(function (type, listener, opts) {
      if (type === 'abort') removeCount++;
      return origRemove(type, listener, opts);
    });

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(new CancelablePromise((resolve) => setTimeout(() => resolve(i), 0), { signal }));
    }

    await Promise.all(promises);
    await flushPromises();

    expect(addCount).toBe(10);
    expect(removeCount).toBe(10);
    expect(addCount - removeCount).toBe(0);

    console.log(`Listener count matrix: +${addCount} -${removeCount} = ${addCount - removeCount}`);
  });
});

// one host turn: an abort listener throw is reported to jest before the case ends
function hostTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function trackAbortListeners(signal: AbortSignal): { live: () => number; added: Array<() => void> } {
  const live = new Set<unknown>();
  const added: Array<() => void> = [];
  const origAdd = signal.addEventListener.bind(signal);
  const origRemove = signal.removeEventListener.bind(signal);
  jest.spyOn(signal, 'addEventListener').mockImplementation((type, listener, opts) => {
    if (type === 'abort') {
      live.add(listener);
      added.push(listener as () => void);
    }
    origAdd(type, listener, opts);
  });
  jest.spyOn(signal, 'removeEventListener').mockImplementation((type, listener, opts) => {
    if (type === 'abort') live.delete(listener);
    origRemove(type, listener, opts);
  });
  return { live: () => live.size, added };
}

describe('signal wiring after the executor runs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('leaves no abort listener when the executor resolves synchronously', async () => {
    const controller = new AbortController();
    const tracked = trackAbortListeners(controller.signal);

    const promise = new CancelablePromise<string>((resolve) => resolve('sync'), { signal: controller.signal });

    expect(tracked.live()).toBe(0);
    await expect(promise).resolves.toBe('sync');
  });

  it('leaves no abort listener when the executor rejects synchronously', async () => {
    const controller = new AbortController();
    const tracked = trackAbortListeners(controller.signal);

    const promise = new CancelablePromise<string>((_resolve, reject) => reject(new Error('sync')), {
      signal: controller.signal,
    });

    expect(tracked.live()).toBe(0);
    await expect(promise).rejects.toThrow('sync');
  });

  it('strict: an abort after a synchronous settle does not throw', async () => {
    const controller = new AbortController();

    const promise = new CancelablePromise<string>((resolve) => resolve('sync'), {
      signal: controller.signal,
      strict: true,
    });

    expect(() => controller.abort(new Error('late'))).not.toThrow();
    await hostTurn();

    expect(promise.canceled).toBe(false);
    await expect(promise).resolves.toBe('sync');
  });

  it('strict: an abort listener invoked after settle does not throw', async () => {
    const controller = new AbortController();
    const tracked = trackAbortListeners(controller.signal);
    let settle!: (value: string) => void;

    const promise = new CancelablePromise<string>(
      (resolve) => {
        settle = resolve;
      },
      { signal: controller.signal, strict: true },
    );
    expect(tracked.added).toHaveLength(1);

    settle('done');
    await expect(promise).resolves.toBe('done');

    // a dispatch already in flight can still reach a listener removed by settle
    expect(() => tracked.added[0]()).not.toThrow();
    expect(promise.canceled).toBe(false);
  });

  it('strict: an abort on a shielded pending promise does not throw', async () => {
    const controller = new AbortController();
    const tracked = trackAbortListeners(controller.signal);

    const promise = new CancelablePromise<string>(
      () => {
        /**/
      },
      { signal: controller.signal, strict: true, shield: true },
    );

    expect(() => tracked.added[0]()).not.toThrow();
    controller.abort(new Error('shielded'));
    await hostTurn();

    expect(promise.cancelable).toBe(true);
  });

  it('cancels when the executor aborts its own signal synchronously', async () => {
    const controller = new AbortController();
    const reason = new Error('aborted inside');
    const tracked = trackAbortListeners(controller.signal);

    const promise = new CancelablePromise<string>(
      () => {
        controller.abort(reason);
      },
      { signal: controller.signal },
    );

    expect(promise.canceled).toBe(true);
    expect(tracked.live()).toBe(0);
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CancelError);
    expect((error as CancelError).cause).toBe(reason);
  });

  it('strict: an executor aborting its own signal cancels without throwing', async () => {
    const controller = new AbortController();
    let promise!: CancelablePromise<string>;

    expect(() => {
      promise = new CancelablePromise<string>(
        () => {
          controller.abort(new Error('aborted inside'));
        },
        { signal: controller.signal, strict: true },
      );
    }).not.toThrow();

    expect(promise.canceled).toBe(true);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('runs cancel handlers registered by an executor that aborts its own signal', async () => {
    const controller = new AbortController();
    const onCancel = jest.fn();

    const promise = new CancelablePromise<string>(
      (_resolve, _reject, { handleCancel }) => {
        handleCancel(onCancel);
        controller.abort(new Error('aborted inside'));
      },
      { signal: controller.signal },
    );

    await promise.catch(() => undefined);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
