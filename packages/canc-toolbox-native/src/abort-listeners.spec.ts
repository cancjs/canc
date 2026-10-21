import { getEventListeners } from 'events';

import { delay, promisify, retry } from './index';

const CALLS = 100;

const listenerCount = (signal: AbortSignal): number => getEventListeners(signal, 'abort').length;

const boom = new Error('sync throw');

describe('abort listeners (native)', () => {
  it('promisify with a throwing callback API leaves no listener on a reused signal', async () => {
    const controller = new AbortController();
    const throwing = promisify(
      () => {
        throw boom;
      },
      { signal: controller.signal },
    );

    for (let i = 0; i < CALLS; i++) {
      await expect(throwing()).rejects.toBe(boom);
    }

    expect(listenerCount(controller.signal)).toBe(0);
  });

  it('delay with a throwing thunk leaves no listener on a reused signal', async () => {
    const controller = new AbortController();

    for (let i = 0; i < CALLS; i++) {
      await expect(
        delay(
          () => {
            throw boom;
          },
          0,
          { signal: controller.signal },
        ),
      ).rejects.toBe(boom);
    }

    expect(listenerCount(controller.signal)).toBe(0);
  });

  it('retry with a throwing function leaves no listener on a reused signal', async () => {
    const controller = new AbortController();

    for (let i = 0; i < CALLS; i++) {
      await expect(
        retry(
          () => {
            throw boom;
          },
          { retries: 0, signal: controller.signal },
        ),
      ).rejects.toBe(boom);
    }

    expect(listenerCount(controller.signal)).toBe(0);
  });
});
