import { CancelablePromise } from '@cancjs/promise';

import { createCatchErrorFactory, createSuppressErrorFactory } from '../../_toolbox';
import * as asyncIter from './async-iter/index';
import { deps } from './deps';
import { debounce, delay, limit, map, minDelay, retry, timeout } from './index';

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

// an endless source, so the only way the callback stops is through the helper giving it up
function endless(): AsyncIterable<number> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (let value = 0; ; value++) {
        yield value;
      }
    },
  };
}

const catchError = createCatchErrorFactory(deps)(() => false);
const suppressError = createSuppressErrorFactory(deps)(() => false);

/**
 * Each case hands the input to the helper and returns a function that makes the helper stop: a
 * cancel of its result, or the deadline it enforces.
 */
const helpers: [string, (input: PromiseLike<string>) => () => unknown][] = [
  [
    'timeout canceled',
    (input) => {
      const result = timeout(input, 1000);
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'timeout deadline',
    (input) => {
      timeout(input, 1000).catch(() => undefined);

      return () => jest.advanceTimersByTime(1000);
    },
  ],
  [
    'delay',
    (input) => {
      const result = delay(input, 1000);
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'minDelay',
    (input) => {
      const result = minDelay(input, 1000);
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'retry',
    (input) => {
      const result = retry(() => input, { retries: 1 });
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'limit',
    (input) => {
      const result = limit(1)(() => input);
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'map',
    (input) => {
      const result = map(['a'], () => input);
      result.catch(() => undefined);

      return () => result.cancel();
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
  [
    'catchError',
    (input) => {
      const result = catchError(input);
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'suppressError',
    (input) => {
      const result = suppressError(input);
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'async-iter operator callback',
    (input) => {
      const result = asyncIter.pipe(endless(), [asyncIter.map(() => input)], asyncIter.toArray<string>());
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
  [
    'async-iter terminal callback',
    (input) => {
      const result = asyncIter.forEach<number>(() => input)(endless());
      result.catch(() => undefined);

      return () => result.cancel();
    },
  ],
];

describe('helpers give up an input they did not create', () => {
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

const duckNames = ['delay', 'minDelay', 'retry', 'debounce', 'catchError', 'suppressError'];

describe('helpers cancel a duck cancelable they are the sole holder of', () => {
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

describe('delay cancels a non thenable duck cancelable it is the sole holder of', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels the duck input once when the delay is stopped', async () => {
    const cancel = jest.fn();
    const input = { cancel };
    const result = delay(input as any, 1000);
    result.catch(() => undefined);

    await flushMicrotasks();
    result.cancel();
    await flushMicrotasks();

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

// An older package copy ships `_chain` and `_subscribe` but predates `_retainRef`
function olderCopyInput(): IInput {
  const input = pendingInput();
  Object.defineProperty(input.promise, '_retainRef', {
    value: undefined,
    configurable: true,
  });

  return input;
}

describe('helpers give up an input from an older package copy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(helpers)('%s', (_name, start) => {
    it('leaves an input with another consumer running, and that consumer gets the value', async () => {
      const input = olderCopyInput();
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
      const input = olderCopyInput();

      const stop = start(input.promise);
      await flushMicrotasks();
      stop();
      await flushMicrotasks();

      expect(input.promise.canceled).toBe(true);
    });
  });
});

// a finite source, so an async-iter callback runs once over it
async function* once(): AsyncGenerator<number> {
  yield 1;
}

/** Each case hands the input to the helper and returns the helper's result, mapped to the input's value. */
const settlers: [string, (input: PromiseLike<string>) => PromiseLike<unknown>, (value: string) => unknown][] = [
  ['timeout', (input) => timeout(input, 1000), (value) => value],
  ['delay', (input) => delay(input, 1000), (value) => value],
  ['minDelay', (input) => minDelay(input, 1000), (value) => value],
  ['retry', (input) => retry(() => input, { retries: 0 }), (value) => value],
  ['limit', (input) => limit(1)(() => input), (value) => value],
  ['map', (input) => map(['a'], () => input), (value) => [value]],
  ['debounce', (input) => debounce(() => input, 1000, { leading: true })(), (value) => value],
  ['catchError', (input) => catchError(input), (value) => value],
  ['suppressError', (input) => suppressError(input), (value) => value],
  [
    'async-iter operator callback',
    (input) => asyncIter.pipe(once(), [asyncIter.map(() => input)], asyncIter.toArray<string>()),
    (value) => [value],
  ],
  ['async-iter terminal callback', (input) => asyncIter.forEach<number>(() => input)(once()), () => undefined],
];

async function settle<T>(result: PromiseLike<T>): Promise<{ value?: T; reason?: unknown }> {
  const outcome: { value?: T; reason?: unknown; done?: boolean } = {};
  result.then(
    (value) => Object.assign(outcome, { value, done: true }),
    (reason) => Object.assign(outcome, { reason, done: true }),
  );

  for (let i = 0; i < 5 && !outcome.done; i++) {
    await flushMicrotasks();
    jest.advanceTimersByTime(1000);
  }
  await flushMicrotasks();

  expect(outcome.done).toBe(true);

  return outcome;
}

describe('helpers settle from an input of an older package copy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(settlers)('%s', (_name, start, expected) => {
    it('resolves with the value of the input', async () => {
      const input = olderCopyInput();
      const result = start(input.promise);

      await flushMicrotasks();
      input.resolve('value');

      const outcome = await settle(result);
      expect(outcome.reason).toBeUndefined();
      expect(outcome.value).toEqual(expected('value'));
    });

    it('rejects with the reason of the input', async () => {
      let reject: (reason: unknown) => void = () => undefined;
      const promise = new CancelablePromise<string>((_resolve, rej) => {
        reject = rej;
      });
      Object.defineProperty(promise, '_retainRef', {
        value: undefined,
        configurable: true,
      });
      // observed here too, so a helper that misses the rejection fails the case instead of the run
      promise.then(undefined, () => undefined);
      const reason = new Error('input failed');
      const result = start(promise);

      await flushMicrotasks();
      reject(reason);

      const outcome = await settle(result);
      expect(outcome.reason).toBe(reason);
    });
  });
});
