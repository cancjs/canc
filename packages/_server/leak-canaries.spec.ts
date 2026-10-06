import { createExchange, FakeServer } from './__tests__/fakes';
import { getLiveRequests, getRequestState, IRequestCancelState } from './holder';
import { runCancelableHandler } from './run';

/**
 * Leak canary for the per-request cancel state.
 *
 * A server lives for the process while a request lives for one exchange. The state holder hangs off
 * the request object and is also recorded in the server's live-request registry, so an entry that
 * outlives its response pins the request, its cancel signal and every task the handler started, for
 * as long as the server is up. This probe keeps the server reachable, drops everything else, and
 * asserts the holders are collected.
 *
 * A FinalizationRegistry callback only ever fires after a real collection, so the probe is skipped
 * rather than run against a collector that turns out to be a no-op. See acquireGC below.
 */

const REQUEST_COUNT = 5;

// each round is one forced collection plus one macrotask for the registry to report through
const GC_ROUNDS = 40;

/**
 * Acquire a real, callable garbage collector.
 *
 * 1. `global.gc` if the process was already launched with --expose-gc (an outer process-level
 *    flag stays in control of its own collector).
 * 2. Otherwise, flip --expose-gc on for just long enough to pull `gc` out of a throwaway vm
 *    context, then flip it back off.
 * 3. If neither works, report unavailable. Callers must skip rather than silently no-op: a no-op
 *    gc() makes every probe pass for a reason unrelated to what it claims to measure.
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
    'leak canaries (request state): no real garbage collector available (neither global.gc nor the ' +
      'v8/vm fallback worked). Skipping the probe rather than running it against a no-op collector.',
  );
}

function gc(): void {
  if (!realGC) {
    throw new Error('gc() called without an acquired collector; the probe should have been skipped');
  }

  realGC();
}

function tick(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 5);
  });
}

/** Forces collections until every registered holder has been finalized, or the rounds run out. */
async function drainRegistry(finalized: number[], expected: number, maxRounds: number = GC_ROUNDS): Promise<void> {
  for (let round = 0; round < maxRounds && finalized.length < expected; round += 1) {
    gc();
    await tick();
  }
}

/**
 * Runs one request to completion and hands its state holder back through the registry.
 *
 * The exchange stays local to this call, so any reference that survives the return is one the code
 * under test kept. Returning the holder instead would defeat the probe, hence the callback.
 */
async function completeOneRequest(
  server: FakeServer,
  id: number,
  onState: (state: IRequestCancelState, id: number) => void,
): Promise<void> {
  const { req, res } = createExchange(server);
  const task = runCancelableHandler(() => id, req, res);
  const state = getRequestState(req);

  if (!state) {
    throw new Error('the handler wrapper installed no request state');
  }

  onState(state, id);

  await task;
  res.end();
}

const describeIfGC = hasGC ? describe : describe.skip;

describeIfGC('leak canaries (request state GC probe)', () => {
  it('releases the state holder of every request once its response has ended', async () => {
    const finalized: number[] = [];
    const registry = new FinalizationRegistry<number>((id) => {
      finalized.push(id);
    });
    const server = new FakeServer();

    for (let id = 0; id < REQUEST_COUNT; id += 1) {
      await completeOneRequest(server, id, (state, registered) => registry.register(state, registered));
    }

    expect(getLiveRequests(server)?.size ?? 0).toBe(0);

    await drainRegistry(finalized, REQUEST_COUNT);

    // the server is still reachable here, which is what makes a surviving holder a leak
    expect(finalized.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('reports a holder that something still references as uncollected', async () => {
    const finalized: number[] = [];
    const registry = new FinalizationRegistry<number>((id) => {
      finalized.push(id);
    });
    const server = new FakeServer();
    const retained: IRequestCancelState[] = [];

    for (let id = 0; id < REQUEST_COUNT; id += 1) {
      await completeOneRequest(server, id, (state, registered) => {
        registry.register(state, registered);
        retained.push(state);
      });
    }

    await drainRegistry(finalized, REQUEST_COUNT, 5);

    // the control for the probe above: without it, a collector that never fires reads as a pass
    expect(finalized).toEqual([]);
    expect(retained).toHaveLength(REQUEST_COUNT);
  });
});
