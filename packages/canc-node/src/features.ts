import * as events from 'node:events';
import * as fsp from 'node:fs/promises';
import { builtinModules } from 'node:module';
import * as net from 'node:net';
import * as nodeStream from 'node:stream';
import * as consumers from 'node:stream/consumers';
import * as workerThreads from 'node:worker_threads';

import gateFloors from './gate-floors.json';

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
 * Whether `version` is at or past the floor of its own release line. `floors` lists one exact
 * version per line that has the feature, ascending. A line newer than every listed one has it; a
 * line older than the first, or between two listed lines, does not.
 */
export function meetsLineFloors(version: string, floors: readonly string[]): boolean {
  const [major, minor, patch] = version
    .replace(/^v/, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  const parsed = floors.map((floor) => floor.split('.').map((part) => parseInt(part, 10)));
  const newest = parsed[parsed.length - 1];

  if (major > newest[0]) {
    return true;
  }

  const floor = parsed.find((candidate) => candidate[0] === major);

  return floor !== undefined && (minor > floor[1] || (minor === floor[1] && (patch || 0) >= floor[2]));
}

/** A floor list as the text a `NotImplementedError` and the docs show: `20.17.0 / 22.6.0`. */
export function formatLineFloors(floors: readonly string[]): string {
  return floors.join(' / ');
}

/** The floors of every gated feature that needs more than one whole release line to describe. */
export const GATE_FLOORS: Readonly<Record<'duplexPair', readonly string[]>> = gateFloors;

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
  hasDuplexPair:
    typeof (nodeStream as { duplexPair?: unknown }).duplexPair === 'function' &&
    meetsLineFloors(nodeVersion, gateFloors.duplexPair),
  hasWorkerLocks:
    typeof (workerThreads as { locks?: unknown }).locks === 'object' &&
    (workerThreads as { locks?: unknown }).locks !== null,
});
