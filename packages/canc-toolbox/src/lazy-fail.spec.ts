import { CancelError } from '@cancjs/promise';

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

  it('retains subclass construction without invoking reject override', async () => {
    class Sub extends LazyPromise {
      static override reject(): never {
        throw new Error('unexpected reject override');
      }
    }
    const reason = new ValidationError('sub');
    const value = Sub.fail(reason);
    expect(value).toBeInstanceOf(Sub);
    await expect(value).rejects.toBe(reason);
  });

  it('cancels before observing fail', async () => {
    const value = LazyPromise.fail(new ValidationError('unobserved'));
    value.cancel();
    await expect(value).rejects.toBeInstanceOf(CancelError);
  });

  it('keeps a CancelError as the rejection reason', async () => {
    const error = new CancelError('stop');

    await expect(LazyPromise.fail(error)).rejects.toBe(error);
    await expect(LazyPromise.fail(error)).rejects.toBeInstanceOf(CancelError);
  });
});
