import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { find, pipe, some } from '../../canc-toolbox/src/async-iter';

function sourceWithCloseError(error: Error, rejectClose: boolean) {
  const state = { closes: 0, pulls: 0 };
  const source: AsyncIterable<number> = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          state.pulls++;
          return Promise.resolve({ value: 3, done: false });
        },
        return() {
          state.closes++;
          if (rejectClose) {
            return Promise.reject(error);
          }
          throw error;
        },
      };
    },
  };
  return { source, state };
}

describe('async iterator terminal close failures', () => {
  it.each([false, true])('rejects the original close error after successful find, async=%s', async (rejectClose) => {
    const error = new Error('close failure');
    const { source, state } = sourceWithCloseError(error, rejectClose);

    await expect(
      pipe(
        source,
        find(() => true),
      ),
    ).rejects.toBe(error);
    expect(state.closes).toBe(1);
    expect(state.pulls).toBe(1);
  });

  it('reports a close error after successful some', async () => {
    const error = new Error('some close failure');
    const { source, state } = sourceWithCloseError(error, true);

    await expect(
      pipe(
        source,
        some(() => true),
      ),
    ).rejects.toBe(error);
    expect(state.closes).toBe(1);
  });

  it('preserves the callback error when close also fails', async () => {
    const bodyError = new Error('body failure');
    const closeError = new Error('close failure');
    const { source, state } = sourceWithCloseError(closeError, true);

    await expect(
      pipe(
        source,
        find(() => {
          throw bodyError;
        }),
      ),
    ).rejects.toBe(bodyError);
    expect(state.closes).toBe(1);
  });

  it('preserves rejected callback error when close also throws', async () => {
    const bodyError = new Error('async body failure');
    const { source, state } = sourceWithCloseError(new Error('close'), false);

    await expect(
      pipe(
        source,
        find(() => Promise.reject(bodyError)),
      ),
    ).rejects.toBe(bodyError);
    expect(state.closes).toBe(1);
  });

  it('succeeds when source has no return method', async () => {
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ value: 3, done: false }),
      }),
    };

    await expect(
      pipe(
        source,
        find(() => true),
      ),
    ).resolves.toBe(3);
  });

  it('does not call return after natural exhaustion', async () => {
    let closes = 0;
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ value: undefined, done: true }),
        return: () => {
          closes++;
          throw new Error('should not close exhausted source');
        },
      }),
    };

    await expect(
      pipe(
        source,
        find(() => true),
      ),
    ).resolves.toBeUndefined();
    expect(closes).toBe(0);
  });

  it('agrees with native for-await short-circuit close semantics', async () => {
    const error = new Error('native close failure');
    const { source, state } = sourceWithCloseError(error, true);

    const iterate = async () => {
      for await (const value of source) {
        expect(value).toBe(3);
        break;
      }
    };

    await expect(iterate()).rejects.toBe(error);
    expect(state.closes).toBe(1);
  });

  it('preserves cancellation ahead of a rejected close', async () => {
    const closeError = new Error('close failure');
    const gate = CancelablePromise.withResolvers<IteratorResult<number>>();
    const state = { closes: 0 };
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () => gate.promise,
        return: () => {
          state.closes++;
          return Promise.reject(closeError);
        },
      }),
    };

    const pending = pipe(
      source,
      find(() => true),
    ) as CancelablePromise<number | undefined>;
    const rejected = pending.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    await pending.cancel();
    expect(isCancelError(await rejected)).toBe(true);
    expect(state.closes).toBe(1);
  });
});
