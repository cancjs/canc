import { getEventListeners } from 'events';

import { CancelablePromise, ICancelablePromiseOptions } from './cancelable-promise';

const NativePromise = Promise;

// bubble decisions land a few jobs after the trigger, a host turn covers every hop
function hostTurn(): Promise<void> {
  return new NativePromise((resolve) => setImmediate(resolve));
}

async function settleAll(turns = 3): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await hostTurn();
  }
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

function swallow(promise: PromiseLike<unknown>): void {
  void promise.then(undefined, () => undefined);
}

function handlerCount(promise: CancelablePromise<any, any>): number {
  const handlers = (promise as unknown as { _cancelHandlers?: unknown[] })._cancelHandlers;
  return handlers ? handlers.length : 0;
}

type Kind = 'all' | 'allSettled' | 'any' | 'race';

function combine(kind: Kind, inputs: CancelablePromise<any, any>[]): CancelablePromise<any, any> {
  switch (kind) {
    case 'all':
      return CancelablePromise.all(inputs);
    case 'allSettled':
      return CancelablePromise.allSettled(inputs);
    case 'any':
      return CancelablePromise.any(inputs);
    default:
      return CancelablePromise.race(inputs);
  }
}

// what makes the result give up the target input without canceling the result itself
function settleOther(kind: Kind, other: ReturnType<typeof pending<string>>): void {
  if (kind === 'all') {
    other.reject(new Error('first reject'));
  } else {
    other.resolve('first win');
  }
}

const kinds: Kind[] = ['all', 'allSettled', 'any', 'race'];

describe('combinator inputs follow consumer counting', () => {
  describe.each(kinds)('%s()', (kind) => {
    describe('result.cancel', () => {
      it('cancels an input the combinator holds alone', async () => {
        const target = pending<string>();
        const result = combine(kind, [target.promise]);
        swallow(result);

        void result.cancel();
        await settleAll();

        expect(result.isCanceled).toBe(true);
        expect(target.promise.isCanceled).toBe(true);
      });

      it('keeps a shared input alive and hands its value to the other consumer', async () => {
        const target = pending<string>();
        const consumer = target.promise.then((value) => value);
        const result = combine(kind, [target.promise]);
        swallow(result);

        void result.cancel();
        await settleAll();

        expect(target.promise.isCanceled).toBe(false);
        target.resolve('shared value');
        await expect(consumer).resolves.toBe('shared value');
      });

      it('cancels a shared input once the other consumer is gone too', async () => {
        const target = pending<string>();
        const consumer = target.promise.then((value) => value);
        swallow(consumer);
        const result = combine(kind, [target.promise]);
        swallow(result);

        void result.cancel();
        await settleAll();
        expect(target.promise.isCanceled).toBe(false);

        void consumer.cancel();
        await settleAll();
        expect(target.promise.isCanceled).toBe(true);
      });
    });

    describe('first reject or win', () => {
      // allSettled waits for every input, it has no losers to give up
      const losesTarget = kind !== 'allSettled';

      it(`${losesTarget ? 'cancels' : 'keeps'} an input the combinator holds alone`, async () => {
        const target = pending<string>();
        const other = pending<string>();
        const result = combine(kind, [target.promise, other.promise]);
        swallow(result);

        settleOther(kind, other);
        await settleAll();

        expect(target.promise.isCanceled).toBe(losesTarget);
        if (!losesTarget) {
          void result.cancel();
          await settleAll();
        }
      });

      it('keeps a shared input alive and hands its value to the other consumer', async () => {
        const target = pending<string>();
        const consumer = target.promise.then((value) => value);
        const other = pending<string>();
        const result = combine(kind, [target.promise, other.promise]);
        swallow(result);

        settleOther(kind, other);
        await settleAll();

        expect(target.promise.isCanceled).toBe(false);
        target.resolve('shared value');
        await expect(consumer).resolves.toBe('shared value');
      });

      it(`${losesTarget ? 'cancels' : 'keeps'} a shared input once the other consumer is gone`, async () => {
        const target = pending<string>();
        const consumer = target.promise.then((value) => value);
        swallow(consumer);
        const other = pending<string>();
        const result = combine(kind, [target.promise, other.promise]);
        swallow(result);

        settleOther(kind, other);
        await settleAll();
        expect(target.promise.isCanceled).toBe(false);

        void consumer.cancel();
        await settleAll();
        expect(target.promise.isCanceled).toBe(losesTarget);
        if (!losesTarget) {
          void result.cancel();
          await settleAll();
        }
      });
    });
  });

  describe('bookkeeping on shared inputs', () => {
    it('adds no cancel handler to a shared input, whatever the number of combinators', async () => {
      const target = pending<string>();
      const consumer = target.promise.then((value) => value);
      swallow(consumer);
      const before = handlerCount(target.promise);

      for (let round = 0; round < 150; round++) {
        for (const kind of kinds) {
          const result = combine(kind, [target.promise]);
          swallow(result);
          void result.cancel();
        }
      }
      await settleAll();

      expect(target.promise.isCanceled).toBe(false);
      expect(handlerCount(target.promise)).toBe(before);
      void consumer.cancel();
      await settleAll();
    });

    it('registers one release on the result over 500 shared pending inputs, then tears down', async () => {
      const inputs = Array.from({ length: 500 }, () => pending<number>().promise);
      const consumers = inputs.map((input) => input.then((value) => value));
      consumers.forEach(swallow);

      const result = CancelablePromise.all(inputs);
      swallow(result);

      expect(handlerCount(result)).toBeLessThanOrEqual(1);
      expect(inputs.every((input) => handlerCount(input) === 0)).toBe(true);

      void result.cancel();
      await settleAll();
      expect(inputs.some((input) => input.isCanceled)).toBe(false);

      consumers.forEach((c) => void c.cancel());
      await settleAll();
    });

    it('cancels the shared inputs once every consumer is canceled after the result', async () => {
      const inputs = Array.from({ length: 300 }, () => pending<number>().promise);
      const consumers = inputs.map((input) => input.then((value) => value));
      consumers.forEach(swallow);

      const result = CancelablePromise.all(inputs);
      swallow(result);

      void result.cancel();
      await settleAll();
      expect(inputs.some((input) => input.isCanceled)).toBe(false);

      consumers.forEach((c) => void c.cancel());
      await settleAll();
      expect(inputs.every((input) => input.isCanceled)).toBe(true);
    });
  });

  describe('a loser awaited in the turn the result settles', () => {
    // the es5 test build turns `async` into a helper that calls `then` at once, a real
    // `await` subscribes one job later
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- needs an engine-native async function
    const awaitBoth = new Function(
      'first',
      'second',
      'return (async () => { try { await first; } catch (error) { /**/ } return await second; })();',
    ) as <T>(first: PromiseLike<unknown>, second: PromiseLike<T>) => Promise<T>;

    it('race hands the loser its value', async () => {
      const winner = pending<string>();
      const loser = pending<string>();
      const awaiter = awaitBoth(CancelablePromise.race([winner.promise, loser.promise]), loser.promise);

      winner.resolve('first win');
      await settleAll();

      expect(loser.promise.isCanceled).toBe(false);
      loser.resolve('late value');
      await expect(awaiter).resolves.toBe('late value');
    });

    it.each(['any', 'all'] as const)('%s cancels the loser before the await resumes', async (kind) => {
      const first = pending<string>();
      const loser = pending<string>();
      const awaiter = awaitBoth(combine(kind, [first.promise, loser.promise]), loser.promise);
      swallow(awaiter);

      settleOther(kind, first);
      await settleAll();

      expect(loser.promise.isCanceled).toBe(true);
      loser.resolve('late value');
      await expect(awaiter).rejects.toEqual(expect.objectContaining({ name: 'CancelError' }));
    });
  });

  describe('iterable that throws after yielding inputs', () => {
    function* yieldThenThrow(
      inputs: CancelablePromise<string>[],
      error: Error,
    ): Generator<CancelablePromise<string>, never> {
      yield* inputs;
      throw error;
    }

    describe.each(['all', 'any', 'race'] as const)('%s()', (kind) => {
      it('rejects with the thrown error, cancels a sole input and keeps a shared one', async () => {
        const sole = pending<string>();
        const shared = pending<string>();
        const consumer = shared.promise.then((value) => value);
        const boom = new Error('iteration failed');

        const values = yieldThenThrow([sole.promise, shared.promise], boom);
        const result =
          kind === 'all' ? CancelablePromise.all(values)
          : kind === 'any' ? CancelablePromise.any(values)
          : CancelablePromise.race(values);
        await expect(result).rejects.toBe(boom);
        await settleAll();

        expect(sole.promise.isCanceled).toBe(true);
        expect(shared.promise.isCanceled).toBe(false);
        shared.resolve('shared value');
        await expect(consumer).resolves.toBe('shared value');
      });
    });

    // allSettled spreads the iterable before taking any input, so the throw is synchronous
    it('allSettled() throws synchronously and leaves the inputs untouched', async () => {
      const sole = pending<string>();
      const shared = pending<string>();
      const consumer = shared.promise.then((value) => value);
      const boom = new Error('iteration failed');

      expect(() => CancelablePromise.allSettled(yieldThenThrow([sole.promise, shared.promise], boom))).toThrow(boom);
      await settleAll();

      expect(sole.promise.isCanceled).toBe(false);
      expect(shared.promise.isCanceled).toBe(false);
      sole.resolve('sole value');
      shared.resolve('shared value');
      await expect(consumer).resolves.toBe('shared value');
    });
  });

  describe('race result losing its only consumer', () => {
    it('cancels the race and its input when the then child is canceled', async () => {
      const q0 = pending<string>();
      const q4 = CancelablePromise.race([q0.promise]);
      const q5 = q4.then((value) => value);
      swallow(q5);

      void q5.cancel();
      await settleAll();

      expect(q4.isCanceled).toBe(true);
      expect(q0.promise.isCanceled).toBe(true);
    });

    it('cancels the race behind a catch child canceled one job later', async () => {
      const handlers = [jest.fn(), jest.fn()];
      const source = new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
        for (const handler of handlers) {
          handleCancel(handler);
        }
      });
      const race = CancelablePromise.race([source]);
      const child = race.catch(() => NativePromise.resolve('recovered'));
      swallow(child);

      await NativePromise.resolve();
      void child.cancel();
      await settleAll();

      expect(race.isCanceled).toBe(true);
      expect(source.isCanceled).toBe(true);
      handlers.forEach((handler) => expect(handler).toHaveBeenCalledTimes(1));
    });

    it('cancels the race behind finally and then children, sparing a bubble:false input', async () => {
      const source = new CancelablePromise<string>(() => undefined, { bubble: false });
      const race = CancelablePromise.race([source]);
      const afterFinally = race.finally(() => undefined);
      const leaf = afterFinally.then(
        () => 'value',
        () => 'reason',
      );
      swallow(leaf);

      await settleAll();
      void leaf.cancel('done');
      await settleAll();

      expect(race.isCanceled).toBe(true);
      expect(source.isCanceled).toBe(false);
    });

    it('cancels the race over an input derived from a shielded bubble:false source', async () => {
      const root = new CancelablePromise<string>(() => undefined, {
        bubble: false,
        shield: true,
        asyncCancel: false,
      });
      const derived = root.then((value) => value);
      const race = CancelablePromise.race([derived]);
      const child = race.catch((reason: unknown) => String(reason));
      swallow(child);

      await hostTurn();
      void child.cancel();
      await settleAll();

      expect(race.isCanceled).toBe(true);
      // the then child inherits bubble:false, so neither stops
      expect(derived.isCanceled).toBe(false);
      expect(root.isCanceled).toBe(false);
    });
  });
});

type Wrap = Kind | 'resolve';

function combineWith(
  kind: Wrap,
  inputs: CancelablePromise<any, any>[],
  options: ICancelablePromiseOptions,
): CancelablePromise<any, any> {
  switch (kind) {
    case 'all':
      return CancelablePromise.all(inputs, options);
    case 'allSettled':
      return CancelablePromise.allSettled(inputs, options);
    case 'any':
      return CancelablePromise.any(inputs, options);
    case 'race':
      return CancelablePromise.race(inputs, options);
    default:
      return CancelablePromise.resolve(inputs[0], options);
  }
}

function abortListenerCount(signal: AbortSignal): number {
  return getEventListeners(signal, 'abort').length;
}

describe('combinator options apply to the result only', () => {
  describe.each(kinds)('%s() with a signal', (kind) => {
    it('wires one abort listener whatever the number of inputs', () => {
      const controller = new AbortController();
      const inputs = [pending<string>(), pending<string>(), pending<string>()].map((input) => input.promise);
      const result = combineWith(kind, inputs, { signal: controller.signal });
      swallow(result);

      expect(abortListenerCount(controller.signal)).toBe(1);
      void result.cancel();
    });
  });

  const wraps: Wrap[] = [...kinds, 'resolve'];

  describe.each(wraps)('%s() aborted by its signal', (kind) => {
    describe.each(['pre-aborted', 'live abort'])('%s', (mode) => {
      function abortedResult(inputs: CancelablePromise<any, any>[]): CancelablePromise<any, any> {
        const controller = new AbortController();
        if (mode === 'pre-aborted') {
          controller.abort();
        }
        const result = combineWith(kind, inputs, { signal: controller.signal });
        swallow(result);
        if (mode === 'live abort') {
          controller.abort();
        }
        return result;
      }

      it('cancels the result and an input it holds alone', async () => {
        const target = pending<string>();
        const result = abortedResult([target.promise]);
        await settleAll();

        expect(result.isCanceled).toBe(true);
        expect(target.promise.isCanceled).toBe(true);
      });

      it('keeps a shared input alive and hands its value to the other consumer', async () => {
        const target = pending<string>();
        const consumer = target.promise.then((value) => value);
        const result = abortedResult([target.promise]);
        await settleAll();

        expect(result.isCanceled).toBe(true);
        expect(target.promise.isCanceled).toBe(false);
        target.resolve('shared value');
        await expect(consumer).resolves.toBe('shared value');
      });
    });
  });

  // allSettled has no losers
  describe.each(['all', 'any', 'race'] as const)('%s() result flags', (kind) => {
    it.each([{ shield: true }, { bubble: false }, { forceCancelable: false }])(
      'still releases a loser it holds alone with %p',
      async (options) => {
        const target = pending<string>();
        const other = pending<string>();
        const result = combineWith(kind, [target.promise, other.promise], options);
        swallow(result);

        settleOther(kind, other);
        await settleAll();

        expect(target.promise.isCanceled).toBe(true);
      },
    );
  });
});
