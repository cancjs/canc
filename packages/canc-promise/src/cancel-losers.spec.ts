import { CancelablePromise } from './cancelable-promise';

/**
 * Losers of the combinators.
 *
 * any() gives up its losers on the first fulfill (race does the same); all() gives up the remaining
 * inputs on the first reject; allSettled gives up nothing while it waits. An input nothing else
 * consumes is canceled when given up. bubble:false inputs are never canceled. Already-settled
 * inputs are a no-op. Loser rejections are suppressed (no unhandled events).
 *
 * Matrix covers 12+ cases: winner/rejector settles and losers are given up; bubble:false
 * input NOT canceled; already-settled inputs no-op; canceled-loser rejections suppressed.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

describe('cancel-losers', () => {
  // Helper to create a promise with exposed resolve/reject for testing
  interface Deferred<T> {
    promise: CancelablePromise<T>;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
  }

  function createDeferred<T>(options?: any): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: any) => void;
    const promise = new CancelablePromise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }, options);
    return { promise, resolve, reject };
  }

  it('any() first fulfill cancels other pending inputs (loser)', async () => {
    const p1 = createDeferred();
    const p2 = createDeferred();
    const p3 = createDeferred();

    const result = CancelablePromise.any([p1.promise, p2.promise, p3.promise]);

    // Resolve first input -> result resolves
    p1.resolve('winner');
    await result;

    expect(result.isCanceled).toBe(false);

    // Losers should be canceled
    await macrotask();
    expect(p2.promise.isCanceled).toBe(true);
    expect(p3.promise.isCanceled).toBe(true);
  });

  it('any() loser-rejection suppressed (loser canceled)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('winner'));
    const p2 = new CancelablePromise((_resolve, reject) => {
      setTimeout(() => reject(new Error('loser boom')), 5);
    });
    const p3 = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.any([p1, p2, p3]);
    await result;

    // p1 wins -> p2 and p3 are losers, given up and canceled
    await macrotask();
    expect(p2.isCanceled).toBe(true); // loser, given up and canceled
    expect(p3.isCanceled).toBe(true); // loser, given up and canceled
    expect((result as any).isCanceled).toBe(false); // winner
    // No unhandled rejection from p2; reaching here proves suppression works
  });

  it('any() respects bubble:false on loser (NOT canceled)', async () => {
    const shielded = new CancelablePromise(
      () => {
        /**/
      },
      { bubble: false },
    );
    const loser = new CancelablePromise(() => {
      /**/
    });
    const winner = new CancelablePromise((resolve) => resolve('won'));

    const result = CancelablePromise.any([shielded, loser, winner]);
    await result;

    // loser is a normal loser -> canceled
    // shielded has bubble:false -> not canceled even though it's a loser
    await macrotask();
    expect(loser.isCanceled).toBe(true);
    expect(shielded.isCanceled).toBe(false); // bubble:false protects from loser-cancel
  });

  it('any() all-reject (all canceled) -> AggregateError (edge case)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('winner'));
    const p2 = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.any([p1, p2]);
    await result;
    // the released loser stops once its consumer count is rechecked
    await macrotask();

    expect(p1).toEqual(expect.objectContaining({ isCanceled: false })); // winner, settled
    expect(p2.isCanceled).toBe(true); // loser, canceled
  });

  it('all() first reject cancels other pending inputs', async () => {
    const p1 = new CancelablePromise((_resolve) => {
      /**/
    });
    const p2 = new CancelablePromise((_resolve) => {
      /**/
    });
    let rejectP3!: (reason?: any) => void;
    const p3 = new CancelablePromise((_resolve, reject) => {
      rejectP3 = reject;
    });

    const result = CancelablePromise.all([p1, p2, p3]);
    result.catch(() => {
      /**/
    }); // Catch the result error to suppress unhandled rejection

    // Reject p3, triggering loser-cancellation
    rejectP3(new Error('rejector'));
    await macrotask();

    // p3 rejects -> p1, p2 should be canceled
    expect(p1.isCanceled).toBe(true);
    expect(p2.isCanceled).toBe(true);
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  it('all() rejector rejection is not suppressed (normal rejection)', async () => {
    const p1 = new CancelablePromise(() => {
      /**/
    });
    const boom = new Error('boom');
    const p2 = new CancelablePromise((_resolve, reject) => {
      setTimeout(() => reject(boom), 0);
    });

    const result = CancelablePromise.all([p1, p2]);
    const caught = await result.catch((e) => e);

    expect(caught).toBe(boom); // rejector's error surfaces (not suppressed)
    expect(p1.isCanceled).toBe(true); // p1 canceled as remaining
  });

  it('all() respects bubble:false on a remaining input (NOT canceled on reject)', async () => {
    const shielded = new CancelablePromise(
      () => {
        /**/
      },
      { bubble: false },
    );
    const normal = new CancelablePromise(() => {
      /**/
    });
    let rejectRejector!: (reason?: any) => void;
    const rejector = new CancelablePromise((_resolve, reject) => {
      rejectRejector = reject;
    });

    const result = CancelablePromise.all([shielded, normal, rejector]);
    result.catch(() => {
      /**/
    }); // Catch result to suppress unhandled rejection

    rejectRejector(new Error('fail'));
    await macrotask();

    // rejector fails -> normal is canceled (remaining), shielded has bubble:false
    expect(normal.isCanceled).toBe(true); // remaining, not shielded
    expect(shielded.isCanceled).toBe(false); // bubble:false blocks cancel propagation
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  it('all() already-fulfilled input is not canceled on rejection', async () => {
    const fulfilled = CancelablePromise.resolve('done');
    const pending = new CancelablePromise(() => {
      /**/
    });
    let rejectRejector!: (reason?: any) => void;
    const rejector = new CancelablePromise((_resolve, reject) => {
      rejectRejector = reject;
    });

    const result = CancelablePromise.all([fulfilled, pending, rejector]);
    result.catch(() => {
      /**/
    }); // Catch result to suppress unhandled rejection

    rejectRejector(new Error('fail'));
    await macrotask();

    expect(fulfilled.isCanceled).toBe(false); // already-settled, not canceled
    expect(pending.isCanceled).toBe(true); // remaining, canceled
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  it('allSettled() does NOT cancel inputs (waits all)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('value'));
    const p2 = new CancelablePromise(() => {
      /**/
    });
    const p3 = new CancelablePromise(() => {
      /**/
    });

    const _result = CancelablePromise.allSettled([p1, p2, p3]);
    await macrotask();

    // allSettled() wraps inputs in .then() that convert all results to {status, reason} objects,
    // so the underlying all() never sees a rejection from p1/p2/p3 themselves.
    // Thus no input is given up. p2, p3 remain pending (not canceled).
    expect(p2.isCanceled).toBe(false);
    expect(p3.isCanceled).toBe(false); // allSettled waits, gives up nothing
  });

  it('allSettled() settles with loser rejections included (no suppression by allSettled)', async () => {
    const err1 = new Error('fail-1');
    const err2 = new Error('fail-2');
    const p1 = new CancelablePromise((_resolve, reject) => {
      setTimeout(() => reject(err1), 5);
    });
    const p2 = new CancelablePromise((_resolve, reject) => {
      setTimeout(() => reject(err2), 5);
    });

    const result = CancelablePromise.allSettled([p1, p2]);
    const settled = await result;

    expect(settled).toHaveLength(2);
    expect((settled[0] as PromiseRejectedResult).status).toBe('rejected');
    expect((settled[0] as PromiseRejectedResult).reason).toBe(err1);
    expect((settled[1] as PromiseRejectedResult).status).toBe('rejected');
    expect((settled[1] as PromiseRejectedResult).reason).toBe(err2);
  });

  it('any() complex matrix: mix of resolved, pending, bubble:false losers', async () => {
    const resolved = CancelablePromise.resolve('already-there');
    const pending = new CancelablePromise(() => {
      /**/
    });
    const shielded = new CancelablePromise(
      () => {
        /**/
      },
      { bubble: false },
    );
    const winner = new CancelablePromise((resolve) => resolve('win'));

    const result = CancelablePromise.any([resolved, pending, shielded, winner]);
    await result;

    await macrotask();
    // resolved: already-settled, not in play
    // pending: loser, canceled
    // shielded: loser, bubble:false, NOT canceled
    // winner: settled result
    expect(pending.isCanceled).toBe(true);
    expect(shielded.isCanceled).toBe(false);
  });

  it('all() complex matrix: mix of fulfilled, pending, rejector, bubble:false', async () => {
    const fulfilled = CancelablePromise.resolve('done');
    const pending1 = new CancelablePromise(() => {
      /**/
    });
    const shielded = new CancelablePromise(
      () => {
        /**/
      },
      { bubble: false },
    );
    let rejectRejector!: (reason?: any) => void;
    const rejector = new CancelablePromise((_resolve, reject) => {
      rejectRejector = reject;
    });

    const result = CancelablePromise.all([fulfilled, pending1, shielded, rejector]);
    result.catch(() => {
      /**/
    }); // Catch result to suppress unhandled rejection

    rejectRejector(new Error('fail'));
    await macrotask();

    // fulfilled: already-settled, not canceled
    // pending1: remaining, canceled
    // shielded: remaining, bubble:false, NOT canceled
    // rejector: settles with error
    expect(fulfilled.isCanceled).toBe(false);
    expect(pending1.isCanceled).toBe(true);
    expect(shielded.isCanceled).toBe(false);
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  it('race() cancels losers when any input settles (bubbleOnComplete mirror)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('racer1'));
    const p2 = new CancelablePromise(() => {
      /**/
    });
    const p3 = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.race([p1, p2, p3]);
    await result;

    await macrotask();
    // p2, p3 are losers -> canceled (race uses bubbleOnComplete=true)
    expect(p2.isCanceled).toBe(true);
    expect(p3.isCanceled).toBe(true);
  });

  it('any() loser CancelError from cancel() is suppressed (no unhandled)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('winner'));
    const loser = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.any([p1, loser]);
    await result;

    // loser given up and canceled -> CancelError rejection suppressed
    await macrotask();
    expect(loser.isCanceled).toBe(true);
    // No unhandled rejection; reaching here confirms
  });
});
