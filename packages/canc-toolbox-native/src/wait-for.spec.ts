import { waitFor } from './index';

describe('waitFor', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves once the condition becomes truthy (happy path)', async () => {
    let flag = false;
    setTimeout(() => {
      flag = true;
    }, 30);
    await waitFor(() => flag, { interval: 5 });
    expect(flag).toBe(true);
  });

  it('resolves immediately when the condition is already truthy', async () => {
    await expect(waitFor(() => true)).resolves.toBeUndefined();
  });

  it('rejects when the condition function throws', async () => {
    const error = new Error('boom');
    await expect(
      waitFor(() => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const promise = waitFor(() => true);
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });
});
