import { CancelablePromise } from './cancelable-promise';
import { isCancelError } from './helpers';

const NativePromise = Promise;
const hostTurn = (): Promise<void> => new NativePromise((resolve) => setImmediate(resolve));

// eslint-disable-next-line @typescript-eslint/no-implied-eval -- preserve engine-native await timing
const nativeAwaitBoth = new Function(
  'first',
  'second',
  'return (async () => { await first; return await second; })();',
) as (first: PromiseLike<unknown>, second: PromiseLike<number>) => Promise<number>;

function pendingNumber(options?: { forceCancelable?: boolean; asyncCancel?: boolean }) {
  let resolve!: (value: number) => void;
  let canceled = 0;
  const promise = new CancelablePromise<number>((res, _reject, { handleCancel }) => {
    resolve = res;
    handleCancel(() => {
      canceled++;
    });
  }, options);
  return { promise, resolve, canceled: () => canceled };
}

const modes = [false, true] as const;
const orders = ['winner-first', 'loser-first'] as const;

describe('race loser immediate native-await continuation', () => {
  it.each(modes.flatMap((asyncCancel) => orders.map((order) => ({ asyncCancel, order }))))(
    'keeps loser after primitive winner, asyncCancel=$asyncCancel $order',
    async ({ asyncCancel, order }) => {
      const loser = pendingNumber();
      const inputs = order === 'winner-first' ? [1, loser.promise] : [loser.promise, 1];
      const race = CancelablePromise.race(inputs, { asyncCancel });
      const observed = nativeAwaitBoth(race, loser.promise);
      await hostTurn();
      expect(loser.canceled()).toBe(0);
      loser.resolve(37);
      await expect(observed).resolves.toBe(37);
    },
  );

  it.each(modes.flatMap((asyncCancel) => orders.map((order) => ({ asyncCancel, order }))))(
    'keeps loser after pre-settled CP winner, asyncCancel=$asyncCancel $order',
    async ({ asyncCancel, order }) => {
      const loser = pendingNumber();
      const winner = CancelablePromise.resolve(1);
      const inputs = order === 'winner-first' ? [winner, loser.promise] : [loser.promise, winner];
      const observed = nativeAwaitBoth(CancelablePromise.race(inputs, { asyncCancel }), loser.promise);
      await hostTurn();
      expect(loser.canceled()).toBe(0);
      loser.resolve(37);
      await expect(observed).resolves.toBe(37);
    },
  );

  it.each(modes)('keeps loser after pending CP winner, asyncCancel=%s', async (asyncCancel) => {
    const loser = pendingNumber();
    const winner = pendingNumber();
    const observed = nativeAwaitBoth(
      CancelablePromise.race([loser.promise, winner.promise], { asyncCancel }),
      loser.promise,
    );
    winner.resolve(1);
    await hostTurn();
    expect(loser.canceled()).toBe(0);
    loser.resolve(37);
    await expect(observed).resolves.toBe(37);
  });

  it.each(modes)('keeps loser after native resolved winner, asyncCancel=%s', async (asyncCancel) => {
    const loser = pendingNumber();
    const observed = nativeAwaitBoth(
      CancelablePromise.race([NativePromise.resolve(1), loser.promise], { asyncCancel }),
      loser.promise,
    );
    await hostTurn();
    expect(loser.canceled()).toBe(0);
    loser.resolve(37);
    await expect(observed).resolves.toBe(37);
  });

  it.each(modes)(
    'cancels unobserved loser exactly once after primitive winner, asyncCancel=%s',
    async (asyncCancel) => {
      const loser = pendingNumber();
      await CancelablePromise.race([1, loser.promise], { asyncCancel });
      await hostTurn();
      expect(loser.canceled()).toBe(1);
    },
  );

  it.each(modes)('preserves independently observed loser, asyncCancel=%s', async (asyncCancel) => {
    const loser = pendingNumber();
    const observer = loser.promise.then((value) => value);
    await CancelablePromise.race([1, loser.promise], { asyncCancel });
    await hostTurn();
    expect(loser.canceled()).toBe(0);
    loser.resolve(37);
    await expect(observer).resolves.toBe(37);
  });

  it.each(modes)('next-turn loser observer is too late, asyncCancel=%s', async (asyncCancel) => {
    const loser = pendingNumber();
    await CancelablePromise.race([1, loser.promise], { asyncCancel });
    await hostTurn();
    expect(loser.canceled()).toBe(1);
    const reason = await loser.promise.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isCancelError(reason)).toBe(true);
  });

  it.each(modes)(
    'force-pending winner remains pending until native gate releases, asyncCancel=%s',
    async (asyncCancel) => {
      let release!: (value: number) => void;
      const nativeGate = new NativePromise<number>((resolve) => {
        release = resolve;
      });
      const winner = new CancelablePromise<number>((resolve) => resolve(nativeGate), { forceCancelable: false });
      const loser = pendingNumber();
      expect(winner.cancelable).toBe(false);
      let raceSettled = false;
      const race = CancelablePromise.race([winner, loser.promise], { asyncCancel });
      race.then(() => {
        raceSettled = true;
      });
      await NativePromise.resolve();
      expect(raceSettled).toBe(false);
      const observed = nativeAwaitBoth(race, loser.promise);
      release(1);
      await hostTurn();
      expect(loser.canceled()).toBe(0);
      loser.resolve(37);
      await expect(observed).resolves.toBe(37);
    },
  );

  it.each(modes.flatMap((asyncCancel) => orders.map((order) => ({ asyncCancel, order }))))(
    'releases an unobserved force-pending loser once, asyncCancel=$asyncCancel $order',
    async ({ asyncCancel, order }) => {
      let release!: (value: number) => void;
      const nativeGate = new NativePromise<number>((resolve) => {
        release = resolve;
      });
      const winner = new CancelablePromise<number>((resolve) => resolve(nativeGate), { forceCancelable: false });
      const loser = pendingNumber();
      const inputs = order === 'winner-first' ? [winner, loser.promise] : [loser.promise, winner];
      const race = CancelablePromise.race(inputs, { asyncCancel });
      expect(winner.cancelable).toBe(false);
      release(1);
      await expect(race).resolves.toBe(1);
      await hostTurn();
      expect(loser.canceled()).toBe(1);
    },
  );

  it.each(modes)('does not rescue a force-pending loser observed in next turn, asyncCancel=%s', async (asyncCancel) => {
    let release!: (value: number) => void;
    const nativeGate = new NativePromise<number>((resolve) => {
      release = resolve;
    });
    const winner = new CancelablePromise<number>((resolve) => resolve(nativeGate), { forceCancelable: false });
    const loser = pendingNumber();
    const race = CancelablePromise.race([loser.promise, winner], { asyncCancel });
    release(1);
    await expect(race).resolves.toBe(1);
    await hostTurn();
    expect(loser.canceled()).toBe(1);
  });

  it.each(modes)('cancels race before force-pending winner settles, asyncCancel=%s', async (asyncCancel) => {
    let release!: (value: number) => void;
    const nativeGate = new NativePromise<number>((resolve) => {
      release = resolve;
    });
    const winner = new CancelablePromise<number>((resolve) => resolve(nativeGate), { forceCancelable: false });
    const loser = pendingNumber();
    const race = CancelablePromise.race([winner, loser.promise], { asyncCancel });
    const rejected = race.then(
      () => undefined,
      (error: unknown) => error,
    );
    void race.cancel();
    await hostTurn();
    expect(loser.canceled()).toBe(1);
    expect(isCancelError(await rejected)).toBe(true);
    release(1);
  });

  it.each(modes)('lets a direct then callback consume the loser, asyncCancel=%s', async (asyncCancel) => {
    const loser = pendingNumber();
    const observed = CancelablePromise.race([1, loser.promise], { asyncCancel }).then(() => loser.promise);
    await hostTurn();
    expect(loser.canceled()).toBe(0);
    loser.resolve(37);
    await expect(observed).resolves.toBe(37);
  });
});
