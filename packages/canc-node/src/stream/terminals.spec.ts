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

describe('cancel destroys the source stream', () => {
  function idleStream(): Readable {
    return new Readable({
      objectMode: true,
      read() {
        /* never pushes */
      },
    });
  }

  async function expectCancelRejection(p: PromiseLike<unknown>): Promise<void> {
    const caught: unknown = await p.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isCancelError(caught)).toBe(true);
  }

  it('toArray cancel destroys an idle source by default', async () => {
    const stream = idleStream();
    const p = toArray(stream);

    await tick();
    p.cancel();

    await expectCancelRejection(p);
    expect(stream.destroyed).toBe(true);
  });

  it('leaves the same listeners on a destroyed idle source as node toArray with a signal does', async () => {
    const LISTENED = ['data', 'readable', 'end', 'error', 'close'];

    // native baseline: abort node's toArray on an idle stream, then destroy it as cancel does
    const nativeStream = idleStream();
    const controller = new AbortController();
    const nativeSettled = nativeStream.toArray({ signal: controller.signal }).then(
      () => undefined,
      () => undefined,
    );
    await tick();
    controller.abort();
    nativeStream.destroy();
    await nativeSettled;
    const native = LISTENED.map((event) => nativeStream.listenerCount(event));

    const canceledStream = idleStream();
    const p = toArray(canceledStream);
    await tick();
    p.cancel();
    await expectCancelRejection(p);
    const canc = LISTENED.map((event) => canceledStream.listenerCount(event));

    expect(canc).toEqual(native);
  });

  it('every terminal destroys an idle source on cancel', async () => {
    const calls = [
      (s: Readable) => some(s, () => false),
      (s: Readable) => every(s, () => true),
      (s: Readable) => find(s, () => false),
      (s: Readable) => forEach(s, () => undefined),
      (s: Readable) => reduce(s, (acc: number) => acc, 0),
    ];

    for (const call of calls) {
      const stream = idleStream();
      const p = call(stream);

      await tick();
      p.cancel();

      await expectCancelRejection(p);
      expect(stream.destroyed).toBe(true);
    }
  });

  it('keeps the source alive when destroyOnCancel is false', async () => {
    const stream = idleStream();
    const p = toArray(stream, { destroyOnCancel: false });

    await tick();
    p.cancel();

    await expectCancelRejection(p);
    expect(stream.destroyed).toBe(false);

    stream.destroy();
  });

  it('with destroyOnCancel false leaves an in-flight source open on cancel and on a caller signal, as native does', async () => {
    // native baseline: abort node's own toArray on an idle stream and leave the stream alone
    const nativeStream = idleStream();
    const nativeController = new AbortController();
    nativeStream.toArray({ signal: nativeController.signal }).then(
      () => undefined,
      () => undefined,
    );
    await tick();
    nativeController.abort();
    await tick();
    const nativeDestroyed = nativeStream.destroyed;
    nativeStream.destroy();

    // reads in flight are where node destroys on abort, so the signal stays withheld
    const canceled = makeCountingStream();
    const p = toArray(canceled.stream, { destroyOnCancel: false });
    await tick();
    await tick();
    p.cancel();
    await expectCancelRejection(p);
    await tick();
    const canceledDestroyed = canceled.stream.destroyed;
    canceled.stream.destroy();

    const signaled = makeCountingStream();
    const controller = new AbortController();
    const q = toArray(signaled.stream, { signal: controller.signal, destroyOnCancel: false });
    await tick();
    await tick();
    controller.abort();
    await expectCancelRejection(q);
    await tick();
    const signaledDestroyed = signaled.stream.destroyed;
    signaled.stream.destroy();

    expect(nativeDestroyed).toBe(false);
    expect(canceledDestroyed).toBe(false);
    expect(signaledDestroyed).toBe(false);
  });

  it('destroys the source on cancel by default, and with destroyOnCancel false hands it back readable', async () => {
    const destroyed = makeCountingStream();
    const p = forEach(destroyed.stream, () => undefined);
    await tick();
    await tick();
    p.cancel();
    await expectCancelRejection(p);
    await tick();
    await tick();
    await tick();

    const kept = makeCountingStream();
    const seen: number[] = [];
    const q = forEach<{ current: number }>(
      kept.stream,
      (chunk) => {
        seen.push(chunk.current);
      },
      { destroyOnCancel: false },
    );
    await tick();
    await tick();
    q.cancel();
    await expectCancelRejection(q);
    const seenAtCancel = seen.length;
    expect(seenAtCancel).toBeGreaterThan(0);

    // the terminal's own loop has let go: the source is no longer drained into the canceled
    // visitor, and reading it again gets fresh chunks
    await tick();
    await tick();
    await tick();
    expect(seen).toHaveLength(seenAtCancel);

    const readAfter: number[] = [];
    for await (const chunk of kept.stream.iterator({ destroyOnReturn: false })) {
      readAfter.push((chunk as { current: number }).current);
      if (readAfter.length === 3) {
        break;
      }
    }

    expect(destroyed.stream.destroyed).toBe(true);
    expect(kept.stream.destroyed).toBe(false);
    expect(seen).toHaveLength(seenAtCancel);
    expect(readAfter).toHaveLength(3);
    // one chunk, taken by the canceled read after the last one it delivered, is dropped
    expect(readAfter[0]).toBe(seen[seenAtCancel - 1] + 2);

    kept.stream.destroy();
  });
});
