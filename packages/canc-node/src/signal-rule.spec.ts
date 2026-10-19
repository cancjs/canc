import type { LookupOptions } from 'node:dns';
import nodeEvents, { getEventListeners } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';

import { isCancelError } from '@cancjs/promise';

import { spawn } from './child-process/index';
import { generateKey } from './crypto/index';
import { lookup } from './dns/index';
import { on, once } from './events/index';
import { readFile, stat } from './fs/index';
import { createInterface } from './readline/index';
import { finished, pipeline, toArray } from './stream/index';
import { scheduler, setInterval, setTimeout } from './timers/index';
import { runTask } from './worker-threads/index';
import { gzip } from './zlib/index';

type TKind = 'CancelError' | 'AbortError' | 'fulfilled' | 'other';

/** Settle a promise into the kind of outcome the caller sees, never leaving it unhandled. */
function kindOf(promise: PromiseLike<unknown>): Promise<TKind> {
  return Promise.resolve(promise).then(
    () => 'fulfilled',
    (error: unknown) => {
      if (isCancelError(error)) {
        return 'CancelError';
      }
      return (error as { name?: unknown } | null)?.name === 'AbortError' ? 'AbortError' : 'other';
    },
  );
}

/** A readable that never ends on its own. */
function endless(): Readable {
  return new Readable({ read() {} });
}

/** A writable that accepts everything and never finishes. */
function sink(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

// posts a result well after the abort, so a signal the wrapper ignores shows up as fulfilled
const slowTask = `
  const { parentPort } = require('node:worker_threads');
  setTimeout(() => parentPort.postMessage('late'), 300);
`;

interface ICallerAbortRow {
  family: string;
  expected: TKind;
  start(signal: AbortSignal): PromiseLike<unknown>;
}

const disposers: (() => void)[] = [];

const rows: ICallerAbortRow[] = [
  {
    family: 'fs readFile',
    expected: 'CancelError',
    start: (signal) => readFile(__filename, { signal }),
  },
  {
    family: 'events once',
    expected: 'CancelError',
    start: (signal) => once(new nodeEvents.EventEmitter(), 'never', { signal }),
  },
  {
    family: 'events on',
    expected: 'CancelError',
    start: (signal) => on(new nodeEvents.EventEmitter(), 'never', { signal }).next(),
  },
  {
    family: 'timers setTimeout',
    expected: 'CancelError',
    start: (signal) => setTimeout(60000, undefined, { signal }),
  },
  {
    family: 'timers scheduler.wait',
    expected: 'CancelError',
    start: (signal) => scheduler.wait(60000, { signal }),
  },
  {
    family: 'timers setInterval (iterator, raw)',
    expected: 'AbortError',
    start: (signal) => setInterval(60000, undefined, { signal }).next(),
  },
  {
    family: 'stream terminal toArray',
    expected: 'CancelError',
    start: (signal) => toArray(endless(), { signal }),
  },
  {
    family: 'stream pipeline',
    expected: 'CancelError',
    start: (signal) => pipeline(endless(), new PassThrough(), sink(), { signal }),
  },
  {
    family: 'stream finished',
    expected: 'CancelError',
    start: (signal) => finished(endless(), { signal }),
  },
  {
    family: 'readline question',
    expected: 'CancelError',
    start(signal) {
      const input = new PassThrough();
      const rl = createInterface({ input, output: new PassThrough() });
      disposers.push(() => {
        rl.close();
        input.destroy();
      });
      return rl.question('? ', { signal });
    },
  },
  {
    family: 'zlib gzip',
    expected: 'CancelError',
    start: (signal) => gzip(Buffer.alloc(1024), { signal } as Parameters<typeof gzip>[1]),
  },
  {
    family: 'crypto generateKey',
    expected: 'CancelError',
    start: (signal) => generateKey('hmac', { length: 64, signal } as { length: number }),
  },
  {
    family: 'dns lookup',
    expected: 'CancelError',
    start: (signal) => lookup('localhost', { signal } as unknown as LookupOptions),
  },
  {
    family: 'worker runTask',
    expected: 'CancelError',
    start: (signal) =>
      runTask(slowTask, undefined, {
        eval: true,
        terminate: 'immediate',
        signal,
      }),
  },
  {
    family: 'child-process spawn (handle, raw)',
    expected: 'AbortError',
    start: (signal) => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { signal }).promise,
  },
];

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
});

describe('caller signal rule', () => {
  it.each(rows.map((row) => [row.family, row] as const))('%s: caller abort settles by the rule', async (_, row) => {
    const controller = new AbortController();
    const outcome = kindOf(row.start(controller.signal));

    controller.abort();

    await expect(outcome).resolves.toBe(row.expected);
  });
});

interface IThrowingArgsRow {
  family: string;
  call(signal: AbortSignal): PromiseLike<unknown> | undefined;
}

// each call fails node's synchronous argument validation, so the wrapper never reaches the work
const throwingRows: IThrowingArgsRow[] = [
  {
    family: 'fs readFile',
    call: (signal) => readFile(123n as unknown as string, { signal }),
  },
  {
    family: 'fs stat',
    call: (signal) => stat({} as unknown as string, { signal } as Parameters<typeof stat>[1]),
  },
  {
    family: 'stream terminal toArray',
    call: (signal) => toArray({} as unknown as Readable, { signal }),
  },
  {
    family: 'zlib gzip',
    call: (signal) => gzip(123 as unknown as Buffer, { signal } as Parameters<typeof gzip>[1]),
  },
  {
    family: 'crypto generateKey',
    call: (signal) => generateKey('nope' as 'hmac', { length: 64, signal } as { length: number }),
  },
  {
    family: 'dns lookup',
    call: (signal) => lookup(123 as unknown as string, { signal } as unknown as LookupOptions),
  },
  {
    family: 'events once',
    call: (signal) => once(null as unknown as nodeEvents.EventEmitter, 'x', { signal }),
  },
  {
    family: 'events on',
    call: (signal) => on(null as unknown as nodeEvents.EventEmitter, 'x', { signal }).next(),
  },
];

describe('throwing arguments with one long-lived signal', () => {
  it.each(throwingRows.map((row) => [row.family, row] as const))(
    '%s: 100 failed calls leave no abort listener behind',
    async (_, row) => {
      const controller = new AbortController();
      const settled: Promise<TKind>[] = [];

      for (let i = 0; i < 100; i++) {
        let result: PromiseLike<unknown> | undefined;
        try {
          result = row.call(controller.signal);
        } catch (_error) {
          // a synchronous throw is fine, the listener count is what is under test
        }
        if (result) {
          settled.push(kindOf(result));
        }
      }

      const kinds = await Promise.all(settled);

      expect(kinds.filter((kind) => kind === 'fulfilled')).toEqual([]);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
  );
});

describe('events on with a caller signal', () => {
  it('drops its listeners on abort with no pull pending, then rejects the next pull CancelError', async () => {
    const emitter = new nodeEvents.EventEmitter();
    const controller = new AbortController();
    const iterator = on(emitter, 'tick', { signal: controller.signal });

    expect(emitter.listenerCount('tick')).toBe(1);

    controller.abort();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(emitter.listenerCount('tick')).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    await expect(kindOf(iterator.next())).resolves.toBe('CancelError');
  });

  it('releases its abort listener once the caller ends the iteration', async () => {
    const controller = new AbortController();

    for (let i = 0; i < 100; i++) {
      const iterator = on(new nodeEvents.EventEmitter(), 'tick', { signal: controller.signal });
      await iterator.return();
    }

    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});

describe('a call node takes no signal for on the running version', () => {
  it('still lifts the caller signal, so its abort rejects CancelError', async () => {
    let terminals: typeof import('./stream/terminals') | undefined;

    jest.isolateModules(() => {
      jest.doMock('../surface/projected/stream.Readable.json', () => ({
        exports: [{ name: 'toArray', nodeSignal: { documented: false, since: null, probed: null } }],
      }));
      terminals = require('./stream/terminals') as typeof import('./stream/terminals');
    });
    jest.dontMock('../surface/projected/stream.Readable.json');

    const controller = new AbortController();
    const outcome = kindOf(terminals!.toArray(endless(), { signal: controller.signal }));

    controller.abort();

    await expect(outcome).resolves.toBe('CancelError');
  });
});
