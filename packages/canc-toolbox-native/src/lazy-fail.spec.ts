import { isLazyPromise, LazyPromise } from './index';

class ValidationError extends Error {
  name = 'ValidationError';
}

describe('LazyPromise.fail', () => {
  it('returns an instance of LazyPromise', () => {
    const promise = LazyPromise.fail(new ValidationError('bad'));

    expect(promise).toBeInstanceOf(LazyPromise);
    expect(isLazyPromise(promise)).toBe(true);
  });

  it('rejects with the given error as is', async () => {
    const error = new ValidationError('bad');

    await expect(LazyPromise.fail(error)).rejects.toBe(error);
  });
});
