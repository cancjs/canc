import { createCancelSignal, isCancelError } from '@cancjs/promise';
import { getEventListeners } from 'events';

import { cancelify, delay, promisify, retry, withSignal } from './index';

const CALLS = 100;

const listenerCount = (signal: AbortSignal): number => getEventListeners(signal, 'abort').length;

const boom = new Error('sync throw');

describe('abort listeners (cancelable)', () => {
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

  it('cancelify with a throwing function leaves no listener on a reused signal', async () => {
    const controller = new AbortController();
    const throwing = cancelify(
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

  describe('withSignal on a pre-aborted signal', () => {
    it('never calls the function and rejects with the cancel reason', async () => {
      const { signal, cancel } = createCancelSignal();
      cancel();
      const thunk = jest.fn(() => Promise.reject(new Error('late')));

      const error = await withSignal(signal, thunk).catch((reason: unknown) => reason);

      expect(thunk).not.toHaveBeenCalled();
      expect(isCancelError(error)).toBe(true);
    });

    it('does not report a rejecting promise input as unhandled', async () => {
      const { signal, cancel } = createCancelSignal();
      cancel();
      // jest fails a test whose promise goes unhandled, so reaching the end proves none did
      const rejecting = Promise.reject(new Error('given promise'));

      const error = await withSignal(signal, rejecting).catch((reason: unknown) => reason);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(isCancelError(error)).toBe(true);
    });

    it('still runs the function for a live signal', async () => {
      const controller = new AbortController();

      await expect(withSignal(controller.signal, () => 'value')).resolves.toBe('value');
      expect(listenerCount(controller.signal)).toBe(0);
    });
  });
});
