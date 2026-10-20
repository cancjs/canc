import { createCatchError, createSuppressError } from './index';

const boom = new Error('predicate failed');

const throwingPredicate = (): boolean => {
  throw boom;
};

// a pending result would hang the suite, so the race ends in a sentinel on the next turn
const settleOrPending = (promise: Promise<unknown>): Promise<unknown> =>
  Promise.race([
    promise.then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: error }),
    ),
    new Promise((resolve) => {
      setTimeout(() => resolve('pending'), 20);
    }),
  ]);

describe('native catch and suppress matchers', () => {
  it('createCatchError rejects with the error a throwing predicate raised', async () => {
    const catchThrowing = createCatchError(throwingPredicate);

    await expect(settleOrPending(catchThrowing(Promise.reject(new Error('input'))))).resolves.toEqual({
      rejected: boom,
    });
  });

  it('createSuppressError rejects with the error a throwing predicate raised', async () => {
    const suppressThrowing = createSuppressError(throwingPredicate);

    await expect(settleOrPending(suppressThrowing(Promise.reject(new Error('input'))))).resolves.toEqual({
      rejected: boom,
    });
  });

  it('still converts a matching rejection', async () => {
    const input = Promise.reject(new TypeError('bad'));

    await expect(createSuppressError(TypeError)(input)).resolves.toBeUndefined();
    await expect(createCatchError('TypeError')(Promise.reject(new TypeError('bad')))).resolves.toBeInstanceOf(
      TypeError,
    );
  });
});
