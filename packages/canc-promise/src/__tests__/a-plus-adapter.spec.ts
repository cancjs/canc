import { CancelablePromise } from '../cancelable-promise';

/**
 * Promises/A+ compliance: runs the official promises-aplus-tests suite against CancelablePromise.
 *
 * Attribution: https://github.com/promises-aplus/promises-tests
 * Adapter pattern: deferred = withResolvers() (ES2024 standard).
 */

interface IAplusDeferred {
  promise: PromiseLike<unknown>;
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface IAplusAdapter {
  deferred: () => IAplusDeferred;
  rejected: (reason: unknown) => PromiseLike<unknown>;
}

type TDone = (error?: unknown) => void;
type TSpecBody = (done: TDone) => void;

const aplusTests = require('promises-aplus-tests') as { mocha: (adapter: IAplusAdapter) => void };

function promisesAPlusAdapter(): IAplusDeferred {
  return CancelablePromise.withResolvers<unknown>();
}

function ignoreRejection(promise: PromiseLike<unknown>): void {
  Promise.prototype.then.call(promise, undefined, () => undefined);
}

// the suite builds some rejected promises only to use them as reasons, never awaiting them
function rejectedForSuite(reason: unknown): PromiseLike<unknown> {
  const deferred = promisesAPlusAdapter();
  deferred.reject(reason);
  ignoreRejection(deferred.promise);
  return deferred.promise;
}

// the suite waits on timers of up to 100ms; fake time keeps each case deterministic
const FAKE_TIME_STEP_MS = 10;
const FAKE_TIME_LIMIT_MS = 1000;

async function runOnFakeTime(body: TSpecBody): Promise<void> {
  let finished = false;
  let failure: unknown;
  const done: TDone = (error) => {
    if (!finished) {
      finished = true;
      failure = error;
    }
  };

  // promise jobs and process ticks stay real, only timers move on fake time
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  try {
    if (body.length === 0) {
      (body as () => void)();
      finished = true;
    } else {
      body(done);
    }
    for (let elapsed = 0; !finished && elapsed < FAKE_TIME_LIMIT_MS; elapsed += FAKE_TIME_STEP_MS) {
      await jest.advanceTimersByTimeAsync(FAKE_TIME_STEP_MS);
    }
  } finally {
    jest.useRealTimers();
  }

  if (failure) {
    throw failure;
  }
  if (!finished) {
    throw new Error(`done was not called within ${FAKE_TIME_LIMIT_MS}ms of fake time`);
  }
}

describe('A+ Adapter (promises-aplus-tests compatible)', () => {
  it('adapter returns object with promise, resolve, reject properties', () => {
    const deferred = promisesAPlusAdapter();
    expect(deferred).toHaveProperty('promise');
    expect(deferred).toHaveProperty('resolve');
    expect(deferred).toHaveProperty('reject');
    expect(deferred.promise).toBeInstanceOf(CancelablePromise);
    expect(typeof deferred.resolve).toBe('function');
    expect(typeof deferred.reject).toBe('function');
  });

  it('resolve settles the promise with value', async () => {
    const deferred = promisesAPlusAdapter();
    deferred.resolve(42);
    await expect(deferred.promise).resolves.toBe(42);
  });

  it('reject settles the promise with reason', async () => {
    const deferred = promisesAPlusAdapter();
    const error = new Error('test rejection');
    deferred.reject(error);
    await expect(deferred.promise).rejects.toBe(error);
  });

  it('resolve with thenable adopts thenable state', async () => {
    const deferred = promisesAPlusAdapter();
    const thenable = { then: (res: any) => res('adopted') };
    deferred.resolve(thenable);
    await expect(deferred.promise).resolves.toBe('adopted');
  });

  it('multiple resolutions are idempotent (first wins)', async () => {
    const deferred = promisesAPlusAdapter();
    deferred.resolve('first');
    deferred.resolve('second');
    deferred.reject(new Error('third'));
    await expect(deferred.promise).resolves.toBe('first');
  });

  it('multiple rejections are idempotent (first wins)', async () => {
    const deferred = promisesAPlusAdapter();
    const err1 = new Error('first');
    const err2 = new Error('second');
    deferred.reject(err1);
    deferred.reject(err2);
    deferred.resolve('value');
    await expect(deferred.promise).rejects.toBe(err1);
  });
});

describe('Promises/A+ test suite', () => {
  // the suite leaves some derived rejections unhandled on purpose (mocha ignores them, jest
  // fails the running case), so every derived promise gets a no-op rejection handler
  let thenSpy: jest.SpyInstance | undefined;

  beforeAll(() => {
    const originalThen = CancelablePromise.prototype.then;
    thenSpy = jest.spyOn(CancelablePromise.prototype, 'then').mockImplementation(function (
      this: CancelablePromise<unknown>,
      ...args: Parameters<typeof originalThen>
    ) {
      const derived = originalThen.apply(this, args);
      ignoreRejection(derived);
      return derived;
    });
  });

  afterAll(() => {
    thenSpy?.mockRestore();
  });

  // the suite registers its cases through the mocha `specify` global
  const suiteGlobals = globalThis as unknown as { specify?: (name: string, body: TSpecBody) => void };
  suiteGlobals.specify = (name, body) => {
    it(name, () => runOnFakeTime(body));
  };
  try {
    aplusTests.mocha({ deferred: promisesAPlusAdapter, rejected: rejectedForSuite });
  } finally {
    delete suiteGlobals.specify;
  }
});
