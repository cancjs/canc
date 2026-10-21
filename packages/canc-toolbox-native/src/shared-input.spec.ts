import { CancelablePromise } from '@cancjs/promise';

import { debounce } from './debounce';
import { delay, minDelay, retry, timeout } from './index';

// A release cancels the input a couple of microtask hops after the helper lets it go
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

interface IInput {
  promise: CancelablePromise<string>;
  resolve(value: string): void;
}

function pendingInput(): IInput {
  let resolve: (value: string) => void = () => undefined;
  const promise = new CancelablePromise<string>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

interface IDuckInput {
  promise: PromiseLike<string> & { cancel(reason?: unknown): void };
  cancel: jest.Mock;
}

// a third-party cancelable: it has `cancel` but no consumer count a helper could release
function duckInput(): IDuckInput {
  const cancel = jest.fn();
  const pending = new Promise<string>(() => undefined);

  return { promise: { then: pending.then.bind(pending), cancel }, cancel };
}

/**
 * Each case hands a cancelable input to a native helper and returns a function that makes the
 * helper stop. A native result has no cancel, so the stop is an abort signal or the deadline.
 * `limit`, `map` and the error filters never stop a running input here, so they have no case.
 */
const helpers: [string, (input: PromiseLike<string>) => () => unknown][] = [
  [
    'timeout deadline',
    (input) => {
      timeout(input, 1000).catch(() => undefined);

      return () => jest.advanceTimersByTime(1000);
    },
  ],
  [
    'timeout aborted',
    (input) => {
      const controller = new AbortController();
      timeout(input, 1000, { signal: controller.signal }).catch(() => undefined);

      return () => controller.abort();
    },
  ],
  [
    'delay',
    (input) => {
      const controller = new AbortController();
      delay(input, 1000, { signal: controller.signal }).catch(() => undefined);

      return () => controller.abort();
    },
  ],
  [
    'minDelay',
    (input) => {
      const controller = new AbortController();
      minDelay(input, 1000, { signal: controller.signal }).catch(() => undefined);

      return () => controller.abort();
    },
  ],
  [
    'retry',
    (input) => {
      const controller = new AbortController();
      retry(() => input, { retries: 1, signal: controller.signal }).catch(() => undefined);

      return () => controller.abort();
    },
  ],
  [
    'debounce',
    (input) => {
      const debounced = debounce(() => input, 1000, { leading: true });
      debounced().catch(() => undefined);

      return () => debounced.cancel();
    },
  ],
];

describe('native helpers give up a cancelable input they did not create', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(helpers)('%s', (_name, start) => {
    it('leaves an input with another consumer running, and that consumer gets the value', async () => {
      const input = pendingInput();
      const other = input.promise.then((value) => value);

      const stop = start(input.promise);
      await flushMicrotasks();
      stop();
      await flushMicrotasks();

      expect(input.promise.canceled).toBe(false);

      input.resolve('value');
      expect(await other).toBe('value');
    });

    it('cancels an input it was the only consumer of', async () => {
      const input = pendingInput();

      const stop = start(input.promise);
      await flushMicrotasks();
      stop();
      await flushMicrotasks();

      expect(input.promise.canceled).toBe(true);
    });
  });
});

const duckNames = ['delay', 'minDelay', 'retry', 'debounce'];

describe('native helpers cancel a duck cancelable they are the sole holder of', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(helpers.filter(([name]) => duckNames.includes(name)))('%s', (_name, start) => {
    it('cancels the duck input directly when the helper stops', async () => {
      const input = duckInput();

      const stop = start(input.promise);
      await flushMicrotasks();
      stop();
      await flushMicrotasks();

      expect(input.cancel).toHaveBeenCalledTimes(1);
    });
  });
});

describe('native delay cancels a non thenable duck cancelable it is the sole holder of', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels the duck input once when the delay is stopped', async () => {
    const cancel = jest.fn();
    const input = { cancel };
    const controller = new AbortController();
    delay(input as any, 1000, { signal: controller.signal }).catch(() => undefined);

    await flushMicrotasks();
    controller.abort();
    await flushMicrotasks();

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
