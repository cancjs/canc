import { CancelablePromise } from '@cancjs/promise';

import { cancGenAsync, cancGenAwait } from './coroutine-gen';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
};

function controlled<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new CancelablePromise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function throwingTransform(primary: Error) {
  return (value: unknown) => {
    if (value === 7) throw primary;
    return value;
  };
}

describe('cancGenAsync transformation failure cleanup', () => {
  it('drains an initial transform error, rejecting next but completing queued return', async () => {
    const primary = new Error('transform error');
    const cleanup = controlled<void>();
    const log: string[] = [];
    const it = cancGenAsync(
      function* () {
        try {
          yield 7;
          log.push('body resumed');
        } finally {
          log.push('finally start');
          yield* cancGenAwait(cleanup.promise);
          log.push('finally end');
        }
      },
      { transformYield: throwingTransform(primary) },
    )();
    const active = it.next();
    let activeSettled = false;
    const activeOutcome = active.then(
      (value) => {
        activeSettled = true;
        return value;
      },
      (error: unknown) => {
        activeSettled = true;
        return error;
      },
    );
    const returned = it.return('bye' as never);
    await flush();
    expect(log).toEqual(['finally start']);
    expect(activeSettled).toBe(false);

    cleanup.resolve();
    expect(await activeOutcome).toBe(primary);
    await expect(returned).resolves.toEqual({ value: 'bye', done: true });
    expect(log).toEqual(['finally start', 'finally end']);
    await expect(it.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('drains when transform fails after a suspended await', async () => {
    const primary = new Error('after await');
    const gate = controlled<number>();
    const cleanup = controlled<void>();
    const log: string[] = [];
    const it = cancGenAsync(
      function* () {
        try {
          yield* cancGenAwait(gate.promise);
          yield 7;
        } finally {
          log.push('finally start');
          yield* cancGenAwait(cleanup.promise);
          log.push('finally end');
        }
      },
      { transformYield: throwingTransform(primary) },
    )();
    const active = it.next();
    const error = active.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    const returned = it.return('end' as never);
    gate.resolve(1);
    await flush();
    expect(log).toEqual(['finally start']);
    cleanup.resolve();
    expect(await error).toBe(primary);
    await expect(returned).resolves.toEqual({ value: 'end', done: true });
    expect(log).toEqual(['finally start', 'finally end']);
  });

  it('preserves primary transform error while a queued return reports cleanup failure', async () => {
    const primary = new Error('transform');
    const cleanupFailure = new Error('cleanup');
    const gate = controlled<void>();
    const it = cancGenAsync(
      function* () {
        try {
          yield 7;
        } finally {
          yield* cancGenAwait(gate.promise);
          throw cleanupFailure;
        }
      },
      { transformYield: throwingTransform(primary) },
    )();
    const active = it.next();
    const error = active.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    const ret = it.return('later' as never);
    gate.resolve();
    expect(await error).toBe(primary);
    await expect(ret).rejects.toBe(cleanupFailure);
    await expect(it.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('settles next, throw and two return requests behind a failed transform', async () => {
    const primary = new Error('failed first');
    const thrown = new Error('consumer thrown');
    const gate = controlled<void>();
    const it = cancGenAsync(
      function* () {
        try {
          yield 7;
        } finally {
          yield* cancGenAwait(gate.promise);
        }
      },
      { transformYield: throwingTransform(primary) },
    )();
    const first = it.next().then(
      () => undefined,
      (error: unknown) => error,
    );
    const returnA = it.return('one' as never);
    const next = it.next();
    const returnB = it.return('two' as never);
    const rejected = it.throw(thrown).then(
      () => undefined,
      (error: unknown) => error,
    );
    gate.resolve();
    expect(await first).toBe(primary);
    await expect(returnA).resolves.toEqual({ value: 'one', done: true });
    await expect(next).resolves.toEqual({ value: undefined, done: true });
    await expect(returnB).resolves.toEqual({ value: 'two', done: true });
    expect(await rejected).toBe(thrown);
  });

  it('waits for ongoing cleanup when cancel arrives after transform failure', async () => {
    const primary = new Error('transform');
    const cleanup = controlled<void>();
    const log: string[] = [];
    const it = cancGenAsync(
      function* () {
        try {
          yield 7;
        } finally {
          log.push('start');
          yield* cancGenAwait(cleanup.promise);
          log.push('end');
        }
      },
      { transformYield: throwingTransform(primary), asyncCancel: true },
    )();
    const first = it.next() as CancelablePromise<IteratorResult<unknown>>;
    let firstDone = false;
    let cancelDone = false;
    const outcome = first.then(
      (value) => {
        firstDone = true;
        return value;
      },
      (error: unknown) => {
        firstDone = true;
        return error;
      },
    );
    const cancellation = first.cancel() as PromiseLike<unknown>;
    const waited = Promise.resolve(cancellation).then(() => {
      cancelDone = true;
    });
    await flush();
    expect(log).toEqual(['start']);
    expect(firstDone).toBe(false);
    expect(cancelDone).toBe(false);

    cleanup.resolve();
    await waited;
    expect(await outcome).toBe(primary);
    expect(log).toEqual(['start', 'end']);
  });

  it('rejects a transform on the final result without reentering the generator', async () => {
    const primary = new Error('final transform');
    let closes = 0;
    const it = cancGenAsync(
      function* () {
        try {
          return 7;
        } finally {
          closes++;
        }
      },
      { transformYield: throwingTransform(primary) },
    )();
    await expect(it.next()).rejects.toBe(primary);
    expect(closes).toBe(1);
    await expect(it.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('continues normal transformations without a drain', async () => {
    const it = cancGenAsync(
      function* () {
        yield 2;
        return 3;
      },
      { transformYield: (value) => value * 10 },
    )();
    await expect(it.next()).resolves.toEqual({ value: 20, done: false });
    await expect(it.next()).resolves.toEqual({ value: 30, done: true });
  });

  it('keeps cancellation ahead of errors during deferred shielded cleanup', async () => {
    const primary = new Error('deferred transform');
    const gate = controlled<void>();
    const log: string[] = [];
    const it = cancGenAsync(
      function* () {
        try {
          yield* cancGenAwait(CancelablePromise.resolve(gate.promise, { shield: true }));
          yield 7;
        } finally {
          log.push('finally');
        }
      },
      { transformYield: throwingTransform(primary), asyncCancel: true },
    )();
    const first = it.next() as CancelablePromise<IteratorResult<unknown>>;
    const rejection = first.then(
      () => undefined,
      (error: unknown) => error,
    );
    await flush();
    const cancellation = first.cancel();
    gate.resolve();
    await flush();
    expect(log).toEqual(['finally']);
    expect(await rejection).toBe(primary);
    await Promise.resolve(cancellation);
    await expect(it.next()).resolves.toEqual({ value: undefined, done: true });
  });
});
