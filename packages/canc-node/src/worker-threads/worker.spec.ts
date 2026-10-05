import { once } from 'node:events';
import { Worker as NodeWorker } from 'node:worker_threads';

import { CancelablePromise, CancelError } from '@cancjs/promise';

import { Worker } from './worker';

const forever = `
  setInterval(() => {}, 1000);
`;

const failing = `
  throw new Error('worker blew up');
`;

describe('Worker', () => {
  const workers = new Set<NodeWorker>();

  function track<T extends NodeWorker>(worker: T): T {
    workers.add(worker);
    return worker;
  }

  afterEach(async () => {
    for (const worker of workers) {
      await worker.terminate();
    }
    workers.clear();
  });

  it('returns the worker node returns', () => {
    const worker = track(new Worker(forever, { eval: true }));

    expect(worker).toBeInstanceOf(NodeWorker);
    expect(typeof worker.postMessage).toBe('function');
    expect(typeof worker.threadId).toBe('number');
  });

  it('creates the promise only when it is asked for, and only once', () => {
    const worker = track(new Worker(forever, { eval: true }));

    expect(Object.keys(worker)).not.toContain('promise');
    expect({ ...worker }).not.toHaveProperty('promise');
    expect(Object.prototype.propertyIsEnumerable.call(worker, 'promise')).toBe(false);
    expect(worker.promise).toBe(worker.promise);
    expect(worker.promise).toBeInstanceOf(CancelablePromise);
  });

  it('resolves the exit code once the thread is done', async () => {
    const worker = track(new Worker('', { eval: true }));

    await expect(worker.promise).resolves.toBe(0);
  });

  it('rejects what the thread threw', async () => {
    const worker = track(new Worker(failing, { eval: true }));

    await expect(worker.promise).rejects.toThrow('worker blew up');
  });

  it('settles a promise taken after the thread already exited', async () => {
    const worker = track(new Worker('process.exit(4);', { eval: true }));
    await once(worker, 'exit');

    await expect(worker.promise).resolves.toBe(4);
  });

  it('terminates the thread when the promise is canceled', async () => {
    const worker = track(new Worker(forever, { eval: true }));
    const promise = worker.promise;
    const order: string[] = [];

    worker.on('exit', () => order.push('exit'));
    await once(worker, 'online');

    await promise.cancel();
    order.push('cancel');

    expect(order).toEqual(['exit', 'cancel']);
    await expect(promise).rejects.toThrow(CancelError);
  });
});
