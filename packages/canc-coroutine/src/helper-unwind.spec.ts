import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { cancAsync, cancForAwait } from './coroutine';
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

function countingSource() {
  const state = { pulls: 0, closed: false };
  async function* source() {
    try {
      for (let i = 0; ; i++) {
        state.pulls++;
        yield i;
      }
    } finally {
      state.closed = true;
    }
  }
  return { state, source };
}

describe('canc helpers under cancel in cancAsync', () => {
  it('stops a forAwait whose generator callback awaits in finally, and never resumes the body', async () => {
    const { state, source } = countingSource();
    const work = controlled<void>();
    const cleanup = controlled<void>();
    const log: string[] = [];

    const co = cancAsync(function* () {
      try {
        yield* cancForAwait(source(), function* (value: number) {
          try {
            yield work.promise;
          } finally {
            yield cleanup.promise;
            log.push(`cb cleanup ${value}`);
          }
        });
        log.push('after loop');
      } finally {
        log.push('outer finally');
      }
    });

    const p = co();
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await flush();
    const pullsAtCancel = state.pulls;

    p.cancel();
    await flush();
    expect(work.canceledCount()).toBe(1);
    expect(cleanup.canceledCount()).toBe(0);

    cleanup.resolve();
    expect(isCancelError(await settled)).toBe(true);
    expect(log).toEqual(['cb cleanup 0', 'outer finally']);
    expect(state.pulls - pullsAtCancel).toBeLessThanOrEqual(1);
    expect(state.closed).toBe(true);
  });

  it('never resumes the body after a cancel lands inside toArray', async () => {
    const gate = controlled<number>();
    const log: string[] = [];

    const co = cancAsync(function* () {
      yield* cancForAwait.toArray([gate.promise]);
      log.push('after toArray');
    });

    const p = co();
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await flush();

    p.cancel();
    expect(isCancelError(await settled)).toBe(true);
    expect(log).toEqual([]);
    expect(gate.canceledCount()).toBe(1);
  });

  it('runs forAwait and toArray inside a finally during the drain to their end, then the rest of finally', async () => {
    const gate = controlled<void>();
    const log: string[] = [];

    const co = cancAsync(function* () {
      try {
        yield gate.promise;
      } finally {
        yield* cancForAwait([1, 2], (item: number) => {
          log.push(`cleanup item ${item}`);
        });
        log.push('after cleanup forAwait');
        const collected = yield* cancForAwait.toArray([3, 4]);
        log.push(`toArray ${collected.join(',')}`);
      }
    });

    const p = co();
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await flush();

    p.cancel();
    expect(isCancelError(await settled)).toBe(true);
    expect(log).toEqual(['cleanup item 1', 'cleanup item 2', 'after cleanup forAwait', 'toArray 3,4']);
  });

  it('lets a user yield* helper whose finally awaits resume the canceled body (documented limitation)', async () => {
    const work = controlled<string>();
    const cleanup = controlled<void>();
    const log: string[] = [];

    function* subTask(): Generator<unknown, string, any> {
      try {
        return yield work.promise;
      } finally {
        yield cleanup.promise;
        log.push('sub finally end');
      }
    }

    const co = cancAsync(function* () {
      try {
        yield* subTask();
        log.push('after helper');
      } finally {
        log.push('outer finally');
      }
    });

    const p = co();
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await flush();

    p.cancel();
    await flush();
    cleanup.resolve();
    expect(isCancelError(await settled)).toBe(true);
    expect(log).toEqual(['sub finally end', 'after helper', 'outer finally']);
  });
});

describe('canc helpers under a consumer break in cancGenAsync', () => {
  it('ends the producer when the consumer breaks inside cancGenDelegate', async () => {
    const log: string[] = [];
    async function* source() {
      try {
        yield 'a';
        yield 'b';
      } finally {
        log.push('source finally');
      }
    }

    const produce = cancGenAsync(function* () {
      try {
        yield* cancGenDelegate(source());
        log.push('after delegate');
        yield 'trailer';
      } finally {
        log.push('producer finally');
      }
    });

    const it = produce();
    for await (const value of it) {
      log.push(`got ${value}`);
      break;
    }

    expect(log).toEqual(['got a', 'source finally', 'producer finally']);
    expect(await it.next()).toEqual({ value: undefined, done: true });
  });

  it('ends the producer when the consumer breaks on an item a forAwait callback emits', async () => {
    const log: string[] = [];

    const produce = cancGenAsync(function* () {
      try {
        yield* cancGenForAwait([1, 2, 3], function* (value: number) {
          yield value * 10;
        });
        log.push('after forAwait');
        yield 'trailer';
      } finally {
        log.push('producer finally');
      }
    });

    const it = produce();
    for await (const value of it) {
      log.push(`got ${String(value)}`);
      break;
    }

    expect(log).toEqual(['got 10', 'producer finally']);
  });

  it('runs a forAwait callback finally that awaits, then stops pulling the source', async () => {
    const { state, source } = countingSource();
    const log: string[] = [];

    const produce = cancGenAsync(function* () {
      try {
        yield* cancGenForAwait(source(), function* (value: number) {
          try {
            yield value;
          } finally {
            yield* cancGenAwait(CancelablePromise.resolve());
            log.push(`cb cleanup ${value}`);
          }
        });
        log.push('after forAwait');
      } finally {
        log.push('producer finally');
      }
    });

    const it = produce();
    for await (const value of it) {
      log.push(`got ${String(value)}`);
      break;
    }

    expect(log).toEqual(['got 0', 'cb cleanup 0', 'producer finally']);
    expect(state.pulls).toBe(1);
    expect(state.closed).toBe(true);
  });

  it('lets a user yield* helper whose finally awaits resume the producer (documented limitation)', async () => {
    const log: string[] = [];

    function* subStream() {
      try {
        yield 'a';
        yield 'b';
      } finally {
        yield* cancGenAwait(CancelablePromise.resolve());
      }
    }

    const produce = cancGenAsync(function* () {
      yield* subStream();
      log.push('after helper');
      yield 'trailer';
    });

    const it = produce();
    expect(await it.next()).toEqual({ value: 'a', done: false });
    expect(await it.return(undefined)).toEqual({ value: 'trailer', done: false });
    expect(log).toEqual(['after helper']);
  });
});
