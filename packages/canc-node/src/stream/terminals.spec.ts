import { Readable } from 'node:stream';

import { isCancelError } from '@cancjs/promise';

import * as terminalsExports from './terminals';
import { every, find, forEach, reduce, some, toArray } from './terminals';

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** A readable that counts every `_read` call and pushes one object per call, one tick later. */
function makeCountingStream(): { stream: Readable; pulls: () => number } {
  let pulls = 0;
  let next = 0;

  const stream = new Readable({
    objectMode: true,
    read() {
      pulls += 1;
      const current = next;
      next += 1;
      setImmediate(() => {
        this.push({ current });
      });
    },
  });

  return { stream, pulls: () => pulls };
}

describe('@cancjs/node/stream terminals module exports', () => {
  it('exports exactly the six promise-returning terminals', () => {
    expect(new Set(Object.keys(terminalsExports))).toEqual(
      new Set(['toArray', 'some', 'every', 'find', 'forEach', 'reduce']),
    );
  });

  it('does not export the lazy Readable helpers, a deliberate omission', () => {
    const namespace = terminalsExports as Record<string, unknown>;

    expect(namespace.map).toBeUndefined();
    expect(namespace.filter).toBeUndefined();
    expect(namespace.take).toBeUndefined();
    expect(namespace.drop).toBeUndefined();
    expect(namespace.flatMap).toBeUndefined();
  });
});

describe('toArray', () => {
  it('canceled mid-consumption rejects CancelError and stops pulling', async () => {
    const { stream, pulls } = makeCountingStream();

    const p = toArray(stream);

    await tick();
    await tick();

    const pullsBeforeCancel = pulls();
    expect(pullsBeforeCancel).toBeGreaterThan(0);

    p.cancel('stop reading');

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);

    // the promise itself settles as soon as cancel() runs; node's own abort handling, including
    // the destroy that stops the pending read, lands a tick or two later
    await tick();
    await tick();
    await tick();

    expect(stream.destroyed).toBe(true);

    const pullsOnceStopped = pulls();
    await tick();
    await tick();
    await tick();

    expect(pulls()).toBe(pullsOnceStopped);
  });

  it('resolves with the stream contents when not canceled', async () => {
    const source = Readable.from([1, 2, 3]);

    await expect(toArray<number>(source)).resolves.toEqual([1, 2, 3]);
  });
});

describe('reduce', () => {
  it('with an initial value and a concurrency option still honors cancel', async () => {
    const { stream } = makeCountingStream();

    const p = reduce<{ current: number }, number>(
      stream,
      (acc, chunk) => acc + chunk.current,
      0,
      // reduce iterates one chunk at a time and never reads concurrency; this proves an
      // options bag carrying it does not disturb the signal this wrapper still injects
      { concurrency: 4 } as unknown as { signal?: AbortSignal },
    );

    await tick();
    p.cancel('stop reducing');

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);

    await tick();
    expect(stream.destroyed).toBe(true);
  });

  it('with no initial value still honors cancel through the destroy fallback', async () => {
    const { stream } = makeCountingStream();

    const p = reduce<{ current: number }, { current: number }>(stream, (acc, chunk) => ({
      current: acc.current + chunk.current,
    }));

    await tick();
    p.cancel();

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);
    expect(stream.destroyed).toBe(true);
  });

  it('sums a finite stream with an initial value, not canceled', async () => {
    const source = Readable.from([1, 2, 3]);

    await expect(reduce<number, number>(source, (acc, chunk) => acc + chunk, 0)).resolves.toBe(6);
  });
});

describe('some, every, find, forEach', () => {
  it('some resolves true once a chunk satisfies the predicate', async () => {
    const source = Readable.from([1, 2, 3]);

    await expect(some<number>(source, (chunk) => chunk === 2)).resolves.toBe(true);
  });

  it('every resolves false once a chunk fails the predicate', async () => {
    const source = Readable.from([1, 2, 3]);

    await expect(every<number>(source, (chunk) => chunk < 2)).resolves.toBe(false);
  });

  it('find resolves with the first matching chunk', async () => {
    const source = Readable.from([1, 2, 3]);

    await expect(find<number>(source, (chunk) => chunk === 2)).resolves.toBe(2);
  });

  it('forEach canceled mid-consumption rejects CancelError and stops pulling', async () => {
    const { stream, pulls } = makeCountingStream();
    const seen: number[] = [];

    const p = forEach<{ current: number }>(stream, (chunk) => {
      seen.push(chunk.current);
    });

    await tick();
    await tick();

    const pullsBeforeCancel = pulls();
    expect(pullsBeforeCancel).toBeGreaterThan(0);

    p.cancel();

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);

    await tick();
    await tick();
    await tick();
    expect(stream.destroyed).toBe(true);

    const pullsOnceStopped = pulls();
    await tick();
    await tick();
    await tick();
    expect(pulls()).toBe(pullsOnceStopped);
  });
});
