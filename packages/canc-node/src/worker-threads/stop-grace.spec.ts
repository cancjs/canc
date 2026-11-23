import { CancelError } from '@cancjs/promise';

import { runTask, STOP_MESSAGE } from './run-task';

const source = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { state, ack, finish, fail } = workerData;
  parentPort.on('message', message => {
    if (message !== ${JSON.stringify(STOP_MESSAGE)}) return;
    if (ack) parentPort.postMessage({ type: 'ack' });
    Atomics.store(state, 1, 1);
    if (finish) {
      Atomics.wait(state, 2, 0, 1000);
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

describe('worker stop acknowledgment', () => {
  it.each([
    { ack: true, finish: true, terminate: 'graceful' as const, expected: 2 },
    { ack: false, finish: true, terminate: 'graceful' as const, expected: 2 },
    { ack: true, finish: true, terminate: 'immediate' as const, expected: 1 },
    { ack: true, finish: false, terminate: 'graceful' as const, expected: 1 },
  ])('keeps cleanup policy for %j', async ({ ack, finish, terminate, expected }) => {
    const state = new Int32Array(new SharedArrayBuffer(12));
    const task = runTask(source, { state, ack, finish }, { eval: true, terminate, gracePeriod: finish ? 2000 : 150 });
    const outcome = task.catch((error: unknown) => error);
    try {
      await until(() => Atomics.load(state, 0) === 1);
      const drain = task.cancel();
      if (finish && terminate === 'graceful') {
        await until(() => Atomics.load(state, 1) === 1);
        // Let the posted ack reach the parent before opening the cleanup gate.
        await new Promise((resolve) => setTimeout(resolve, 80));
        Atomics.store(state, 2, 1);
        Atomics.notify(state, 2);
      }
      await drain;
      expect(await outcome).toBeInstanceOf(CancelError);
      expect(Atomics.load(state, 0)).toBe(expected);
    } finally {
      Atomics.store(state, 2, 1);
      Atomics.notify(state, 2);
      await task.cancel();
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
