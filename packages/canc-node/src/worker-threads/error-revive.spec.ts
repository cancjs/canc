import { resolve } from 'node:path';

import { CancelError, isCancelError, isTimeoutError, TimeoutError } from '@cancjs/promise';

import {
  isJsonParseError,
  isNotImplementedError,
  isProcessExitError,
  isProcessSpawnError,
  JsonParseError,
  NotImplementedError,
  ProcessExitError,
  ProcessSpawnError,
} from '../errors/classes';
import { reviveWorkerError } from './error-revive';
import { runTask } from './run-task';
import { Worker } from './worker';

const promiseSrc = resolve(__dirname, '../../../canc-promise/src/index.ts');
const errorClassesSrc = resolve(__dirname, '../errors/classes.ts');

/**
 * Prelude for a worker thread: transpiles `.ts` on the fly and points `@cancjs/promise` and
 * `@cancjs/node` at source, so the thread throws the same canc classes this test imports. Only the
 * error classes of `@cancjs/node` are needed, so that alias skips the rest of the package.
 */
function workerPrelude(): string {
  return `
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
    const kinds = { ...require('@cancjs/node'), ...require('@cancjs/promise') };
  `;
}

/** A worker script that throws the named real canc class. */
function throwing(kind: string, extra = ''): string {
  return `${workerPrelude()}
    const error = new kinds[${JSON.stringify(kind)}]('task stopped');
    ${extra}
    throw error;
  `;
}

/** A plain Error as node hands it over for a thrown error, carrying the name, own props and cause. */
function serialized(name: string, message: string): Error {
  const error = new Error(message, { cause: new Error('inner') });
  error.name = name;
  return error;
}

async function reasonOf(promise: PromiseLike<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (err: unknown) => err,
  );
}

describe('@cancjs/node worker-threads error revival', () => {
  describe('from a worker thread', () => {
    it('rebuilds a CancelError thrown as the real class', async () => {
      const reason = await reasonOf(runTask(throwing('CancelError'), undefined, { eval: true }));

      expect(isCancelError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(CancelError);
      expect((reason as Error).message).toBe('task stopped');
    });

    it('rebuilds a TimeoutError thrown as the real class', async () => {
      const reason = await reasonOf(runTask(throwing('TimeoutError'), undefined, { eval: true }));

      expect(isTimeoutError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(TimeoutError);
    });

    it('rebuilds a ProcessExitError and keeps its exitCode', async () => {
      const reason = await reasonOf(
        runTask(throwing('ProcessExitError', 'error.exitCode = 3;'), undefined, { eval: true }),
      );

      expect(isProcessExitError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(ProcessExitError);
      expect((reason as { exitCode?: number }).exitCode).toBe(3);
    });

    it('rebuilds a ProcessSpawnError thrown as the real class', async () => {
      const reason = await reasonOf(runTask(throwing('ProcessSpawnError'), undefined, { eval: true }));

      expect(isProcessSpawnError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(ProcessSpawnError);
    });

    it('rebuilds a JsonParseError thrown as the real class', async () => {
      const reason = await reasonOf(runTask(throwing('JsonParseError'), undefined, { eval: true }));

      expect(isJsonParseError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(JsonParseError);
    });

    it('rebuilds a NotImplementedError thrown as the real class', async () => {
      const reason = await reasonOf(runTask(throwing('NotImplementedError'), undefined, { eval: true }));

      expect(isNotImplementedError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(NotImplementedError);
    });

    it('revives a canc error reached through cause', async () => {
      const script = throwing('CancelError', `error.cause = new kinds.TimeoutError('slow');`);
      const reason = await reasonOf(runTask(script, undefined, { eval: true }));

      expect(isCancelError(reason)).toBe(true);
      expect(isTimeoutError((reason as { cause?: unknown }).cause)).toBe(true);
    });

    it.each([
      ['@cancjs/toolbox:SupersededError', 'SupersededError'],
      ['@cancjs/coroutine:IterationError', 'IterationError'],
      ['@cancjs/coroutine:BreakError', 'BreakError'],
    ])('revives a %s stand-in by its brand key, with no import of the owning package', async (key, name) => {
      // worker sees only the brand string, as node clone carries it
      const script = `${workerPrelude()}
        const error = new Error('stopped');
        error.name = ${JSON.stringify(name)};
        error._cancErrorBrand = ${JSON.stringify(key)};
        throw error;
      `;
      const reason = await reasonOf(runTask(script, undefined, { eval: true }));

      expect((reason as Record<symbol, unknown>)[Symbol.for(key)]).toBe(true);
      expect((reason as Error).name).toBe(name);
      expect((reason as Error).message).toBe('stopped');
    });

    it('leaves a foreign class named CancelError as a plain error', async () => {
      const script = `${workerPrelude()}
        class CancelError extends Error {
          constructor(message) {
            super(message);
            this.name = 'CancelError';
          }
        }
        throw new CancelError('stopped');
      `;
      const reason = await reasonOf(runTask(script, undefined, { eval: true }));

      expect(isCancelError(reason)).toBe(false);
      expect((reason as Error).name).toBe('CancelError');
    });

    it('leaves a plain worker error with an unknown name unchanged', async () => {
      const reason = await reasonOf(
        runTask(`const error = new Error('x'); error.name = 'Boom'; throw error;`, undefined, { eval: true }),
      );

      expect(isCancelError(reason)).toBe(false);
      expect((reason as Error).name).toBe('Boom');
    });

    it('Worker promise rejects a revived CancelError from the thread error event', async () => {
      const worker = new Worker(throwing('CancelError'), { eval: true });
      worker.once('error', () => undefined);

      const reason = await reasonOf(worker.promise);
      expect(isCancelError(reason)).toBe(true);
    });
  });

  describe('reviveWorkerError', () => {
    it('leaves a plain Error named CancelError unchanged, since it carries no marker', () => {
      const original = serialized('CancelError', 'stopped');

      expect(reviveWorkerError(original)).toBe(original);
      expect(isCancelError(original)).toBe(false);
    });

    it('leaves a plain Error named TimeoutError unchanged', () => {
      const original = serialized('TimeoutError', 'slow');

      expect(reviveWorkerError(original)).toBe(original);
    });

    it('leaves a caller-defined subclass unchanged even when its name matches', () => {
      class LocalTimeout extends Error {}
      const original = new LocalTimeout('mine');
      original.name = 'TimeoutError';

      expect(reviveWorkerError(original)).toBe(original);
    });

    it('leaves a marker that is not a canc brand key unchanged', () => {
      const original = Object.assign(serialized('Odd', 'x'), { _cancErrorBrand: 'not-a-brand' });

      expect(reviveWorkerError(original)).toBe(original);
    });

    it('leaves a generic brand key longer than the length cap unchanged', () => {
      const key = `@cancjs/pkg:${'A'.repeat(200)}`;
      const original = Object.assign(serialized('Long', 'x'), { _cancErrorBrand: key });

      expect(reviveWorkerError(original)).toBe(original);
    });

    it('stops reviving new generic keys once the prototype cache is full', () => {
      // distinct keys, all under the length cap, so only the cache cap can stop a revival
      const originals = Array.from({ length: 100 }, (_, index) =>
        Object.assign(serialized('Gen', 'x'), { _cancErrorBrand: `@cancjs/gen:${'G'.repeat(index + 1)}` }),
      );
      const revived = originals.filter((original) => reviveWorkerError(original) !== original);

      expect(revived.length).toBeLessThanOrEqual(64);
      expect(reviveWorkerError(originals[originals.length - 1])).toBe(originals[originals.length - 1]);
    });

    it('leaves a non-error value unchanged', () => {
      expect(reviveWorkerError('stopped')).toBe('stopped');
    });

    it('revives a marked instance by its brand key, and keeps the marker on the result', () => {
      const marked = Object.assign(serialized('Whatever', 'stopped'), {
        _cancErrorBrand: '@cancjs/promise:CancelError',
      });
      const revived = reviveWorkerError(marked) as Error & { _cancErrorBrand: string };

      expect(isCancelError(revived)).toBe(true);
      expect(revived.message).toBe('stopped');
      expect(revived._cancErrorBrand).toBe('@cancjs/promise:CancelError');
    });

    it('keeps a ProcessExitError class reference usable as an instanceof check after revival', () => {
      const marked = Object.assign(serialized('ProcessExitError', 'x'), {
        _cancErrorBrand: '@cancjs/node:ProcessExitError',
      });

      expect(reviveWorkerError(marked)).toBeInstanceOf(ProcessExitError);
    });
  });
});
