import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { BreakError, cancAsync, cancAwait, cancForAwait } from './coroutine';
import { cancGenAsync, cancGenAwait, cancGenDelegate, cancGenForAwait } from './coroutine-gen';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

function controlled<T>() {
  let resolve!: (value: T) => void;
  let canceledCount = 0;
  const promise = new CancelablePromise<T>((res, _rej, { handleCancel }) => {
    resolve = res;
    handleCancel(() => {
      canceledCount++;
    });
  });
  return { promise, resolve, canceledCount: () => canceledCount };
}

const never = () => new CancelablePromise<never>(() => {});

type TAwaitFn = (value: unknown) => Generator<any, any, any>;
type TForAwaitFn = (source: Iterable<unknown>, cb: (value: any) => unknown) => Generator<any, any, any>;
type TBody = (aw: TAwaitFn, forAwait: TForAwaitFn) => Generator<any, any, any>;

interface IRun {
  cancel(reason?: unknown): unknown;
  outcome: Promise<string>;
}

function describeOutcome(settled: Promise<unknown>): Promise<string> {
  return settled.then(
    (value) => `value:${String(value)}`,
    (error: unknown) => (isCancelError(error) ? 'canceled' : `error:${(error as Error).message}`),
  );
}

// One body runs in both dialects; only the await and loop helpers differ
const dialects: Array<{ name: string; start(body: TBody, options?: { signal?: AbortSignal }): IRun }> = [
  {
    name: 'cancAsync',
    start(body, options) {
      const promise = cancAsync(
        function* () {
          return yield* body(cancAwait as TAwaitFn, cancForAwait as unknown as TForAwaitFn);
        },
        undefined,
        options,
      )();
      return { cancel: (reason) => promise.cancel(reason), outcome: describeOutcome(promise) };
    },
  },
  {
    name: 'cancGenAsync',
    start(body, options) {
      const step = cancGenAsync(function* () {
        return yield* body(cancGenAwait as TAwaitFn, cancGenForAwait as unknown as TForAwaitFn);
      }, options)().next() as CancelablePromise<IteratorResult<unknown>>;
      return {
        cancel: (reason) => step.cancel(reason),
        outcome: describeOutcome(step.then((result) => result.value)),
      };
    },
  },
];

describe.each(dialects)('cancel drain in $name', ({ start }) => {
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(async () => {
    await flush();
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });

  it('runs an async finally with two awaits to its end before settling', async () => {
    const log: string[] = [];
    const run = start(function* (aw) {
      try {
        yield* aw(never());
      } finally {
        log.push('start');
        yield* aw(Promise.resolve());
        log.push('middle');
        yield* aw(Promise.resolve());
        log.push('end');
      }
    });
    await flush();

    await run.cancel();
    expect(log).toEqual(['start', 'middle', 'end']);
    expect(await run.outcome).toBe('canceled');
  });

  it('keeps the outcome pending until the cleanup ran', async () => {
    const cleanup = controlled<void>();
    let state = 'pending';
    const run = start(function* (aw) {
      try {
        yield* aw(never());
      } finally {
        yield* aw(cleanup.promise);
      }
    });
    void run.outcome.then((outcome) => {
      state = outcome;
    });
    await flush();

    void run.cancel();
    await flush();
    expect(state).toBe('pending');
    expect(cleanup.canceledCount()).toBe(0);

    cleanup.resolve();
    await flush();
    expect(state).toBe('canceled');
  });

  it('rejects with the error a finally throws after an await', async () => {
    const run = start(function* (aw) {
      try {
        yield* aw(never());
      } finally {
        yield* aw(Promise.resolve());
        throw new Error('cleanup failed');
      }
    });
    await flush();

    void run.cancel();
    expect(await run.outcome).toBe('error:cleanup failed');
  });

  it('rejects with the error a finally throws synchronously', async () => {
    const run = start(function* (aw) {
      try {
        yield* aw(never());
      } finally {
        throw new Error('cleanup failed');
      }
    });
    await flush();

    void run.cancel();
    expect(await run.outcome).toBe('error:cleanup failed');
  });

  it('runs the finally when the body aborts its own signal while running', async () => {
    const controller = new AbortController();
    const log: string[] = [];
    const run = start(
      function* (aw) {
        try {
          yield* aw(Promise.resolve());
          controller.abort('stop');
          log.push('after abort');
          yield* aw(Promise.resolve());
          log.push('unreachable');
        } finally {
          log.push('finally');
          yield* aw(Promise.resolve());
          log.push('finally end');
        }
      },
      { signal: controller.signal },
    );

    expect(await run.outcome).toBe('canceled');
    expect(log).toEqual(['after abort', 'finally', 'finally end']);
  });

  it('runs the finally when the signal aborts while the body waits', async () => {
    const controller = new AbortController();
    const log: string[] = [];
    const run = start(
      function* (aw) {
        try {
          yield* aw(never());
        } finally {
          yield* aw(Promise.resolve());
          log.push('finally');
        }
      },
      { signal: controller.signal },
    );
    await flush();

    controller.abort('stop');
    expect(await run.outcome).toBe('canceled');
    expect(log).toEqual(['finally']);
  });

  it('stops a loop cleanly when the callback throws BreakError', async () => {
    const seen: unknown[] = [];
    const run = start(function* (_aw, forAwait) {
      yield* forAwait([1, 2, 3], (value) => {
        seen.push(value);
        if (value === 2) {
          throw new BreakError();
        }
      });
      return 'after loop';
    });

    expect(await run.outcome).toBe('value:after loop');
    expect(seen).toEqual([1, 2]);
  });

  it('leaves a source shared with another consumer running', async () => {
    const shared = controlled<number>();
    const run = start(function* (aw) {
      return yield* aw(shared.promise);
    });
    const other = cancAsync(function* () {
      return yield* cancAwait(shared.promise);
    })();
    await flush();

    void run.cancel();
    expect(await run.outcome).toBe('canceled');
    expect(shared.canceledCount()).toBe(0);

    shared.resolve(7);
    await expect(other).resolves.toBe(7);
  });

  it('cancels a source once its only consumer is gone', async () => {
    const source = controlled<number>();
    const run = start(function* (aw) {
      return yield* aw(source.promise);
    });
    await flush();

    void run.cancel();
    expect(await run.outcome).toBe('canceled');
    await flush();
    expect(source.canceledCount()).toBe(1);
  });
});

describe('cancGenAsync generator lifetime under cancel', () => {
  it('runs the finally when the signal aborts between pulls', async () => {
    const controller = new AbortController();
    let finallyRuns = 0;
    const it = cancGenAsync(
      function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          yield* cancGenAwait(Promise.resolve());
          finallyRuns++;
        }
      },
      { signal: controller.signal },
    )();

    await expect(it.next()).resolves.toEqual({ value: 1, done: false });
    controller.abort('stop');
    await flush();
    expect(finallyRuns).toBe(1);
    expect(isCancelError(await it.next().catch((error: unknown) => error))).toBe(true);
  });

  it('lets a canceled consumer return() finish its cleanup', async () => {
    const release = controlled<void>();
    const log: string[] = [];
    const it = cancGenAsync(function* () {
      try {
        yield 1;
      } finally {
        yield* cancGenAwait(release.promise);
        log.push('after release');
      }
    })();

    await it.next();
    const returned = it.return(undefined) as CancelablePromise<IteratorResult<unknown>>;
    const outcome = describeOutcome(returned);
    await flush();
    void returned.cancel();
    await flush();
    expect(release.canceledCount()).toBe(0);

    release.resolve();
    expect(await outcome).toBe('canceled');
    expect(log).toEqual(['after release']);
  });
});

type TDrive = Array<(outer: AsyncGenerator<unknown>) => Promise<IteratorResult<unknown>>>;

describe('cancGenDelegate against a native yield*', () => {
  function makeInner(log: string[]) {
    return (async function* () {
      try {
        const sent: unknown = yield 1;
        log.push(`inner got ${String(sent)}`);
        yield 2;
        return 'inner result';
      } catch (error) {
        log.push(`inner caught ${(error as Error).message}`);
        yield 'recovered';
      } finally {
        log.push('inner finally');
      }
    })();
  }

  const outers: Array<[string, (inner: AsyncGenerator<unknown>, log: string[]) => AsyncGenerator<unknown>]> = [
    [
      'native',
      (inner, log) =>
        (async function* () {
          const result: unknown = yield* inner;
          log.push(`outer got ${String(result)}`);
          yield 'end';
        })(),
    ],
    [
      'cancGenDelegate',
      (inner, log) =>
        cancGenAsync(function* () {
          const result: unknown = yield* cancGenDelegate(inner);
          log.push(`outer got ${String(result)}`);
          yield 'end';
        })(),
    ],
  ];

  const describeStep = (step: Promise<IteratorResult<unknown>>) =>
    step.then(
      (result) => JSON.stringify(result),
      (error: unknown) => `rejected ${(error as Error).message}`,
    );

  async function scenario(
    makeOuter: (inner: AsyncGenerator<unknown>, log: string[]) => AsyncGenerator<unknown>,
    drive: TDrive,
  ) {
    const log: string[] = [];
    const outer = makeOuter(makeInner(log), log);
    const steps: string[] = [];
    // one request at a time, a queued return() follows its own native rules
    for (const request of drive) {
      steps.push(await describeStep(request(outer)));
    }
    return { steps, log };
  }

  const next = (value?: unknown) => (outer: AsyncGenerator<unknown>) => outer.next(value);
  const drives: Array<[string, TDrive]> = [
    ['next(value)', [next(), next('sent'), next(), next(), next()]],
    ['throw(error)', [next(), (outer) => outer.throw(new Error('boom')), next(), next()]],
  ];

  it.each(drives)('forwards %s like yield*', async (_label, drive) => {
    const [native, canc] = outers;
    expect(await scenario(canc[1], drive)).toEqual(await scenario(native[1], drive));
  });

  // the downleveled async generator helper resumes the outer body here, a real engine returns
  it('forwards return(value) like a native engine yield*', async () => {
    const result = await scenario(outers[1][1], [next(), (outer) => outer.return('stop'), next()]);
    expect(result).toEqual({
      steps: ['{"value":1,"done":false}', '{"value":"stop","done":true}', '{"done":true}'],
      log: ['inner finally'],
    });
  });
});
