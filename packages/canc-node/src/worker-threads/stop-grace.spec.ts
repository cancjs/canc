import { Worker } from 'node:worker_threads';

import { CancelError } from '@cancjs/promise';

import { runTask, STOP_MESSAGE } from './run-task';

const source = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { state, ack, finish, fail } = workerData;
  parentPort.on('message', message => {
    if (message !== ${JSON.stringify(STOP_MESSAGE)}) return;
    if (ack) parentPort.postMessage({ type: 'stop-grace-ack' });
    Atomics.store(state, 1, 1);
    if (finish) {
      Atomics.wait(state, 2, 0);
      if (fail) throw new Error('late worker error');
      Atomics.store(state, 0, 2);
      process.exit(0);
    }
  });
  Atomics.store(state, 0, 1);
`;

async function until(test: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!test()) {
    if (Date.now() > deadline) throw new Error('worker did not reach gate');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// Observe the fixture's native message dispatch without replacing the library handler
function observeAck(delayed: boolean) {
  const emit = Worker.prototype.emit;
  const emitDescriptor = Object.getOwnPropertyDescriptor(Worker.prototype, 'emit');
  const postMessage = Worker.prototype.postMessage;
  const terminate = Worker.prototype.terminate;
  const owned = new WeakSet<Worker>();
  let pending: (() => boolean) | undefined;
  let dispatched = false;
  let terminateCalls = 0;
  Worker.prototype.postMessage = function (value, transferList) {
    if (value === STOP_MESSAGE) owned.add(this);
    return postMessage.call(this, value, transferList);
  };
  Worker.prototype.emit = function (this: Worker, event: string | symbol, ...args: unknown[]) {
    if (
      owned.has(this) &&
      event === 'message' &&
      (args[0] as { type?: string } | undefined)?.type === 'stop-grace-ack'
    ) {
      const dispatch = () => {
        const result = emit.call(this, event, ...args);
        dispatched = true;
        return result;
      };
      if (delayed) {
        pending = dispatch;
        return true;
      }
      return dispatch();
    }
    return emit.call(this, event, ...args);
  };
  Worker.prototype.terminate = function () {
    if (owned.has(this)) terminateCalls++;
    return terminate.call(this);
  };
  return {
    async beforeCleanup(state: Int32Array) {
      if (delayed) {
        await until(() => pending !== undefined);
        expect(Atomics.load(state, 2)).toBe(0);
        expect(dispatched).toBe(false);
        pending!();
      }
      await until(() => dispatched);
      expect(Atomics.load(state, 0)).toBe(1);
      expect(Atomics.load(state, 2)).toBe(0);
      expect(terminateCalls).toBe(0);
    },
    restore() {
      if (emitDescriptor) Object.defineProperty(Worker.prototype, 'emit', emitDescriptor);
      else Reflect.deleteProperty(Worker.prototype, 'emit');
      Worker.prototype.postMessage = postMessage;
      Worker.prototype.terminate = terminate;
    },
  };
}

describe('worker stop acknowledgment', () => {
  it.each([
    { ack: true, finish: true, terminate: 'graceful' as const, expected: 2, delayed: false },
    { ack: true, finish: true, terminate: 'graceful' as const, expected: 2, delayed: true },
    { ack: false, finish: true, terminate: 'graceful' as const, expected: 2, delayed: false },
    { ack: true, finish: true, terminate: 'immediate' as const, expected: 1, delayed: false },
    { ack: true, finish: false, terminate: 'graceful' as const, expected: 1, delayed: false },
  ])('keeps cleanup policy for %j', async ({ ack, finish, terminate, expected, delayed }) => {
    const state = new Int32Array(new SharedArrayBuffer(12));
    const observer = ack && finish && terminate === 'graceful' ? observeAck(delayed) : undefined;
    const task = runTask(source, { state, ack, finish }, { eval: true, terminate, gracePeriod: finish ? 5000 : 150 });
    const outcome = task.catch((error: unknown) => error);
    try {
      await until(() => Atomics.load(state, 0) === 1);
      const drain = task.cancel();
      if (finish && terminate === 'graceful') {
        await until(() => Atomics.load(state, 1) === 1);
        await observer?.beforeCleanup(state);
        Atomics.store(state, 2, 1);
        Atomics.notify(state, 2);
      }
      await drain;
      expect(await outcome).toBeInstanceOf(CancelError);
      expect(Atomics.load(state, 0)).toBe(expected);
    } finally {
      Atomics.store(state, 2, 1);
      Atomics.notify(state, 2);
      try {
        await task.cancel();
      } finally {
        observer?.restore();
      }
    }
  });

  it('does not treat a late worker error as a new result', async () => {
    const state = new Int32Array(new SharedArrayBuffer(12));
    const task = runTask(source, { state, ack: true, finish: true, fail: true }, { eval: true, gracePeriod: 2000 });
    const outcome = task.catch((error: unknown) => error);
    try {
      await until(() => Atomics.load(state, 0) === 1);
      const drain = task.cancel();
      await until(() => Atomics.load(state, 1) === 1);
      Atomics.store(state, 2, 1);
      Atomics.notify(state, 2);
      await drain;
      expect(await outcome).toBeInstanceOf(CancelError);
    } finally {
      Atomics.store(state, 2, 1);
      Atomics.notify(state, 2);
      await task.cancel();
    }
  });

  it('still resolves a normal first message', async () => {
    await expect(
      runTask("require('node:worker_threads').parentPort.postMessage(17)", undefined, { eval: true }),
    ).resolves.toBe(17);
  });
});
