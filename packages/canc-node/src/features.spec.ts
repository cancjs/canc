import * as events from 'node:events';
import * as fsp from 'node:fs/promises';
import { builtinModules } from 'node:module';
import * as consumers from 'node:stream/consumers';
import * as workerThreads from 'node:worker_threads';

import { features } from './features';

describe('features', () => {
  it('is a frozen object', () => {
    expect(Object.isFrozen(features)).toBe(true);
  });

  it('reports a release line no older than the supported floor', () => {
    expect(features.nodeMajor).toBeGreaterThanOrEqual(18);
  });

  it('reports a whole version, not just the line it is on', () => {
    expect(features.nodeVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(features.nodeMajor).toBe(parseInt(features.nodeVersion, 10));
    expect(features.nodeMajor).toBeGreaterThanOrEqual(18);
  });

  it('agrees with the capabilities that mark each release line', () => {
    if (features.hasMkdtempDisposable) {
      expect(features.nodeMajor).toBeGreaterThanOrEqual(24);
    } else {
      expect(features.nodeMajor).toBeLessThan(24);
    }
    if (features.hasGlob) {
      expect(features.nodeMajor).toBeGreaterThanOrEqual(22);
    } else {
      expect(features.nodeMajor).toBeLessThan(22);
    }
  });

  it('detects hasGlob dynamically matching host runtime', () => {
    expect(features.hasGlob).toBe(typeof (fsp as { glob?: unknown }).glob === 'function');
  });

  it('detects hasMkdtempDisposable dynamically matching host runtime', () => {
    expect(features.hasMkdtempDisposable).toBe(
      typeof (fsp as { mkdtempDisposable?: unknown }).mkdtempDisposable === 'function',
    );
  });

  it('detects hasStatfs dynamically matching host runtime', () => {
    expect(features.hasStatfs).toBe(typeof (fsp as { statfs?: unknown }).statfs === 'function');
  });

  it('detects hasAddAbortListener dynamically matching host runtime', () => {
    expect(features.hasAddAbortListener).toBe(
      typeof (events as { addAbortListener?: unknown }).addAbortListener === 'function',
    );
  });

  it('detects hasAsyncDispose dynamically matching host runtime', () => {
    expect(features.hasAsyncDispose).toBe(
      typeof (Symbol as unknown as { asyncDispose?: unknown }).asyncDispose === 'symbol',
    );
  });

  it('detects hasConsumersBytes dynamically matching host runtime', () => {
    expect(features.hasConsumersBytes).toBe(typeof (consumers as { bytes?: unknown }).bytes === 'function');
  });

  it('detects hasSqlite via builtinModules', () => {
    expect(features.hasSqlite).toBe(builtinModules.includes('node:sqlite'));
  });

  it('detects hasWorkerLocks dynamically matching host runtime', () => {
    expect(features.hasWorkerLocks).toBe(
      typeof (workerThreads as { locks?: unknown }).locks === 'object' &&
        (workerThreads as { locks?: unknown }).locks !== null,
    );
  });
});
