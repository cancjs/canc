import vm from 'vm';

import { isThenable } from '../../_util';
import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';
import { catchCancel, isCancelError, makeCancelable, suppressCancel } from './helpers';

/**
 * cancel() always-return contract, CancelError cause wrapping, and brand.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

describe('cancel() return contract', () => {
  it('asyncCancel: cancel() returns a promise even with no handlers (empty allSettled)', async () => {
    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { asyncCancel: true },
    );
    const result = promise.cancel('reason');

    expect(result).toBeInstanceOf(CancelablePromise);

    const settled = await (result as CancelablePromise<PromiseSettledResult<unknown>[]>);
    expect(settled).toEqual([]);
  });

  it('asyncCancel: awaiting cancel() resolves only after async handlers settle (ordering)', async () => {
    const order: string[] = [];

    const promise = new CancelablePromise(
      (_resolve, _reject, { handleCancel }) => {
        handleCancel(
          () =>
            new NativePromise<void>((resolve) =>
              setTimeout(() => {
                order.push('handler');
                resolve();
              }, 20),
            ),
        );
      },
      { asyncCancel: true },
    );

    const settlement = promise.cancel('reason') as CancelablePromise<PromiseSettledResult<unknown>[]>;
    await settlement;
    order.push('after-await');

    expect(order).toEqual(['handler', 'after-await']);
  });

  it('asyncCancel: handler throw -> allSettled has a rejected entry, no unhandled rejection', async () => {
    const promise = new CancelablePromise(
      (_resolve, _reject, { handleCancel }) => {
        handleCancel(() => {
          throw new Error('handler boom');
        });
      },
      { asyncCancel: true },
    );

    const settlement = promise.cancel('reason') as CancelablePromise<PromiseSettledResult<unknown>[]>;
    const results = await settlement;

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('rejected');
    expect((results[0] as PromiseRejectedResult).reason.message).toBe('handler boom');

    // The cancellation itself is suppressed.
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('sync mode (asyncCancel:false): cancel() returns undefined', () => {
    const promise = new CancelablePromise(
      () => {
        /**/
      },
      { asyncCancel: false },
    );
    const result = promise.cancel('reason');

    expect(result).toBeUndefined();
    promise.catch(() => {
      /**/
    });
  });
});

// cleanup that finishes two microtasks after it starts
function twoTickCleanup(): { run: () => Promise<void>; done: () => boolean } {
  let done = false;
  return {
    run: () =>
      NativePromise.resolve()
        .then(() => undefined)
        .then(() => {
          done = true;
        }),
    done: () => done,
  };
}

// outlasts any microtask chain, so an early settle cannot pass by luck
function hostTurnCleanup(): { run: () => Promise<void>; done: () => boolean } {
  let done = false;
  return {
    run: () =>
      new NativePromise<void>((resolve) => setImmediate(resolve)).then(() => {
        done = true;
      }),
    done: () => done,
  };
}

function pendingWithCleanup(options?: ConstructorParameters<typeof CancelablePromise>[1]): {
  promise: CancelablePromise<number>;
  done: () => boolean;
} {
  const cleanup = twoTickCleanup();
  const promise = new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
    handleCancel(cleanup.run);
  }, options);
  return { promise, done: cleanup.done };
}

function quiet<T>(promise: CancelablePromise<T>): CancelablePromise<T> {
  promise.catch(() => undefined);
  return promise;
}

describe('cancel() always returns a promise in awaitable mode', () => {
  // boxed: an async factory returning the promise itself would adopt it
  const nonPending: [string, () => Promise<{ promise: CancelablePromise<number> }>][] = [
    [
      'fulfilled',
      async () => {
        const promise = new CancelablePromise<number>((resolve) => resolve(1));
        await promise;
        return { promise };
      },
    ],
    [
      'rejected',
      async () => {
        const promise = quiet(new CancelablePromise<number>((_resolve, reject) => reject(new Error('x'))));
        await promise.catch(() => undefined);
        return { promise };
      },
    ],
    [
      'canceled, cleanup finished',
      async () => {
        const promise = quiet(new CancelablePromise<number>(() => undefined));
        await promise.cancel();
        return { promise };
      },
    ],
    [
      'shielded and pending',
      async () => ({ promise: new CancelablePromise<number>(() => undefined, { shield: true }) }),
    ],
    [
      'adopting with forceCancelable false',
      async () => ({
        promise: new CancelablePromise<number>((resolve) => resolve(new CancelablePromise<number>(() => undefined)), {
          forceCancelable: false,
        }),
      }),
    ],
  ];

  it.each(nonPending)('%s: resolves with an empty list', async (_name, make) => {
    const { promise } = await make();
    const result = promise.cancel();

    expect(isThenable(result)).toBe(true);
    expect(await result).toEqual([]);
  });

  it.each(nonPending)('%s, strict: still throws', async (_name, make) => {
    const { promise } = await make();
    promise.strict = true;

    expect(() => promise.cancel()).toThrow();
  });

  it('withResolvers cancel after settle returns a promise', async () => {
    const { promise, resolve, cancel } = CancelablePromise.withResolvers<number>();
    resolve(1);
    await promise;

    const result = cancel();

    expect(isThenable(result)).toBe(true);
    expect(await result).toEqual([]);
  });

  it('pending: resolves after a two tick async cleanup finished', async () => {
    const { promise, done } = pendingWithCleanup();

    await promise.cancel();

    expect(done()).toBe(true);
  });

  it('second cancel while cleanup runs joins it', async () => {
    const { promise, done } = pendingWithCleanup();

    void promise.cancel();
    const again = promise.cancel();

    expect(isThenable(again)).toBe(true);
    await again;
    expect(done()).toBe(true);
  });

  it('async dispose after a signal cancel waits for the running cleanup', async () => {
    const controller = new AbortController();
    const { promise, done } = pendingWithCleanup({ signal: controller.signal });

    controller.abort();
    await (promise as any)[Symbol.asyncDispose]();

    expect(done()).toBe(true);
  });

  it('race: resolves after the bubbled input cleanup finished', async () => {
    const { promise: input, done } = pendingWithCleanup();
    const race = quiet(CancelablePromise.race([input]));

    await race.cancel();

    expect(input.canceled).toBe(true);
    expect(done()).toBe(true);
  });

  describe('called inside another cancel', () => {
    it('returns a promise for its own cleanup', async () => {
      const inner = pendingWithCleanup();
      let innerResult: unknown;
      let innerDone = false;
      const outer = quiet(
        new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
          handleCancel(() => {
            innerResult = inner.promise.cancel();
            return NativePromise.resolve(innerResult).then(() => {
              innerDone = inner.done();
            });
          });
        }),
      );

      await outer.cancel();

      expect(isThenable(innerResult)).toBe(true);
      expect(innerDone).toBe(true);
    });

    it('the outer cancel still covers the inner cleanup', async () => {
      const inner = pendingWithCleanup();
      const outer = quiet(
        new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
          handleCancel(() => {
            void inner.promise.cancel();
          });
        }),
      );

      await outer.cancel();

      expect(inner.done()).toBe(true);
    });

    it('a settled target returns a promise for an empty list', async () => {
      const settled = new CancelablePromise<number>((resolve) => resolve(1));
      await settled;
      let innerResult: unknown;
      const outer = quiet(
        new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
          handleCancel(() => {
            innerResult = settled.cancel();
          });
        }),
      );

      await outer.cancel();

      expect(isThenable(innerResult)).toBe(true);
      expect(await innerResult).toEqual([]);
    });

    it('a sync mode target returns undefined', async () => {
      const target = quiet(new CancelablePromise<number>(() => undefined, { asyncCancel: false }));
      let innerResult: unknown = 'unset';
      const outer = quiet(
        new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
          handleCancel(() => {
            innerResult = target.cancel();
          });
        }),
      );

      await outer.cancel();

      expect(innerResult).toBeUndefined();
      expect(target.canceled).toBe(true);
    });
  });

  describe('a handler that throws inside a cancel', () => {
    it('later cancels still return a promise covering their cleanup', async () => {
      const throwing = quiet(
        new CancelablePromise<number>(
          (_resolve, _reject, { handleCancel }) => {
            handleCancel(() => {
              throw new Error('cleanup failed');
            });
          },
          { asyncCancel: false },
        ),
      );
      const outer = quiet(
        new CancelablePromise<number>((_resolve, _reject, { handleCancel }) => {
          handleCancel(() => {
            throwing.cancel();
          });
        }),
      );

      const results = await outer.cancel();
      expect(results).toEqual([expect.objectContaining({ status: 'rejected' })]);

      const victim = pendingWithCleanup();
      const result = victim.promise.cancel();

      expect(isThenable(result)).toBe(true);
      await result;
      expect(victim.done()).toBe(true);
    });

    it('a strict shielded race input refusing the bubble leaves later cancels intact', async () => {
      const input = quiet(new CancelablePromise<number>(() => undefined, { shield: true, strict: true }));
      const race = quiet(CancelablePromise.race([input], { shield: true, strict: true }));
      race.shield = false;
      race.strict = false;

      await race.cancel();

      const victim = pendingWithCleanup();
      const result = victim.promise.cancel();

      expect(isThenable(result)).toBe(true);
      await result;
      expect(victim.done()).toBe(true);
    });
  });

  describe('wrapped by a helper', () => {
    // a cancelable from another library, its cancel hands back its own cleanup
    function foreignCancelable(): {
      foreign: PromiseLike<number> & { cancel: () => Promise<void> };
      done: () => boolean;
    } {
      const cleanup = hostTurnCleanup();
      const foreign = {
        then: <A = number, B = never>(
          onFulfilled?: ((value: number) => A | PromiseLike<A>) | null,
          onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
        ) => new NativePromise<number>(() => undefined).then(onFulfilled, onRejected),
        cancel: cleanup.run,
      };
      return { foreign, done: cleanup.done };
    }

    const helpers: [string, (source: PromiseLike<number>) => CancelablePromise<unknown>][] = [
      ['makeCancelable', (source) => makeCancelable(source)],
      ['catchCancel', (source) => catchCancel(source)],
      ['suppressCancel', (source) => suppressCancel(source)],
    ];

    it.each(helpers)('%s: waits for a foreign cancel cleanup', async (_name, wrap) => {
      const { foreign, done } = foreignCancelable();
      const wrapped = quiet(wrap(foreign));

      await wrapped.cancel();

      expect(done()).toBe(true);
    });

    it.each(helpers)('%s: waits for a canc source cleanup', async (_name, wrap) => {
      const { promise, done } = pendingWithCleanup();
      const wrapped = quiet(wrap(promise));

      await wrapped.cancel();

      expect(done()).toBe(true);
    });
  });

  it('a strict sync mode child bubbling into an awaitable parent does not throw', async () => {
    const parent = pendingWithCleanup();
    const child = quiet(parent.promise.then((value) => value));
    child.asyncCancel = false;
    child.strict = true;

    expect(child.cancel()).toBeUndefined();
    // the bubble lands two microtasks after the child cancel
    await NativePromise.resolve()
      .then(() => undefined)
      .then(() => undefined);
    expect(parent.promise.canceled).toBe(true);
  });

  describe('sync mode (asyncCancel:false) returns undefined', () => {
    it.each(nonPending)('%s', async (_name, make) => {
      const { promise } = await make();
      promise.asyncCancel = false;

      expect(promise.cancel()).toBeUndefined();
    });
  });
});

describe('cancel(reason) wrapping', () => {
  it('cancel(plainObject): rejection is a CancelError with cause === object', async () => {
    const reason = { code: 42, detail: 'nope' };
    const promise = new CancelablePromise(() => {
      /**/
    });

    promise.cancel(reason);

    const error: any = await promise.catch((e) => e);
    expect(isCancelError(error)).toBe(true);
    expect(error).toBeInstanceOf(CancelError);
    expect(error.cause).toBe(reason);
  });

  it('cancel(string): rejection is a CancelError with the message', async () => {
    const promise = new CancelablePromise(() => {
      /**/
    });

    promise.cancel('gone');

    const error: any = await promise.catch((e) => e);
    expect(isCancelError(error)).toBe(true);
    expect(error.message).toBe('gone');
  });

  it('cancel(CancelError): passthrough, not re-wrapped', async () => {
    const original = new CancelError('original');
    const promise = new CancelablePromise(() => {
      /**/
    });

    promise.cancel(original);

    const error: any = await promise.catch((e) => e);
    expect(error).toBe(original);
    expect(error.cause).toBeUndefined();
  });

  it('cancel(): default CancelError, no cause', async () => {
    const promise = new CancelablePromise(() => {
      /**/
    });

    promise.cancel();

    const error: any = await promise.catch((e) => e);
    expect(isCancelError(error)).toBe(true);
    expect('cause' in error).toBe(false);
  });
});

describe('CancelError brand cross-realm', () => {
  it('recognizes a CancelError branded in another realm via Symbol.for', () => {
    // A separate realm's Symbol.for('@cancjs/promise:CancelError') is the SAME symbol
    // (global registry) -> brand is copy/realm-immune by construction.
    const foreignBranded = vm.runInNewContext(`
			const err = new Error('cross-realm');
			err.name = 'CancelError';
			err[Symbol.for('@cancjs/promise:CancelError')] = true;
			err;
		`);

    // Sanity: foreign object from another realm, not a local CancelError instance
    expect(foreignBranded instanceof CancelError).toBe(false);
    expect(isCancelError(foreignBranded)).toBe(true);
  });

  it('does NOT recognize a foreign CancelError-named error lacking the brand (cross-realm)', () => {
    const foreignUnbranded = vm.runInNewContext(`
			const err = new Error('impostor');
			err.name = 'CancelError';
			err;
		`);

    expect(isCancelError(foreignUnbranded)).toBe(false);
  });
});

describe('suppression parity for wrapped/branded reasons', () => {
  it('no unhandled rejection when cancel wraps a plain object', async () => {
    const promise = new CancelablePromise(() => {
      /**/
    });

    promise.cancel({ arbitrary: true });

    await macrotask();
    // Reaching here without an unhandled rejection crashing the run is the assertion;
    // observe the settled state.
    expect(promise.isCanceled).toBe(true);
  });
});
