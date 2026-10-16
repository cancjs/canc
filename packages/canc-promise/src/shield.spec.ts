import { CancelablePromise } from './cancelable-promise';
import { isCancelError } from './helpers';

/**
 * shield option.
 *
 * A shielded promise protects ITS OWN pending work from cancellation initiated from below/outside:
 * 1. direct cancel() while pending = silent no-op (strict throws)
 * 2. bubble-cancel reaching it from children is stopped (does not self-cancel)
 * 3. it STILL rejects/cancels when its own upstream parent is canceled/rejected: down-propagation
 * via native rejection adoption is unstoppable (shield != downward protection; cf. Kotlin
 * NonCancellable / asyncio.shield which protect running work, not settled-value adoption)
 * 4. handleCancel is registerable but never fires (since the shielded node never self-cancels)
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

describe('shield option', () => {
  it('1. direct cancel() on shielded pending promise is a silent no-op', async () => {
    const promise = new CancelablePromise<number>(
      () => {
        /**/
      },
      { shield: true },
    );

    expect(promise.isCancelable).toBe(true);
    const result = promise.cancel('stop');

    expect(promise.isCanceled).toBe(false);
    expect(promise.isCancelable).toBe(true);
    expect(await result).toEqual([]);
  });

  it('2. shielded promise still settles with its value after an ignored cancel()', async () => {
    const promise = new CancelablePromise<number>(
      (resolve) => {
        setTimeout(() => resolve(42), 5);
      },
      { shield: true },
    );

    promise.cancel('stop');

    await expect(promise).resolves.toBe(42);
    expect(promise.isCanceled).toBe(false);
  });

  it('3. strict + shield: direct cancel() throws instead of silent no-op', () => {
    const promise = new CancelablePromise<number>(
      () => {
        /**/
      },
      { shield: true, strict: true },
    );

    expect(() => promise.cancel('stop')).toThrow();
    expect(promise.isCanceled).toBe(false);

    // suppress the never-settling promise's potential rejection noise
    promise.catch(() => {
      /**/
    });
  });

  it('4. shielded exposes shield flag as public field', () => {
    const promise = new CancelablePromise<number>(
      () => {
        /**/
      },
      { shield: true },
    );
    expect(promise.shield).toBe(true);

    const unshielded = new CancelablePromise<number>(() => {
      /**/
    });
    expect(unshielded.shield).toBe(false);
    unshielded.cancel();
  });

  it('5. children all-cancel: shielded parent survives (bubble stopped at shield)', async () => {
    const parent = new CancelablePromise<number>(
      (resolve) => {
        setTimeout(() => resolve(7), 5);
      },
      { shield: true },
    );

    const childA = parent.then((v) => v);
    const childB = parent.then((v) => v * 2);

    // canceling every child stops at shielded parent rather than bubbling up
    childA.cancel();
    childB.cancel();

    await macrotask();

    expect(parent.isCanceled).toBe(false);
    await expect(parent).resolves.toBe(7);
  });

  it('6. shield is per-node: a then-derived child of a shielded promise is NOT itself shielded', () => {
    const parent = new CancelablePromise<number>(
      () => {
        /**/
      },
      { shield: true },
    );
    const child = parent.then((v) => v);

    expect(child.shield).toBe(false);
    parent.catch(() => {
      /**/
    });
    child.catch(() => {
      /**/
    });
  });

  it('7. CRITICAL: shielded node still rejects when ITS upstream is canceled (down-propagation intact)', async () => {
    const parent = new CancelablePromise<number>(() => {
      /**/
    });
    // A shielded promise that adopts `parent` (upstream).
    // Adoption = native rejection propagation.
    const shielded = new CancelablePromise<number>(
      (resolve) => {
        resolve(parent);
      },
      { shield: true },
    );

    // Cancel the PARENT (upstream).
    // The shielded node must adopt the rejection (native semantics).
    parent.cancel('upstream stop');

    await macrotask();

    let caught: any;
    await shielded.catch((err) => {
      caught = err;
    });

    expect(isCancelError(caught)).toBe(true);
  });

  it('8. shielded node still rejects when its adopted upstream rejects with a normal error', async () => {
    const parent = new CancelablePromise<number>((_resolve, reject) => {
      setTimeout(() => reject(new Error('boom')), 5);
    });
    const shielded = new CancelablePromise<number>(
      (resolve) => {
        resolve(parent);
      },
      { shield: true },
    );

    let caught: any;
    await shielded.catch((err) => {
      caught = err;
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('boom');
    expect(isCancelError(caught)).toBe(false);
  });

  it('9. handleCancel on a shielded promise is registerable but never fires', async () => {
    let fired = false;
    const promise = new CancelablePromise<number>(
      (resolve) => {
        setTimeout(() => resolve(1), 5);
      },
      { shield: true },
    );

    promise.handleCancel(() => {
      fired = true;
    });
    promise.cancel('stop'); // no-op

    await expect(promise).resolves.toBe(1);
    expect(fired).toBe(false);
  });

  it('10. strict + shield: handleCancel still registerable while pending (does not throw)', () => {
    const promise = new CancelablePromise<number>(
      (resolve) => {
        setTimeout(() => resolve(1), 5);
      },
      { shield: true, strict: true },
    );

    expect(() =>
      promise.handleCancel(() => {
        /**/
      }),
    ).not.toThrow();
    promise.catch(() => {
      /**/
    });
  });

  it('11. shield + race loser: shielded loser is NOT canceled by combinator doctrine', async () => {
    let loserCanceled = false;
    const winner = new CancelablePromise<string>((resolve) => {
      setTimeout(() => resolve('win'), 5);
    });
    const loser = new CancelablePromise<string>(
      () => {
        /**/
      },
      { shield: true },
    );
    loser.handleCancel(() => {
      loserCanceled = true;
    });

    const raced = CancelablePromise.race([winner, loser]);

    await expect(raced).resolves.toBe('win');
    await macrotask();

    expect(loser.isCanceled).toBe(false);
    expect(loserCanceled).toBe(false);
    loser.cancel(); // still no-op, cleanup
  });

  it('12. shield + any loser: shielded loser is NOT canceled when another input fulfills', async () => {
    let loserCanceled = false;
    const winner = new CancelablePromise<string>((resolve) => {
      setTimeout(() => resolve('ok'), 5);
    });
    const loser = new CancelablePromise<string>(
      () => {
        /**/
      },
      { shield: true },
    );
    loser.handleCancel(() => {
      loserCanceled = true;
    });

    const result = CancelablePromise.any([winner, loser]);

    await expect(result).resolves.toBe('ok');
    await macrotask();

    expect(loser.isCanceled).toBe(false);
    expect(loserCanceled).toBe(false);
    loser.cancel();
  });

  it('13. shield + all rejecter: shielded pending input is NOT canceled on first reject', async () => {
    let shieldedCanceled = false;
    const rejecter = new CancelablePromise<number>((_resolve, reject) => {
      setTimeout(() => reject(new Error('fail')), 5);
    });
    const shieldedInput = new CancelablePromise<number>(
      () => {
        /**/
      },
      { shield: true },
    );
    shieldedInput.handleCancel(() => {
      shieldedCanceled = true;
    });

    const all = CancelablePromise.all([rejecter, shieldedInput]);

    await all.catch(() => {
      /**/
    });
    await macrotask();

    expect(shieldedInput.isCanceled).toBe(false);
    expect(shieldedCanceled).toBe(false);
    shieldedInput.cancel();
  });

  it('14. dispose (Symbol.dispose) on a shielded promise is a no-op', async () => {
    const disposeSym = (Symbol as any).dispose as symbol | undefined;

    const promise = new CancelablePromise<number>(
      (resolve) => {
        setTimeout(() => resolve(3), 5);
      },
      { shield: true },
    );

    // Guard on the wiring being present.
    // Absent either the symbol or the wired method, nothing
    // to exercise, but the shield invariant still holds.
    if (disposeSym && typeof (promise as any)[disposeSym] === 'function') {
      (promise as any)[disposeSym]();
    }

    await expect(promise).resolves.toBe(3);
    expect(promise.isCanceled).toBe(false);
  });

  describe('finally cleanup', () => {
    function makeCleanup(): { promise: CancelablePromise<void>; finish: () => void; canceled: () => boolean } {
      let finish = (): void => undefined;
      let canceled = false;
      const promise = new CancelablePromise<void>((resolve) => {
        finish = resolve;
      });
      promise.handleCancel(() => {
        canceled = true;
      });
      return { promise, finish: () => finish(), canceled: () => canceled };
    }

    it('15. canceling the finally child lets the cleanup finish, then rejects', async () => {
      const cleanup = makeCleanup();
      let started = false;
      const f = CancelablePromise.resolve(1).finally(() => {
        started = true;
        return cleanup.promise;
      });
      let outcome: unknown;
      let settled = false;
      NativePromise.prototype.then.call(f, undefined, (error: unknown) => {
        settled = true;
        outcome = error;
      });

      await macrotask();
      expect(started).toBe(true);

      void f.cancel('stop');
      await macrotask();

      expect(cleanup.canceled()).toBe(false);
      expect(cleanup.promise.isCanceled).toBe(false);
      expect(settled).toBe(false);

      cleanup.finish();
      await macrotask();

      expect(settled).toBe(true);
      expect(isCancelError(outcome)).toBe(true);
      await expect(cleanup.promise).resolves.toBeUndefined();
    });

    it('16. awaiting cancel() on the finally child waits for the cleanup', async () => {
      const cleanup = makeCleanup();
      const f = CancelablePromise.resolve(1).finally(() => cleanup.promise);
      f.catch(() => {
        /**/
      });

      await macrotask();

      let cancelDone = false;
      void (f.cancel() as PromiseLike<unknown>).then(() => {
        cancelDone = true;
      });
      await macrotask();
      expect(cancelDone).toBe(false);

      cleanup.finish();
      await macrotask();
      expect(cancelDone).toBe(true);
      expect(f.isCanceled).toBe(true);
    });

    it('17. cleanup started after the finally child was canceled is not canceled', async () => {
      const cleanup = makeCleanup();
      let releaseSource = (): void => undefined;
      const source = new CancelablePromise<number>((resolve) => {
        releaseSource = () => resolve(1);
      });
      const f = source.finally(() => cleanup.promise);
      f.catch(() => {
        /**/
      });
      // a second consumer keeps the source alive when the finally child goes
      const kept = source.then((v) => v);

      void f.cancel();
      releaseSource();
      await macrotask();

      expect(cleanup.canceled()).toBe(false);
      expect(cleanup.promise.isCanceled).toBe(false);
      cleanup.finish();
      await expect(kept).resolves.toBe(1);
    });

    it('18. a strict finally child does not throw when canceled during its cleanup', async () => {
      const cleanup = makeCleanup();
      const f = new CancelablePromise<number>((resolve) => resolve(1), { strict: true }).finally(() => cleanup.promise);
      f.catch(() => {
        /**/
      });

      await macrotask();
      expect(() => f.cancel()).not.toThrow();
      expect(cleanup.canceled()).toBe(false);

      cleanup.finish();
      await macrotask();
      expect(f.isCanceled).toBe(true);
    });

    it('19. a cleanup that rejects wins over a cancel that waited for it', async () => {
      let failCleanup = (_error: Error): void => undefined;
      const cleanup = new CancelablePromise<void>((_resolve, reject) => {
        failCleanup = reject;
      });
      const f = CancelablePromise.resolve(1).finally(() => cleanup);
      let outcome: unknown;
      NativePromise.prototype.then.call(f, undefined, (error: unknown) => {
        outcome = error;
      });

      await macrotask();
      const cancelResult = f.cancel() as PromiseLike<unknown>;
      failCleanup(new Error('cleanup failed'));

      await cancelResult;
      expect((outcome as Error).message).toBe('cleanup failed');
      expect(f.isCanceled).toBe(false);
    });

    it('20. repeated and non-awaitable cancels during the cleanup land once', async () => {
      const cleanup = makeCleanup();
      let fired = 0;
      const f = new CancelablePromise<number>((resolve) => resolve(1), { asyncCancel: false }).finally(
        () => cleanup.promise,
      );
      f.handleCancel(() => {
        fired++;
      });
      f.catch(() => {
        /**/
      });

      await macrotask();
      f.cancel('first');
      f.cancel('second');
      expect(fired).toBe(0);

      cleanup.finish();
      await macrotask();
      expect(fired).toBe(1);
      expect(f.isCanceled).toBe(true);
    });
  });
});
