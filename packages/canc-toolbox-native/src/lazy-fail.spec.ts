import { isLazyPromise, LazyPromise } from './index';

class ValidationError extends Error {
  name = 'ValidationError';
}

describe('native LazyPromise.reject', () => {
  it('does not inherit fail', () => {
    expect('fail' in LazyPromise).toBe(false);
  });

  it('returns an instance of LazyPromise', () => {
    const promise = LazyPromise.reject(new ValidationError('bad'));

    expect(promise).toBeInstanceOf(LazyPromise);
    expect(isLazyPromise(promise)).toBe(true);
  });

  it('rejects with the given error as is', async () => {
    const error = new ValidationError('bad');

    await expect(LazyPromise.reject(error)).rejects.toBe(error);
  });
});
