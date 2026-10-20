import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';

import { CancelError } from '@cancjs/promise';

import { isProcessExitError } from '../errors/classes';
import { runTask, STOP_MESSAGE } from './run-task';

const STOP = JSON.stringify(STOP_MESSAGE);

const runTaskSrc = resolve(__dirname, 'run-task.ts');
const promiseSrc = resolve(__dirname, '../../../canc-promise/src/index.ts');
const errorClassesSrc = resolve(__dirname, '../errors/classes.ts');

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

const resultThenIdleTask = `
  const { parentPort } = require('node:worker_threads');
  parentPort.postMessage(42);
  setInterval(() => {}, 1000);
`;

// a child process loads run-task from source and must exit on its own once the loop is empty.
// The spawn timeout bounds it, so a leak fails the assert instead of hanging the suite.
const exitingChildScript = `
  const ts = require(${JSON.stringify(require.resolve('typescript'))});
  const Module = require('module');
  const fs = require('fs');
  const aliases = {
    '@cancjs/promise': ${JSON.stringify(promiseSrc)},
    '@cancjs/node': ${JSON.stringify(errorClassesSrc)},
  };
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return Object.prototype.hasOwnProperty.call(aliases, request)
      ? aliases[request]
      : resolveFilename.call(this, request, ...rest);
  };
  Module._extensions['.ts'] = function (mod, filename) {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
        downlevelIteration: true,
        useDefineForClassFields: false,
      },
    });
    mod._compile(out.outputText, filename);
  };
  const { runTask } = require(${JSON.stringify(runTaskSrc)});
  const idle = ${JSON.stringify(resultThenIdleTask)};
  runTask(idle, undefined, { eval: true }).then((value) => console.log('result:' + value));
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

  it('terminates the worker once the result is in, even when it keeps running', async () => {
    // posts its answer and then keeps the thread busy, so only runTask can let the process go
    const promise = runTask<number>(resultThenIdleTask, undefined, { eval: true });

    await expect(promise).resolves.toBe(42);
    expect(terminateSpy).toHaveBeenCalledTimes(1);
  }, 15000);

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

  it('lets the process exit once the result is in, even while the worker keeps running', () => {
    // the spawn timeout bounds the run: a process still alive after 5 s has timed out, so the
    // assert fails here instead of the jest run hanging on the leaked worker
    const child = spawnSync(process.execPath, ['-e', exitingChildScript], { timeout: 5000, encoding: 'utf8' });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('result:42');
  }, 15000);
});
