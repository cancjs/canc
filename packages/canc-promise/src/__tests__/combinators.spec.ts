import { CancelError } from '../cancel-error';
import { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

/**
 * Combinators (all / allSettled / any / race).
 *
 * Covers: value order, error semantics (incl. AggregateError order, errors indexed by INPUT
 * position, not settlement order), empty iterables, sync (non-promise) values, generator-iterable
 * inputs, iterable throwing mid-iteration, mixed native+canc inputs, per-doctrine loser
 * cancellation (re-run as pure black-box observation of isCanceled), cancel result-promise ->
 * inputs canceled (bubble), bubble:false input isolation, and adversarial iterables (sync-`then`
 * thenables).
 *
 * Deterministic: no arbitrary sleeps, a fixed 10ms `macrotask()` drains all pending microtasks and
 * lets scheduled setTimeout callbacks fire, mirroring cancel-losers.spec.ts convention.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

interface Deferred<T> {
  promise: CancelablePromise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

function createDeferred<T>(options?: any): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new CancelablePromise<T>((res, rej) => {
    resolve = res as any;
    reject = rej;
  }, options);
  return { promise, resolve, reject };
}

describe('combinators', () => {
  // ============================================================================
  // all()
  // ============================================================================
  describe('all()', () => {
    it('resolves with values in INPUT order regardless of settle order', async () => {
      const fast = createDeferred<string>();
      const slow = createDeferred<string>();

      const result = CancelablePromise.all([slow.promise, fast.promise]);

      // Settle the second input first.
      fast.resolve('fast');
      await macrotask();
      slow.resolve('slow');

      await expect(result).resolves.toEqual(['slow', 'fast']);
    });

    it('resolves an empty iterable synchronously-shaped (empty array)', async () => {
      const result = CancelablePromise.all([]);
      await expect(result).resolves.toEqual([]);
    });

    it('accepts sync (non-promise) values', async () => {
      const result = CancelablePromise.all([1, 2, 3]);
      await expect(result).resolves.toEqual([1, 2, 3]);
    });

    it('rejects with the first rejection reason', async () => {
      const boom = new Error('boom');
      const p1 = new CancelablePromise<number>(() => {
        /**/
      });
      const p2 = new CancelablePromise<number>((_res, rej) => rej(boom));

      const result = CancelablePromise.all([p1, p2]);
      await expect(result).rejects.toBe(boom);
    });

    it('returns a CancelablePromise', () => {
      const result = CancelablePromise.all([1]);
      expect(result).toBeInstanceOf(CancelablePromise);
      expect(typeof (result as any).cancel).toBe('function');
    });

    it('accepts a generator iterable input', async () => {
      function* gen() {
        yield CancelablePromise.resolve('a');
        yield 'b';
        yield NativePromise.resolve('c');
      }
      const result = CancelablePromise.all(gen());
      await expect(result).resolves.toEqual(['a', 'b', 'c']);
    });

    it('accepts mixed native Promise + CancelablePromise + raw value inputs', async () => {
      const result = CancelablePromise.all([NativePromise.resolve(1), CancelablePromise.resolve(2), 3]);
      await expect(result).resolves.toEqual([1, 2, 3]);
    });

    it('rejects if the iterable throws mid-iteration', async () => {
      const boom = new Error('iterator boom');
      const badIterable: Iterable<any> = {
        [Symbol.iterator]() {
          let step = 0;
          return {
            next() {
              step++;
              if (step === 1) return { value: CancelablePromise.resolve(1), done: false };
              throw boom;
            },
          };
        },
      };
      const result = CancelablePromise.all(badIterable);
      await expect(result).rejects.toBe(boom);
    });

    it('handles an adversarial sync-then thenable', async () => {
      // A thenable whose then() calls the resolve callback synchronously.
      const syncThenable = {
        then(onF: (v: any) => void) {
          onF('sync-adopted');
        },
      };
      const result = CancelablePromise.all([syncThenable, 'plain']);
      await expect(result).resolves.toEqual(['sync-adopted', 'plain']);
    });

    // ---- loser cancellation (black-box) ----
    it('cancels remaining pending inputs on first rejection', async () => {
      const p1 = new CancelablePromise<number>(() => {
        /**/
      });
      const p2 = new CancelablePromise<number>(() => {
        /**/
      });
      const rejector = createDeferred<number>();

      const result = CancelablePromise.all([p1, p2, rejector.promise]);
      result.catch(() => {
        /**/
      });

      rejector.reject(new Error('fail'));
      await macrotask();

      expect(p1.isCanceled).toBe(true);
      expect(p2.isCanceled).toBe(true);
    });

    it('does NOT cancel an already-fulfilled input on rejection', async () => {
      const done = CancelablePromise.resolve('done');
      const pending = new CancelablePromise<any>(() => {
        /**/
      });
      const rejector = createDeferred<any>();

      const result = CancelablePromise.all([done, pending, rejector.promise]);
      result.catch(() => {
        /**/
      });

      rejector.reject(new Error('fail'));
      await macrotask();

      expect(done.isCanceled).toBe(false);
      expect(pending.isCanceled).toBe(true);
    });

    it('respects bubble:false input — NOT canceled as a remaining loser', async () => {
      const shielded = new CancelablePromise<any>(
        () => {
          /**/
        },
        { bubble: false },
      );
      const normal = new CancelablePromise<any>(() => {
        /**/
      });
      const rejector = createDeferred<any>();

      const result = CancelablePromise.all([shielded, normal, rejector.promise]);
      result.catch(() => {
        /**/
      });

      rejector.reject(new Error('fail'));
      await macrotask();

      expect(normal.isCanceled).toBe(true);
      expect(shielded.isCanceled).toBe(false);
    });

    // ---- cancel result: bubble is UPWARD-only, no downward cascade ----
    // The result promise is the DOWNSTREAM child of the inputs (input._chain(result)).
    // Cancellation propagates UP (all children canceled → parent bubbles), never DOWN from a
    // child to its parents. So canceling the result cancels the result only; inputs stay pending
    // because each input also has the internal .then() consumer keeping it alive. Black-box
    // documentation of actual behavior (see Gap note in tracker re: task wording).
    it('canceling the result promise does NOT cascade down to inputs', async () => {
      const p1 = new CancelablePromise<any>(() => {
        /**/
      });
      const p2 = new CancelablePromise<any>(() => {
        /**/
      });

      const result = CancelablePromise.all([p1, p2]);
      result.catch(() => {
        /**/
      });

      result.cancel();
      await macrotask();

      expect(result.isCanceled).toBe(true);
      expect(p1.isCanceled).toBe(false);
      expect(p2.isCanceled).toBe(false);
    });
  });

  // ============================================================================
  // allSettled()
  // ============================================================================
  describe('allSettled()', () => {
    it('resolves with per-input settled results in INPUT order', async () => {
      const err = new Error('nope');
      const fast = createDeferred<string>();
      const slow = createDeferred<string>();
      const failer = new CancelablePromise<string>((_res, rej) => rej(err));

      const result = CancelablePromise.allSettled([slow.promise, fast.promise, failer]);

      fast.resolve('fast');
      await macrotask();
      slow.resolve('slow');

      const settled = await result;
      expect(settled).toEqual([
        { status: 'fulfilled', value: 'slow' },
        { status: 'fulfilled', value: 'fast' },
        { status: 'rejected', reason: err },
      ]);
    });

    it('resolves an empty iterable to []', async () => {
      await expect(CancelablePromise.allSettled([])).resolves.toEqual([]);
    });

    it('accepts sync values', async () => {
      const settled = await CancelablePromise.allSettled([1, 'x']);
      expect(settled).toEqual([
        { status: 'fulfilled', value: 1 },
        { status: 'fulfilled', value: 'x' },
      ]);
    });

    it('accepts a generator iterable input', async () => {
      function* gen() {
        yield CancelablePromise.resolve('g1');
        yield NativePromise.reject(new Error('g2'));
      }
      const settled = await CancelablePromise.allSettled(gen());
      expect(settled[0]).toEqual({ status: 'fulfilled', value: 'g1' });
      expect(settled[1].status).toBe('rejected');
    });

    it('NEVER cancels inputs — waits for all (loser doctrine no-op)', async () => {
      const winner = new CancelablePromise((resolve) => resolve('v'));
      const p2 = new CancelablePromise(() => {
        /**/
      });
      const p3 = new CancelablePromise(() => {
        /**/
      });

      CancelablePromise.allSettled([winner, p2, p3]);
      await macrotask();

      expect(p2.isCanceled).toBe(false);
      expect(p3.isCanceled).toBe(false);
    });

    it('surfaces the iterable throw synchronously via rejection', async () => {
      const boom = new Error('spread boom');
      const badIterable: Iterable<any> = {
        [Symbol.iterator]() {
          throw boom;
        },
      };
      // allSettled spreads via [...values]; the throw becomes a synchronous throw.
      expect(() => CancelablePromise.allSettled(badIterable)).toThrow(boom);
    });
  });

  // ============================================================================
  // any()
  // ============================================================================
  describe('any()', () => {
    it('fulfills with the first fulfilled value (settle order, not input order)', async () => {
      const slow = createDeferred<string>();
      const fast = createDeferred<string>();

      const result = CancelablePromise.any([slow.promise, fast.promise]);
      fast.resolve('fast');

      await expect(result).resolves.toBe('fast');
    });

    it('ignores earlier rejections and fulfills with a later fulfillment', async () => {
      const failer = new CancelablePromise<string>((_res, rej) => rej(new Error('early')));
      const winner = createDeferred<string>();

      const result = CancelablePromise.any([failer, winner.promise]);
      await macrotask();
      winner.resolve('late-win');

      await expect(result).resolves.toBe('late-win');
    });

    it('rejects with AggregateError when all reject; errors in INPUT order', async () => {
      const e0 = new Error('e0');
      const e1 = new Error('e1');
      // Make input[1] reject BEFORE input[0] so settlement order != input order.
      const slow = new CancelablePromise<number>((_res, rej) => setTimeout(() => rej(e0), 5));
      const quick = new CancelablePromise<number>((_res, rej) => rej(e1));

      const result = CancelablePromise.any([slow, quick]);
      const err = await result.catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AggregateError');
      // Order keyed by input index, NOT by settlement time.
      expect(err.errors).toEqual([e0, e1]);
    });

    it('rejects an empty iterable with an AggregateError (empty errors)', async () => {
      const result = CancelablePromise.any([]);
      const err = await result.catch((e) => e);
      expect(err.name).toBe('AggregateError');
      expect(err.errors).toEqual([]);
    });

    it('fulfills immediately with a sync value', async () => {
      const result = CancelablePromise.any([
        42,
        new CancelablePromise(() => {
          /**/
        }),
      ]);
      await expect(result).resolves.toBe(42);
      await macrotask();
    });

    it('accepts a generator iterable input', async () => {
      function* gen() {
        yield NativePromise.reject(new Error('g-fail'));
        yield CancelablePromise.resolve('g-win');
      }
      await expect(CancelablePromise.any(gen())).resolves.toBe('g-win');
    });

    it('accepts mixed native + canc inputs', async () => {
      const result = CancelablePromise.any([NativePromise.reject(new Error('n')), CancelablePromise.resolve('c-win')]);
      await expect(result).resolves.toBe('c-win');
    });

    it('rejects if the iterable throws mid-iteration', async () => {
      const boom = new Error('any iter boom');
      const badIterable: Iterable<any> = {
        [Symbol.iterator]() {
          return {
            next() {
              throw boom;
            },
          };
        },
      };
      await expect(CancelablePromise.any(badIterable)).rejects.toBe(boom);
    });

    it('handles adversarial sync-then thenable as winner', async () => {
      const syncThenable = {
        then(onF: (v: any) => void) {
          onF('sync-win');
        },
      };
      await expect(CancelablePromise.any([syncThenable])).resolves.toBe('sync-win');
    });

    // ---- loser cancellation ----
    it('cancels remaining pending inputs on first fulfill', async () => {
      const winner = createDeferred<string>();
      const l1 = new CancelablePromise<string>(() => {
        /**/
      });
      const l2 = new CancelablePromise<string>(() => {
        /**/
      });

      const result = CancelablePromise.any([winner.promise, l1, l2]);
      winner.resolve('won');
      await result;
      await macrotask();

      expect(l1.isCanceled).toBe(true);
      expect(l2.isCanceled).toBe(true);
    });

    it('does NOT cancel a bubble:false loser on first fulfill', async () => {
      const winner = new CancelablePromise((resolve) => resolve('won'));
      const shielded = new CancelablePromise(
        () => {
          /**/
        },
        { bubble: false },
      );

      const result = CancelablePromise.any([winner, shielded]);
      await result;
      await macrotask();

      expect(shielded.isCanceled).toBe(false);
    });

    it('canceling the result promise does NOT cascade down to inputs', async () => {
      const l1 = new CancelablePromise<any>(() => {
        /**/
      });
      const l2 = new CancelablePromise<any>(() => {
        /**/
      });

      const result = CancelablePromise.any([l1, l2]);
      result.catch(() => {
        /**/
      });

      result.cancel();
      await macrotask();

      expect(result.isCanceled).toBe(true);
      expect(l1.isCanceled).toBe(false);
      expect(l2.isCanceled).toBe(false);
    });
  });

  // ============================================================================
  // race()
  // ============================================================================
  describe('race()', () => {
    it('settles with the first input to settle (fulfill)', async () => {
      const fast = createDeferred<string>();
      const slow = createDeferred<string>();

      const result = CancelablePromise.race([fast.promise, slow.promise]);
      fast.resolve('fast');

      await expect(result).resolves.toBe('fast');
    });

    it('settles with the first input to settle (reject)', async () => {
      const boom = new Error('race-fail');
      const failer = new CancelablePromise<string>((_res, rej) => rej(boom));
      const slow = new CancelablePromise<string>(() => {
        /**/
      });

      const result = CancelablePromise.race([failer, slow]);
      await expect(result).rejects.toBe(boom);
    });

    it('never settles for an empty iterable (stays pending)', async () => {
      const result = CancelablePromise.race([]);
      let settled = false;
      result.then(
        () => (settled = true),
        () => (settled = true),
      );
      await macrotask();
      expect(settled).toBe(false);
      result.cancel(); // clean up the pending promise
      result.catch(() => {
        /**/
      });
    });

    it('settles with a sync value present in the iterable', async () => {
      const result = CancelablePromise.race([
        'immediate',
        new CancelablePromise(() => {
          /**/
        }),
      ]);
      await expect(result).resolves.toBe('immediate');
      await macrotask();
    });

    it('accepts a generator iterable input', async () => {
      function* gen() {
        yield new CancelablePromise(() => {
          /**/
        });
        yield CancelablePromise.resolve('gen-race');
      }
      await expect(CancelablePromise.race(gen())).resolves.toBe('gen-race');
      await macrotask();
    });

    it('accepts mixed native + canc inputs', async () => {
      const result = CancelablePromise.race([
        new CancelablePromise<string>(() => {
          /**/
        }),
        NativePromise.resolve('native-race'),
      ]);
      await expect(result).resolves.toBe('native-race');
    });

    it('rejects if the iterable throws mid-iteration', async () => {
      const boom = new Error('race iter boom');
      const badIterable: Iterable<any> = {
        [Symbol.iterator]() {
          let step = 0;
          return {
            next() {
              step++;
              if (step === 1)
                return {
                  value: new CancelablePromise(() => {
                    /**/
                  }),
                  done: false,
                };
              throw boom;
            },
          };
        },
      };
      await expect(CancelablePromise.race(badIterable)).rejects.toBe(boom);
    });

    it('cancels losers when any input settles (bubbleOnComplete mirror)', async () => {
      const winner = new CancelablePromise((resolve) => resolve('r1'));
      const l1 = new CancelablePromise(() => {
        /**/
      });
      const l2 = new CancelablePromise(() => {
        /**/
      });

      const result = CancelablePromise.race([winner, l1, l2]);
      await result;
      await macrotask();

      expect(l1.isCanceled).toBe(true);
      expect(l2.isCanceled).toBe(true);
    });

    it('canceling the result promise cancels pending inputs (bubble)', async () => {
      const l1 = new CancelablePromise<any>(() => {
        /**/
      });
      const l2 = new CancelablePromise<any>(() => {
        /**/
      });

      const result = CancelablePromise.race([l1, l2]);
      result.catch(() => {
        /**/
      });

      result.cancel();
      await macrotask();

      expect(result.isCanceled).toBe(true);
      expect(l1.isCanceled).toBe(true);
      expect(l2.isCanceled).toBe(true);
    });

    it('handles adversarial sync-then thenable', async () => {
      const syncThenable = {
        then(onF: (v: any) => void) {
          onF('sync-race');
        },
      };
      await expect(
        CancelablePromise.race([
          syncThenable,
          new CancelablePromise(() => {
            /**/
          }),
        ]),
      ).resolves.toBe('sync-race');
      await macrotask();
    });
  });

  // ============================================================================
  // Cross-combinator: loser cancel reasons + bubble error shape
  // ============================================================================
  describe('cross-combinator invariants', () => {
    it('loser CancelError is suppressed (no unhandled rejection surfaces)', async () => {
      const winner = new CancelablePromise((resolve) => resolve('w'));
      const loser = new CancelablePromise(() => {
        /**/
      });

      await CancelablePromise.any([winner, loser]);
      await macrotask();

      // Reaching here without an unhandled-rejection crash proves suppression.
      expect(loser.isCanceled).toBe(true);
    });

    it('canceled loser rejects with a CancelError (brand-checked)', async () => {
      const winner = createDeferred<string>();
      const loser = new CancelablePromise<string>(() => {
        /**/
      });

      CancelablePromise.any([winner.promise, loser]);
      winner.resolve('w');
      await macrotask();

      const reason = await loser.then(
        () => undefined,
        (e) => e,
      );
      expect(isCancelError(reason)).toBe(true);
      expect(reason).toBeInstanceOf(CancelError);
    });

    it('all() over shielded (bubble:false) inputs still resolves normally', async () => {
      const a = new CancelablePromise<number>((resolve) => resolve(1), { bubble: false });
      const b = new CancelablePromise<number>((resolve) => resolve(2), { bubble: false });
      await expect(CancelablePromise.all([a, b])).resolves.toEqual([1, 2]);
    });

    it('nested combinator: all([any(...), race(...)]) composes', async () => {
      const inner1 = CancelablePromise.any([NativePromise.reject(new Error('x')), CancelablePromise.resolve('A')]);
      const inner2 = CancelablePromise.race([
        CancelablePromise.resolve('B'),
        new CancelablePromise(() => {
          /**/
        }),
      ]);
      await expect(CancelablePromise.all([inner1, inner2])).resolves.toEqual(['A', 'B']);
      await macrotask();
    });
  });
});
