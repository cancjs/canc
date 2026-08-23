import { isCancelError, suppressCancel } from '@cancjs/promise';

import { cancAsync, cancForAwait } from './coroutine';

// Deterministic microtask flush (mirrors coroutine-each.spec): drains the microtask queue N times
// so chained then-callbacks all run, no arbitrary sleeps.
const flush = async (times = 12) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

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
