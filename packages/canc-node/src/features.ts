import * as events from 'node:events';
import * as fsp from 'node:fs/promises';
import { builtinModules } from 'node:module';
import * as net from 'node:net';
import * as consumers from 'node:stream/consumers';
import * as workerThreads from 'node:worker_threads';

/** Oldest release line this package supports, and the answer for an unrecognized runtime. */
const FLOOR_MAJOR = 18;

/**
 * One capability per release line, newest first. The first marker present names the line, so the
 * answer comes from what the runtime can do rather than from what it calls itself. A runtime that
 * implements the node API without claiming a node version still lands on the right line.
 */
const MAJOR_MARKERS: [number, () => boolean][] = [
  [26, () => typeof (net as { BoundSocket?: unknown }).BoundSocket === 'function'],
  [24, () => typeof (fsp as { mkdtempDisposable?: unknown }).mkdtempDisposable === 'function'],
  [22, () => typeof (fsp as { glob?: unknown }).glob === 'function'],
  [20, () => typeof (Array.prototype as { toSorted?: unknown }).toSorted === 'function'],
];

function detectMajor(): number {
  for (const [major, isPresent] of MAJOR_MARKERS) {
    if (isPresent()) {
      return major;
    }
  }

  return FLOOR_MAJOR;
}

/**
 * Feature availability detected at module load.
 */
export const features = Object.freeze({
  nodeMajor: detectMajor(),
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
