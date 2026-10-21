import { CancelablePromise } from '@cancjs/promise';

import { delay } from './index';

// jest fakes setImmediate with the other timers, and node reports a rejection on a real turn
const realSetImmediate = setImmediate;

const turn = (): Promise<void> => new Promise<void>((resolve) => realSetImmediate(resolve));

describe('delay input handling (cancelable)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('a rejecting input the caller catches is not reported as unhandled', async () => {
    jest.useFakeTimers();
    // jest fails a test whose promise goes unhandled, so reaching the end proves none did
    const rejecting = CancelablePromise.reject(new Error('early'));
    const observed = delay(rejecting, 10).catch((error: unknown) => error);

    await turn();
    await turn();
    jest.advanceTimersByTime(10);

    expect(((await observed) as Error).message).toBe('early');
  });

  it('keeps the input when the duration is undefined', async () => {
    jest.useFakeTimers();
    const promise = (delay as any)(Promise.resolve('kept'), undefined);

    jest.advanceTimersByTime(0);

    await expect(promise).resolves.toBe('kept');
  });
});
