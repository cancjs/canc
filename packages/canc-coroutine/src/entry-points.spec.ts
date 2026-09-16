// `canc` resolves through the package name (workspace symlink + exports map), exercising the main
// entry built by rollup. `cancGen` imports the `gen.ts` barrel itself (its only job is
// re-exporting from coroutine-gen.ts under the cancGen.* names) rather than the
// `@cancjs/coroutine/gen` subpath, because the shared jest moduleNameMapper's `@cancjs/*` regex
// only substitutes one path segment and cannot express a nested subpath; that mapping gap is
// unrelated to this package and is proven separately via a plain `require()` smoke against the
// built dist/gen.cjs from outside jest.
import * as canc from '@cancjs/coroutine';
import { throw as cancThrowAlias } from '@cancjs/coroutine';
import { isCancelError, suppressCancel } from '@cancjs/promise';

import * as cancGen from './gen';

class FooError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, FooError.prototype);
  }
}

// deterministic microtask flush: drains microtask queue
const flush = async (times = 12) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

describe('canc / cancGen mirror namespaces resolve from source mapping', () => {
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
    promise.catch((err) => {
      suppressCancel(err);
    });

    await flush();

    promise.cancel();

    const reason = await promise.catch((e: any) => e);

    expect(isCancelError(reason)).toBe(true);
    expect(sourceReturned).toBe(true);
  });

  it('cancGen.throw is a function and cancGenThrow alias is exported from gen barrel', () => {
    expect(typeof cancGen.throw).toBe('function');
    expect(typeof cancGen.cancGenThrow).toBe('function');
  });

  describe('canc.throw / cancThrow', () => {
    it('canc.throw and imported alias are functions matching cancThrow', () => {
      expect(typeof canc.throw).toBe('function');
      expect(typeof cancThrowAlias).toBe('function');
      expect(canc.throw).toBe(cancThrowAlias);
      expect(canc.throw).toBe(canc.cancThrow);
    });

    it('cancThrow inside coroutine try is caught by catch and enclosing finally runs', async () => {
      let caught: Error | undefined;
      let finallyRan = false;

      const co = canc.async(function* () {
        try {
          yield* canc.cancThrow(new FooError('test-fail'));
        } catch (err: any) {
          caught = err;
        } finally {
          finallyRan = true;
        }
      });

      await co();

      expect(caught).toBeInstanceOf(FooError);
      expect(caught?.message).toBe('test-fail');
      expect(finallyRan).toBe(true);
    });

    it('uncaught cancThrow rejects coroutine promise with exact error instance', async () => {
      const errInstance = new FooError('uncaught');
      const co = canc.async(function* () {
        yield* canc.cancThrow(errInstance);
      });

      const promise = co();
      let rejectedErr: any;
      try {
        await promise;
      } catch (err) {
        rejectedErr = err;
      }

      expect(rejectedErr).toBe(errInstance);
    });

    it('throws on the first next() when driving raw generator manually', () => {
      const errInstance = new FooError('sync-first-next');
      const gen = canc.cancThrow(errInstance);

      expect(() => gen.next()).toThrow(errInstance);
    });

    it('driver sees no extra yielded value from cancThrow', async () => {
      const errInstance = new FooError('no-yield');
      const genFn = function* () {
        yield 1;
        yield* canc.cancThrow(errInstance);
        yield 2;
      };

      const gen = genFn();
      const step1 = gen.next();
      expect(step1.value).toBe(1);
      expect(step1.done).toBe(false);

      expect(() => gen.next()).toThrow(errInstance);
    });

    it('type specs for cancThrow', () => {
      const _validRet = canc.async(function* (): canc.AsyncResult<number> {
        return yield* canc.cancThrow(new FooError());
      });

      // @ts-expect-error TS2355
      const _invalidBare = canc.async(function* (): canc.AsyncResult<number> {
        yield* canc.cancThrow(new FooError());
      });

      expect(typeof _validRet).toBe('function');
      expect(typeof _invalidBare).toBe('function');
    });
  });
});
