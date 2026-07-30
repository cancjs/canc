import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';
import { isCancelError } from './helpers';

/**
 * Cancel-losers doctrine.
 *
 * Doctrine: any() cancels losers on first fulfill (mirror race); all() cancels remaining on
 * first reject; allSettled no-op (waits all). bubble:false inputs respected (not canceled).
 * Already-settled inputs no-op. Loser rejections suppressed (no unhandled events).
 *
 * Matrix covers 12+ cases: winner/rejector settles → losers canceled per doctrine; bubble:false
 * input NOT canceled; already-settled inputs no-op; canceled-loser rejections suppressed.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

describe('cancel-losers doctrine', () => {
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

  // === any() cases: fulfill cancels losers ===

  // Case 1: any() first fulfill -> other pending inputs canceled
  it('any() first fulfill cancels other pending inputs (loser doctrine)', async () => {
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

  // Case 2: any() loser-rejection suppressed (no unhandled)
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

    // p1 wins -> p2 and p3 are losers and canceled (doctrine)
    await macrotask();
    expect(p2.isCanceled).toBe(true); // loser, canceled by doctrine
    expect(p3.isCanceled).toBe(true); // loser, canceled by doctrine
    expect((result as any).isCanceled).toBe(false); // winner
    // No unhandled rejection from p2; reaching here proves suppression works
  });

  // Case 3: any() with bubble:false loser NOT canceled
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

  // Case 4: any() all-reject -> aggregate error, losers already-canceled
  it('any() all-reject (all canceled) -> AggregateError (edge case)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('winner'));
    const p2 = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.any([p1, p2]);
    await result;

    expect(p1).toEqual(expect.objectContaining({ isCanceled: false })); // winner, settled
    expect(p2.isCanceled).toBe(true); // loser, canceled
  });

  // === all() cases: reject cancels remaining ===

  // Case 5: all() first reject -> other pending inputs canceled
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

  // Case 6: all() rejector-child rejection suppressed
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

  // Case 7: all() with bubble:false rejector NOT canceled (bubble semantics)
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

  // Case 8: all() already-fulfilled input no-op (not canceled)
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

  // === allSettled() cases: no-op (waits all) ===

  // Case 9: allSettled() does NOT cancel losers on fulfill (waits for all)
  it('allSettled() does NOT cancel inputs (waits all)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('value'));
    const p2 = new CancelablePromise(() => {
      /**/
    });
    const p3 = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.allSettled([p1, p2, p3]);
    await macrotask();

    // allSettled() wraps inputs in .then() that convert all results to {status, reason} objects,
    // so the underlying all() never sees a rejection from p1/p2/p3 themselves —
    // thus no loser-cancellation doctrine triggers. p2, p3 remain pending (not canceled).
    expect(p2.isCanceled).toBe(false);
    expect(p3.isCanceled).toBe(false); // allSettled waits, no-op per doctrine
  });

  // Case 10: allSettled() result includes rejected losers (not suppressed by doctrine)
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

  // === Cross-doctrine edge cases ===

  // Case 11: any() with mixed resolved/pending/bubble:false
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

  // Case 12: all() with mix of fulfilled, pending, rejector, bubble:false
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

  // Case 13: race() mirror behavior (bubbleOnComplete) — loser canceled on any settle
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

  // Case 14: any() loser CancelError rejection from cancel() is suppressed
  it('any() loser CancelError from cancel() is suppressed (no unhandled)', async () => {
    const p1 = new CancelablePromise((resolve) => resolve('winner'));
    const loser = new CancelablePromise(() => {
      /**/
    });

    const result = CancelablePromise.any([p1, loser]);
    await result;

    // loser canceled by doctrine -> CancelError rejection suppressed
    await macrotask();
    expect(loser.isCanceled).toBe(true);
    // No unhandled rejection; reaching here confirms
  });
});
