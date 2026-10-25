import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

class ValidationError extends Error {
  name = 'ValidationError';
}

describe('CancelablePromise.fail', () => {
  it('rejects with the given error as is', async () => {
    const error = new ValidationError('bad');
    const promise = CancelablePromise.fail(error);

    await expect(promise).rejects.toBe(error);
    expect(promise.canceled).toBe(false);
  });

  it('rejects with a non-error reason as is', async () => {
    const reason = { code: 7 };

    await expect(CancelablePromise.fail(reason)).rejects.toBe(reason);
  });

  it('settles as canceled when given a CancelError', async () => {
    const error = new CancelError('stop');
    const promise = CancelablePromise.fail(error);

    await expect(promise).rejects.toBe(error);
    expect(promise.canceled).toBe(true);
  });

  it('returns an instance of the subclass it is called on', async () => {
    class Sub<T, F = never> extends CancelablePromise<T, F> {}
    const error = new ValidationError();
    const promise = Sub.fail(error);

    expect(promise).toBeInstanceOf(Sub);
    await expect(promise).rejects.toBe(error);
  });
});
