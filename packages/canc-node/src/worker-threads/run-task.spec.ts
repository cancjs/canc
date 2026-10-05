import { Worker as NodeWorker } from 'node:worker_threads';

import { CancelError } from '@cancjs/promise';

import { isProcessExitError } from '../errors/classes';
import { runTask, STOP_MESSAGE } from './run-task';

const STOP = JSON.stringify(STOP_MESSAGE);

const echoTask = `
  const { parentPort, workerData } = require('node:worker_threads');
  parentPort.postMessage(workerData.a + workerData.b);
`;

// writes to the shared flag before leaving, which is how the test tells "read the stop message and
// shut itself down" apart from "was killed at an arbitrary point"
const cooperatingTask = `
  const { parentPort, workerData } = require('node:worker_threads');
  parentPort.on('message', (message) => {
    if (message === ${STOP}) {
      Atomics.store(workerData, 0, 1);
      process.exit(0);
    }
  });
  setInterval(() => {}, 1000);
`;

const deafTask = `
  setInterval(() => {}, 1000);
`;

const exitingTask = `
  process.exit(7);
`;

const throwingTask = `
  throw new Error('task blew up');
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sharedFlag(): Int32Array {
  return new Int32Array(new SharedArrayBuffer(4));
}

describe('runTask', () => {
  let terminateSpy: jest.SpyInstance;

  beforeEach(() => {
    terminateSpy = jest.spyOn(NodeWorker.prototype, 'terminate');
  });

  afterEach(() => {
    terminateSpy.mockRestore();
  });

  it('resolves the result the worker posts back', async () => {
    await expect(runTask<number>(echoTask, { a: 2, b: 3 }, { eval: true })).resolves.toBe(5);
  });

  it('rejects a worker that ends without posting a result', async () => {
    let caught: unknown;
    try {
      await runTask(exitingTask, undefined, { eval: true });
    } catch (err) {
      caught = err;
    }

    expect(isProcessExitError(caught)).toBe(true);
    expect((caught as { exitCode?: number | null }).exitCode).toBe(7);
  });

  it('rejects the error the worker threw', async () => {
    await expect(runTask(throwingTask, undefined, { eval: true })).rejects.toThrow('task blew up');
  });

  it('cancels gracefully: the worker reads the stop message and exits without being terminated', async () => {
    const flag = sharedFlag();
    const promise = runTask(cooperatingTask, flag, { eval: true, gracePeriod: 3000 });

    // the thread needs to be up and listening before the stop message means anything
    await sleep(300);

    const startedAt = Date.now();
    await promise.cancel();
    const elapsed = Date.now() - startedAt;

    expect(Atomics.load(flag, 0)).toBe(1);
    expect(terminateSpy).not.toHaveBeenCalled();
    expect(elapsed).toBeLessThan(2000);
    await expect(promise).rejects.toThrow(CancelError);
  }, 15000);

  it('terminates a worker that ignores the stop message, once the grace period is over', async () => {
    const gracePeriod = 600;
    const promise = runTask(deafTask, undefined, { eval: true, gracePeriod });

    await sleep(300);

    const startedAt = Date.now();
    await promise.cancel();
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(gracePeriod - 50);
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toThrow(CancelError);
  }, 15000);

  it('skips the grace period entirely for terminate immediate', async () => {
    const gracePeriod = 5000;
    const promise = runTask(deafTask, undefined, { eval: true, gracePeriod, terminate: 'immediate' });

    await sleep(300);

    const startedAt = Date.now();
    await promise.cancel();
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(1000);
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toThrow(CancelError);
  }, 15000);
});
