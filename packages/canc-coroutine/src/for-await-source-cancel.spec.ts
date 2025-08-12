import { cancAsync, cancForAwait } from './coroutine';
import { isCancelError, suppressCancel } from '@cancjs/promise';

// Deterministic microtask flush (mirrors coroutine-each.spec): drains the microtask queue N times
// so chained then-callbacks all run, no arbitrary sleeps (testing doctrine).
const flush = async (times = 12) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

// A cancAsync coroutine consuming a mock async iterable via cancForAwait cancels the SOURCE
// (calls its `.return()`, running its `finally`) when the coroutine itself is canceled. Not a
// substitute for the per-file matrix in coroutine-each.spec.ts; this is the integration check
// that mirrors the raw stream.next()/.done/.value pattern the examples otherwise hand-roll.

describe('cancAsync + cancForAwait cancels a mock async iterable source', () => {
  it('canceling the coroutine mid-stream runs the source finally and rejects CancelError', async () => {
    let sourceReturned = false;
    const seen: number[] = [];

    const mockAsyncSource = (async function* () {
      try {
        let i = 0;
        while (true) {
          yield i++;
        }
      } finally {
        sourceReturned = true;
      }
    })();

    const co = cancAsync(function* () {
      yield* cancForAwait(mockAsyncSource, (value: number) => {
        seen.push(value);
      });
    });

    const promise = co();
    promise.catch(suppressCancel);

    await flush();

    promise.cancel();

    const reason = await promise.catch((e: any) => e);

    expect(isCancelError(reason)).toBe(true);
    expect(sourceReturned).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
  });
});
