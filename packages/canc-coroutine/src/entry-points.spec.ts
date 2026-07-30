// `canc` resolves through the package name (workspace symlink + exports map), exercising the main
// entry built by rollup. `cancGen` imports the `gen.ts` barrel itself (its only job is
// re-exporting from coroutine-gen.ts under the cancGen.* names) rather than the
// `@cancjs/coroutine/gen` subpath, because the shared jest moduleNameMapper's `@cancjs/*` regex
// only substitutes one path segment and cannot express a nested subpath; that mapping gap is
// unrelated to this package and is proven separately via a plain `require()` smoke against the
// built dist/gen.cjs from outside jest.
import * as canc from '@cancjs/coroutine';
import { isCancelError, suppressCancel } from '@cancjs/promise';

import * as cancGen from './gen';

// Deterministic microtask flush (mirrors coroutine-each.spec): drains the microtask queue N
// times so chained then-callbacks all run, no arbitrary sleeps.
const flush = async (times = 12) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

// The mirror namespaces resolve from their built entry points and behave end-to-end. Not a
// substitute for coroutine.spec.ts / coroutine-gen.spec.ts (those cover the full semantics matrix
// against relative imports); this is the public-surface integration check that only a
// package-name/subpath import can catch (missing exports map entry, stale dist, wrong rollup input).

describe('canc / cancGen mirror namespaces resolve from built entry points', () => {
  it('canc.async + canc.forAwait consume a source end-to-end', async () => {
    const seen: number[] = [];

    const co = canc.async(function* () {
      yield* canc.forAwait([1, 2, 3], (value: number) => {
        seen.push(value);
      });
      return seen.length;
    });

    const result = await co();

    expect(result).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('cancGen.async + cancGen.await emit a typed value with no cast, cancGen.delegate re-emits a sub source', async () => {
    const producer = cancGen.async(function* () {
      const n = yield* cancGen.await(Promise.resolve(1));
      yield n * 10;
      yield* cancGen.delegate([Promise.resolve(20), 30]);
    });

    const collected: number[] = [];
    for await (const value of producer()) {
      collected.push(value);
    }

    expect(collected).toEqual([10, 20, 30]);
  });

  it('canceling a canc.async coroutine mid cancGen.forAwait runs the sub source finally', async () => {
    let sourceReturned = false;

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

    const co = canc.async(function* () {
      yield* cancGen.forAwait(mockAsyncSource, () => {});
    });

    const promise = co();
    promise.catch(suppressCancel);

    await flush();

    promise.cancel();

    const reason = await promise.catch((e: any) => e);

    expect(isCancelError(reason)).toBe(true);
    expect(sourceReturned).toBe(true);
  });
});
