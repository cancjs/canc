import { defer } from './index';

describe('defer', () => {
  it('returns a promise plus resolve/reject (happy path)', async () => {
    const d = defer<number>();
    d.resolve(42);
    await expect(d.promise).resolves.toBe(42);
  });

  it('reject settles the promise as rejected', async () => {
    const d = defer<number>();
    const error = new Error('nope');
    d.reject(error);
    await expect(d.promise).rejects.toBe(error);
  });

  it('produces a plain native Promise, not a cancelable one', async () => {
    const d = defer<string>();
    expect(d.promise).toBeInstanceOf(Promise);
    expect('cancel' in d.promise).toBe(false);
    d.resolve('ok');
    await expect(d.promise).resolves.toBe('ok');
  });
});
