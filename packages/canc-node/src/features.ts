import * as events from 'node:events';
import * as fsp from 'node:fs/promises';
import { builtinModules } from 'node:module';
import * as consumers from 'node:stream/consumers';
import * as workerThreads from 'node:worker_threads';

/**
 * Feature availability detected at module load.
 */
export const features = Object.freeze({
  hasGlob: typeof (fsp as { glob?: unknown }).glob === 'function',
  hasMkdtempDisposable: typeof (fsp as { mkdtempDisposable?: unknown }).mkdtempDisposable === 'function',
  hasStatfs: typeof (fsp as { statfs?: unknown }).statfs === 'function',
  hasAddAbortListener: typeof (events as { addAbortListener?: unknown }).addAbortListener === 'function',
  hasAsyncDispose: typeof (Symbol as unknown as { asyncDispose?: unknown }).asyncDispose === 'symbol',
  hasConsumersBytes: typeof (consumers as { bytes?: unknown }).bytes === 'function',
  hasSqlite: builtinModules.includes('node:sqlite'),
  hasWorkerLocks:
    typeof (workerThreads as { locks?: unknown }).locks === 'object' &&
    (workerThreads as { locks?: unknown }).locks !== null,
});
