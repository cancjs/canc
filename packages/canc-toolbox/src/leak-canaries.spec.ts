import { CancelablePromise } from '@cancjs/promise';

import { fromAbortSignal } from './prebound';

/**
 * Leak canaries.
 *
 * FinalizationRegistry-based GC probe for `fromAbortSignal`: a race loser's executor closure must
 * be collectable once the race settles, even though the signal it listened on stays alive and
 * reachable for the whole test. If the listener were never removed, the long-lived signal would
 * keep the closure reachable forever and the probe below would never finalize.
 *
 * Every probe needs a real collector, not just a `global.gc` call that may be a no-op. The
 * acquireGC() helper mirrors the one the promise package's probes use.
 */

/**
 * Acquire a real, callable garbage collector.
 *
 * 1. `global.gc` if the process was already launched with --expose-gc.
 * 2. Otherwise, flip --expose-gc on for just long enough to pull `gc` out of a throwaway vm
 *    context, then flip it back off.
 * 3. If neither works, report unavailable. Callers must skip rather than silently no-op: a no-op
 *    gc() makes the probe pass for a reason unrelated to what it claims to measure.
 */
function acquireGC(): (() => void) | undefined {
  if (typeof global.gc === 'function') {
    const globalGC = global.gc;
    return () => globalGC();
  }

  try {
    const v8 = require('v8');
    const vm = require('vm');
    v8.setFlagsFromString('--expose-gc');
    const vmGC = vm.runInNewContext('gc');
    v8.setFlagsFromString('--no-expose-gc');
    if (typeof vmGC === 'function') {
      return () => vmGC();
    }
  } catch {
    // fall through to unavailable
  }

  return undefined;
}

const realGC = acquireGC();
const hasGC = typeof realGC === 'function';

if (!hasGC) {
  console.warn(
    'fromAbortSignal leak canary (GC probe): no real garbage collector available. Skipping rather ' +
      'than running against a no-op collector.',
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// FinalizationRegistry callbacks are best-effort: one collection is rarely enough to run them.
// Drive several GC cycles across macrotask turns until the predicate holds or the cap is reached.
async function forceCollect(done: () => boolean, cycles = 25, gap = 20): Promise<void> {
  for (let i = 0; i < cycles && !done(); i++) {
    realGC?.();
    await delay(gap);
  }
}

const describeIfGC = hasGC ? describe : describe.skip;

describeIfGC('fromAbortSignal leak canary (GC probe)', () => {
  it('a race loser is collected even though its signal stays alive', async () => {
    const finalized: boolean[] = [];
    const registry = new FinalizationRegistry(() => {
      finalized.push(true);
    });

    // Held for the whole test: the signal must outlive the promise for this canary to mean
    // anything, otherwise both would be collected together regardless of listener removal.
    const controller = new AbortController();

    // The loser lives ONLY inside this nested function.
    // As a local of the async test body it would be pinned across every await below by the es5
    // generator state machine regardless of reassignment.
    const raceAgainstSignal = (): CancelablePromise<string | void> => {
      const loser = fromAbortSignal(controller.signal);
      registry.register(loser, 'fromAbortSignal loser');
      return CancelablePromise.race([CancelablePromise.resolve('fast'), loser]);
    };

    const winner = await raceAgainstSignal();
    expect(winner).toBe('fast');

    await forceCollect(() => finalized.length > 0);

    expect(finalized.length).toBeGreaterThan(0);
    expect(controller.signal.aborted).toBe(false);
  });
});
