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

function detectMarkedMajor(): number {
  for (const [major, isPresent] of MAJOR_MARKERS) {
    if (isPresent()) {
      return major;
    }
  }

  return FLOOR_MAJOR;
}

/**
 * The running version, taken from what the runtime reports and falling back to the release line its
 * capabilities mark.
 *
 * Markers only resolve a line, and several of the facts this package acts on are finer than a line:
 * `stat` accepts an abort signal from 26.8.0, while the marker for 26 is there from 26.0.0. Reading
 * the reported version first tells those apart. The markers stay as the fallback, for a runtime that
 * implements the node API without claiming a node version.
 */
function detectVersion(): string {
  const reported = process.versions.node;
  if (typeof reported === 'string' && /^\d+\.\d+\.\d+/.test(reported)) {
    return reported;
  }

  return `${detectMarkedMajor()}.0.0`;
}

const nodeVersion = detectVersion();

/**
 * Feature availability detected at module load.
 */
export const features = Object.freeze({
  nodeVersion,
  nodeMajor: parseInt(nodeVersion, 10),
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
