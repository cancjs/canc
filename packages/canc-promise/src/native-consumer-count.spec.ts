import { CancelablePromise } from './cancelable-promise';
import { isCancelError } from './helpers';

const NativePromise = Promise;

function noop(): void {
  /**/
}

function pending<T>(options?: { asyncCancel?: boolean }, onCancel?: () => void | PromiseLike<unknown>) {
  let resolve: (value: T) => void = noop;
  const promise = new CancelablePromise<T>((res, _reject, { handleCancel }) => {
    resolve = res;
    if (onCancel) {
      handleCancel(onCancel);
    }
  }, options);
  return { promise, resolve };
}

function settled(promise: PromiseLike<unknown>): Promise<string> {
  return NativePromise.resolve(promise).then(
    (value) => `ok:${String(value)}`,
    (error: unknown) => (isCancelError(error) ? 'canceled' : 'rejected'),
  );
}

// records `read()` once per microtask, the first record lands one job after the call
function perTick<T>(count: number, read: () => T): Promise<T[]> {
  const seen: T[] = [];
  let chain = NativePromise.resolve();
  for (let i = 0; i < count; i++) {
    chain = chain.then(() => {
      seen.push(read());
    });
  }
  return chain.then(() => seen);
}

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 0));
}

// the es5 test build turns `async` into a helper that calls `then` at once, a real
// `await` subscribes one job later
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- needs an engine-native async function
const nativeAwait = new Function('value', 'return (async () => await value)();') as <T>(
  value: PromiseLike<T>,
) => Promise<T>;

// eslint-disable-next-line @typescript-eslint/no-implied-eval -- needs an engine-native async function
const nativeAwaitInTurn = new Function(
  'first',
  'second',
  'return (async () => { await first; return await second; })();',
) as <T>(first: PromiseLike<unknown>, second: PromiseLike<T>) => Promise<T>;

describe.each([
  ['awaitable cancel mode', true],
  ['sync cancel mode', false],
])('bubble with consumers of the same turn (%s)', (_mode, asyncCancel) => {
  const options = { asyncCancel };

  describe('a consumer subscribed in the same turn keeps the parent alive', () => {
    it('native await on a then child survives a same-turn cancel of its own child', async () => {
      const source = pending<number>(options);
      const view = source.promise.then((value) => value * 2);
      const awaiter = nativeAwait(view);

      view.then().cancel();
      await macrotask();

      expect(view.canceled).toBe(false);
      expect(source.promise.canceled).toBe(false);
      source.resolve(7);
      await expect(awaiter).resolves.toBe(14);
    });

    it('native await on the source after the cancel in the same turn', async () => {
      const source = pending<number>(options);
      const view = source.promise.then((value) => value);

      view.cancel();
      const awaiter = nativeAwait(source.promise);
      await macrotask();

      expect(source.promise.canceled).toBe(false);
      source.resolve(1);
      await expect(awaiter).resolves.toBe(1);
    });

    it('Promise.resolve of the source after the cancel in the same turn', async () => {
      const source = pending<number>(options);
      const view = source.promise.then((value) => value);

      view.cancel();
      const outcome = settled(NativePromise.resolve(source.promise));
      await macrotask();

      expect(source.promise.canceled).toBe(false);
      source.resolve(3);
      await expect(outcome).resolves.toBe('ok:3');
    });

    it('native Promise.all over the source after the cancel in the same turn', async () => {
      const source = pending<number>(options);
      const view = source.promise.then((value) => value);

      view.cancel();
      const outcome = settled(NativePromise.all([source.promise]));
      await macrotask();

      expect(source.promise.canceled).toBe(false);
      source.resolve(4);
      await expect(outcome).resolves.toBe('ok:4');
    });

    it('native await on the source before the cancel in the same turn', async () => {
      const onCancel = jest.fn();
      const source = pending<number>(options, onCancel);
      const awaiter = nativeAwait(source.promise);

      source.promise.then().cancel();
      await macrotask();

      expect(source.promise.canceled).toBe(false);
      expect(onCancel).not.toHaveBeenCalled();
      source.resolve(2);
      await expect(awaiter).resolves.toBe(2);
    });

    it('canc then on the source after the cancel in the same turn', async () => {
      const source = pending<number>(options);

      source.promise.then().cancel();
      const later = source.promise.then((value) => value + 1);
      await macrotask();

      expect(source.promise.canceled).toBe(false);
      source.resolve(5);
      await expect(later).resolves.toBe(6);
    });
  });

  describe('the last consumer still cancels its parent', () => {
    it('sole consumer cancel lands on the parent two microtasks later', async () => {
      const onCancel = jest.fn();
      const source = pending<number>(options, onCancel);
      const view = source.promise.then((value) => value);

      view.cancel();
      const seen = await perTick(2, () => [source.promise.canceled, onCancel.mock.calls.length]);

      expect(view.canceled).toBe(true);
      expect(seen).toEqual([
        [false, 0],
        [true, 1],
      ]);
      await macrotask();
      expect(onCancel).toHaveBeenCalledTimes(1);
      await expect(settled(source.promise)).resolves.toBe('canceled');
    });

    it('a leaf cancel cancels the whole chain by the second microtask', async () => {
      const source = pending<number>(options);
      const first = source.promise.then((value) => value);
      const second = first.then((value) => value);
      const leaf = second.then((value) => value);
      const chain = [source.promise, first, second];

      leaf.cancel();
      const seen = await perTick(2, () => chain.map((promise) => promise.canceled));

      expect(seen).toEqual([
        [false, false, false],
        [true, true, true],
      ]);
    });

    it('the bubble rejection is still marked bubbled', async () => {
      const source = pending<number>(options);

      source.promise.then().cancel();
      await macrotask();

      let caught: unknown;
      await source.promise.catch((error: unknown) => {
        caught = error;
      });
      expect(isCancelError(caught)).toBe(true);
      expect((caught as { bubbled?: boolean }).bubbled).toBe(true);
    });

    it('a consumer added in a later turn gets the cancel', async () => {
      const source = pending<number>(options);

      source.promise.then().cancel();
      await macrotask();

      expect(source.promise.canceled).toBe(true);
      await expect(settled(source.promise.then((value) => value))).resolves.toBe('canceled');
    });

    it('a parent settled before the bubble is decided stays settled', async () => {
      const source = pending<number>(options);

      source.promise.then().cancel();
      source.resolve(5);
      await macrotask();

      expect(source.promise.canceled).toBe(false);
      await expect(source.promise).resolves.toBe(5);
    });
  });

  describe('a race input awaited in the same turn as the race completion', () => {
    it('race canceled, then a native await on its input keeps the input alive', async () => {
      const input = pending<number>(options);
      const race = CancelablePromise.race([input.promise], options);

      void race.cancel();
      const awaiter = nativeAwait(input.promise);
      await macrotask();

      expect(input.promise.canceled).toBe(false);
      input.resolve(6);
      await expect(awaiter).resolves.toBe(6);
    });

    it('race settled by the winner, then a native await on the loser keeps the loser alive', async () => {
      const winner = pending<number>(options);
      const loser = pending<number>(options);
      const race = CancelablePromise.race([winner.promise, loser.promise], options);
      const awaiter = nativeAwaitInTurn(race, loser.promise);

      winner.resolve(1);
      await macrotask();

      expect(loser.promise.canceled).toBe(false);
      loser.resolve(2);
      await expect(awaiter).resolves.toBe(2);
    });

    it('an unconsumed race loser is canceled once the race settles', async () => {
      const winner = pending<number>(options);
      const loser = pending<number>(options);
      void CancelablePromise.race([winner.promise, loser.promise], options);

      winner.resolve(1);
      await macrotask();

      expect(loser.promise.canceled).toBe(true);
    });
  });
});

describe('a child from another copy of the package', () => {
  let OtherCopy: typeof CancelablePromise | undefined;
  jest.isolateModules(() => {
    OtherCopy = (
      require('./cancelable-promise') as {
        CancelablePromise: typeof CancelablePromise;
      }
    ).CancelablePromise;
  });
  const Foreign = OtherCopy!;

  // boxed, an async function would adopt the returned promise
  async function adoptedByForeign(source: CancelablePromise<number>): Promise<{ outer: CancelablePromise<number> }> {
    const outer = new Foreign<number>((resolve) => resolve(source));
    outer.catch(noop);
    await macrotask();
    return { outer };
  }

  it('native await on the parent in the same turn keeps it alive', async () => {
    const source = pending<number>();
    const { outer } = await adoptedByForeign(source.promise);

    void outer.cancel();
    const awaiter = nativeAwait(source.promise);
    await macrotask();

    expect(source.promise.canceled).toBe(false);
    source.resolve(8);
    await expect(awaiter).resolves.toBe(8);
  });

  it('a parent with another consumer left stays alive and the cancel still resolves', async () => {
    const onCancel = jest.fn();
    const source = pending<number>(undefined, onCancel);
    const sibling = source.promise.then((value) => value);
    const { outer } = await adoptedByForeign(source.promise);

    await expect(outer.cancel()).resolves.toEqual(expect.any(Array));
    await macrotask();

    expect(source.promise.canceled).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    source.resolve(9);
    await expect(sibling).resolves.toBe(9);
  });

  it('the sole foreign consumer cancel lands on the parent two microtasks later', async () => {
    const onCancel = jest.fn();
    const source = pending<number>(undefined, onCancel);
    const { outer } = await adoptedByForeign(source.promise);

    void outer.cancel();
    const seen = await perTick(2, () => source.promise.canceled);

    expect(seen).toEqual([false, true]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('awaited cancel and the deferred bubble', () => {
  it('await leaf.cancel() waits for a two-tick cleanup of the source', async () => {
    let cleanedUp = false;
    const source = pending<number>(undefined, () =>
      NativePromise.resolve()
        .then(noop)
        .then(() => {
          cleanedUp = true;
        }),
    );
    const leaf = source.promise.then((value) => value).then((value) => value);

    await leaf.cancel();

    expect(source.promise.canceled).toBe(true);
    expect(cleanedUp).toBe(true);
  });

  it('the cleanup result lists the source cleanup, not the deferred job', async () => {
    const source = pending<number>(undefined, () => NativePromise.resolve('source cleanup'));
    const view = source.promise.then((value) => value);

    const results = await view.cancel();

    // the source handler in place of the deferred job, then the view's own bubble handler
    expect(results).toEqual([
      { status: 'fulfilled', value: 'source cleanup' },
      { status: 'fulfilled', value: undefined },
    ]);
  });
});
