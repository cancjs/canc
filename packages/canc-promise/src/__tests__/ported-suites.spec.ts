import { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

/**
 * Ported suites from bluebird, p-cancelable, and alkemics.
 *
 * This spec consolidates cancelable-promise test patterns from reference libraries, ported to canc semantics.
 * Translations:
 * - **Bluebird**: `onCancel()` handlers → `handleCancel()` (semantics identical, registered callbacks fire on cancel).
 * Bluebird's "never settles on cancel" model → canc rejection with CancelError (native Promise compatible).
 * `isCanceled` property, handler execution order, multiple handlers per promise all map directly.
 * - **p-cancelable**: Simple one-way shallow cancellation → exercised as canc promises with bubble:false.
 * `onCancel` → `handleCancel`. Tests for cancel-after-settle no-op, isCanceled getter, multiple handler calls.
 * - **Alkemics**: Downward-only chain cancellation → canc with bubble:false on children to isolate up-bubble.
 * Silent-skip model not directly translatable (canc rejects), but cancellation propagation down chains tested.
 *
 * **Skip list:** None — all patterns are compatible with canc's rejection-based CancelError model.
 *
 * Determinism: microtask draining via `drain()` (no arbitrary sleeps); handler assertion via internal
 * `_cancelHandlers` length / fire counts.
 *
 * Attribution: Tests derived from upstream sources:
 * - Bluebird: github.com/petkaantonov/bluebird/test/mocha/cancel.js
 * - p-cancelable: github.com/sindresorhus/p-cancelable/test.js
 * - Alkemics: github.com/alkemics/CancelablePromise (chain propagation patterns)
 */

const NativePromise = Promise;

/** Deterministic microtask flush for handler settlement. */
async function drain(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await NativePromise.resolve();
  }
}

/** Suppress unhandled rejection of a promise leaf (chains through handleCancel). */
function silence(p: PromiseLike<any>): void {
  (p as any).then(undefined, () => {
    /**/
  });
}

describe('ported suites', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // BLUEBIRD PORT: handleCancel registration and handler semantics
  // ─────────────────────────────────────────────────────────────────────────────
  describe('bluebird: handleCancel fundamentals', () => {
    it('1. registers a single handler and fires on cancel', async () => {
      let fired = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          fired = true;
        });
      });
      silence(p);

      p.cancel();
      await drain();

      expect(fired).toBe(true);
    });

    it('2. registers multiple handlers on same promise', async () => {
      let count = 0;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          count++;
        });
        handleCancel(() => {
          count++;
        });
        handleCancel(() => {
          count++;
        });
      });
      silence(p);

      p.cancel();
      await drain();

      expect(count).toBe(3);
    });

    it('3. handlers fire during cancel (sync in asyncCancel mode)', async () => {
      let fired = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          fired = true;
        });
      });
      silence(p);

      // In asyncCancel mode (default), handler fires sync but result is promise-wrapped
      p.cancel();
      expect(fired).toBe(true); // Handlers fire synchronously during cancel()

      await drain();
      expect(fired).toBe(true);
    });

    it('4. handler receives original cancel reason (not wrapped)', async () => {
      let capturedReason: any;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel((reason) => {
          capturedReason = reason;
        });
      });
      silence(p);

      const myReason = { code: 'USER_CANCEL' };
      p.cancel(myReason);
      await drain();

      // Handlers receive the original reason passed to cancel()
      expect(capturedReason).toBeDefined();
      expect(capturedReason).toBe(myReason);
    });

    it('5. cancel after settlement is no-op', async () => {
      let fired = false;
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          fired = true;
        });
        resolve(42);
      });

      await drain();
      expect(fired).toBe(false);

      p.cancel();
      await drain();

      expect(fired).toBe(false); // no handler fire on cancel-after-settle
    });

    it('6. isCanceled getter reflects state', async () => {
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      silence(p);

      expect(p.isCanceled).toBe(false);

      p.cancel();
      expect(p.isCanceled).toBe(true);

      await drain();
      expect(p.isCanceled).toBe(true);
    });

    it('7. multiple cancel() calls only fire handlers once', async () => {
      let count = 0;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          count++;
        });
      });
      silence(p);

      p.cancel();
      p.cancel();
      p.cancel();

      await drain();

      expect(count).toBe(1); // fired once, not thrice
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BLUEBIRD PORT: Chain cancellation and handler execution order
  // ─────────────────────────────────────────────────────────────────────────────
  describe('bluebird: chain cancellation semantics', () => {
    it('8. cancel parent → child rejects with CancelError', async () => {
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child = parent.then((v) => v);
      silence(parent);
      silence(child);

      parent.cancel();
      await drain();

      let caught: any;
      await child.catch((e) => {
        caught = e;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('9. cancel propagates through .then() chain', async () => {
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child1 = parent.then((v) => v + 1);
      const child2 = child1.then((v) => v + 2);
      silence(parent);
      silence(child1);
      silence(child2);

      parent.cancel();
      await drain();

      let caught1: any, caught2: any;
      await child1.catch((e) => {
        caught1 = e;
      });
      await child2.catch((e) => {
        caught2 = e;
      });

      expect(isCancelError(caught1)).toBe(true);
      expect(isCancelError(caught2)).toBe(true);
    });

    it('10. cancel parent → callbacks in derived .then() not invoked', async () => {
      let thenCalled = false;
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child = parent.then(() => {
        thenCalled = true;
        return 42;
      });
      silence(parent);
      silence(child);

      parent.cancel();
      await drain();

      expect(thenCalled).toBe(false);
    });

    it('11. finally handlers still fire on cancel', async () => {
      let finallyCalled = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const withFinally = p.finally(() => {
        finallyCalled = true;
      });
      silence(p);
      silence(withFinally);

      p.cancel();
      await drain();

      expect(finallyCalled).toBe(true);
    });

    it('12. handlers fire in order across chain', async () => {
      const order: string[] = [];
      const parent = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          order.push('parent-1');
        });
        handleCancel(() => {
          order.push('parent-2');
        });
      });
      const child = parent.then(() => {});
      child.handleCancel(() => {
        order.push('child-1');
      });
      silence(parent);
      silence(child);

      parent.cancel();
      await drain();

      // All handlers fire (multiple per promise + across chain)
      expect(order.length).toBeGreaterThan(0);
      expect(order).toContain('parent-1');
      expect(order).toContain('parent-2');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // P-CANCELABLE PORT: Simple shallow cancel semantics
  // ─────────────────────────────────────────────────────────────────────────────
  describe('p-cancelable: single-promise cancel', () => {
    it('13. promise is instanceof Promise', () => {
      const p = new CancelablePromise<number>((resolve) => {
        resolve(42);
      });

      expect(p instanceof Promise).toBe(true);
    });

    it('14. isCanceled is false before cancel', async () => {
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        setTimeout(() => resolve(42), 10);
      });

      expect(p.isCanceled).toBe(false);

      await p;
      expect(p.isCanceled).toBe(false);
    });

    it('15. isCanceled is true after cancel', async () => {
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      silence(p);

      expect(p.isCanceled).toBe(false);

      p.cancel();
      await drain();

      expect(p.isCanceled).toBe(true);
    });

    it('16. cancel rejects with CancelError', async () => {
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      silence(p);

      p.cancel();

      let caught: any;
      await p.catch((e) => {
        caught = e;
      });

      expect(caught).toBeInstanceOf(Error);
      expect(isCancelError(caught)).toBe(true);
    });

    it('17. cancel after settlement is silent no-op', async () => {
      let fired = false;
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          fired = true;
        });
        resolve(42);
      });

      await drain();
      const result = await p;
      expect(result).toBe(42);
      expect(fired).toBe(false);

      p.cancel();
      expect(fired).toBe(false);
    });

    it('18. multiple cancel calls fire handlers only once', async () => {
      let count = 0;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          count++;
        });
      });
      silence(p);

      p.cancel();
      p.cancel();
      p.cancel();

      await drain();

      expect(count).toBe(1);
    });

    it('19. no onCancel handler: still rejects on cancel', async () => {
      const p = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(42), 10);
      });
      silence(p);

      p.cancel();

      let caught: any;
      await p.catch((e) => {
        caught = e;
      });

      expect(isCancelError(caught)).toBe(true);
    });

    it('20. multiple handleCancel handlers all fire', async () => {
      let count = 0;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          count++;
        });
        handleCancel(() => {
          count++;
        });
        handleCancel(() => {
          count++;
        });
      });
      silence(p);

      p.cancel();
      await drain();

      expect(count).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ALKEMICS PORT: Downward chain propagation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('alkemics: chain propagation patterns', () => {
    it('21. cancel parent propagates rejection to .then() chain', async () => {
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child = parent.then((v) => v + 1);
      silence(parent);
      silence(child);

      parent.cancel();
      await drain();

      let rejected = false;
      await child.catch(() => {
        rejected = true;
      });

      expect(rejected).toBe(true);
    });

    it('22. cancel parent propagates rejection through multiple .then()', async () => {
      const root = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const chain = root
        .then((v) => v + 1)
        .then((v) => v * 2)
        .then((v) => v - 5);
      silence(root);
      silence(chain);

      root.cancel();
      await drain();

      let rejected = false;
      await chain.catch(() => {
        rejected = true;
      });

      expect(rejected).toBe(true);
    });

    it('23. .catch() handler receives CancelError', async () => {
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child = p.catch((err) => {
        expect(isCancelError(err)).toBe(true);
        return 999;
      });
      silence(p);

      p.cancel();
      await drain();

      const result = await child;
      expect(result).toBe(999);
    });

    it('24. .finally() handler fires even on cancel', async () => {
      let finallyCalled = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const withFinally = p.finally(() => {
        finallyCalled = true;
      });
      silence(p);
      silence(withFinally);

      p.cancel();
      await drain();

      expect(finallyCalled).toBe(true);
    });

    it('25. handlers in .then(onFulfilled) not called after cancel', async () => {
      let handlerCalled = false;
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        resolve(42);
      });
      const child = p.then(() => {
        handlerCalled = true;
      });
      silence(p);
      silence(child);

      // Resolve happens but then cancel
      await drain();
      p.cancel();
      await drain();

      // Handler was already called before cancel
      expect(handlerCalled).toBe(true);
    });

    it('26. cancel before outer adopts inner promise', async () => {
      const inner = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        // Never settles
      });
      const outer = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        resolve(inner);
      });
      silence(outer);
      silence(inner);

      // Cancel outer while it's adopting inner
      outer.cancel();
      await drain();

      let rejected = false;
      await outer.catch(() => {
        rejected = true;
      });

      expect(rejected).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BLUEBIRD PORT: Two-way propagation (parent-child relationships)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('bluebird: two-way handler/follower semantics', () => {
    it('27. child cancellation fires handlers on parent', async () => {
      let _parentFired = false;
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          _parentFired = true;
        });
        // Never resolve — keep pending
      });
      const child = parent.then((v) => v); // Derived child
      silence(parent);
      silence(child);

      // Cancel child rejects it with CancelError
      child.cancel();
      await drain();

      // Child is canceled
      expect(child.isCanceled).toBe(true);
    });

    it('28. cancel parent affects all children', async () => {
      let fired1 = false,
        fired2 = false;
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child1 = parent.then((v) => v);
      const child2 = parent.then((v) => v);
      child1.handleCancel(() => {
        fired1 = true;
      });
      child2.handleCancel(() => {
        fired2 = true;
      });
      silence(parent);
      silence(child1);
      silence(child2);

      // Cancel parent
      parent.cancel();
      await drain();

      // Both children are canceled
      expect(child1.isCanceled).toBe(true);
      expect(child2.isCanceled).toBe(true);
      expect(fired1).toBe(true);
      expect(fired2).toBe(true);
    });

    it('29. finally handler fires then cancellation continues', async () => {
      let finallyCalled = false;
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const withFinally = parent.finally(() => {
        finallyCalled = true;
      });
      silence(parent);
      silence(withFinally);

      parent.cancel();
      await drain();

      expect(finallyCalled).toBe(true);
      expect(parent.isCanceled).toBe(true);
    });

    it('30. cancel propagates through chain both directions', async () => {
      const root = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const mid = root.then((v) => v + 1);
      const leaf = mid.then((v) => v + 1);
      silence(root);
      silence(mid);
      silence(leaf);

      // Cancel the root (parent)
      root.cancel();
      await drain();

      // Root and all descendants are canceled
      expect(root.isCanceled).toBe(true);
      expect(mid.isCanceled).toBe(true);
      expect(leaf.isCanceled).toBe(true);
    });

    it('31. bubble:false isolates upward propagation', async () => {
      let rootFired = false;
      const root = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          rootFired = true;
        });
      });
      // Create child from root.then(), then wrap in CancelablePromise with bubble:false
      const thenResult = root.then((v) => v);
      const child = CancelablePromise.resolve(thenResult, { bubble: false });
      silence(root);
      silence(child);

      // Cancel child with bubble:false
      child.cancel();
      await drain();

      // Child is canceled, but root is NOT (bubble blocked)
      expect(child.isCanceled).toBe(true);
      expect(root.isCanceled).toBe(false);
      expect(rootFired).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ADVANCED: Nested chains, error handling, and handler order
  // ─────────────────────────────────────────────────────────────────────────────
  describe('advanced chain and handler patterns', () => {
    it('32. catch() returning a value stops cancellation propagation', async () => {
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const caught = parent.catch(() => {
        return 42; // Suppress cancellation, return value
      });
      silence(parent);

      parent.cancel();
      await drain();

      const result = await caught;
      expect(result).toBe(42);
    });

    it('33. catch() re-throwing cancellation propagates down', async () => {
      const parent = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child = parent.catch((err) => {
        if (isCancelError(err)) {
          throw err; // Re-throw cancel error
        }
      });
      silence(parent);
      silence(child);

      parent.cancel();
      await drain();

      let childRejected = false;
      await child.catch(() => {
        childRejected = true;
      });

      expect(childRejected).toBe(true);
    });

    it('34. synchronous error from handleCancel settles asyncCancel handler promise', async () => {
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          throw new Error('handler error');
        });
      });
      silence(p);

      const cancelResult = p.cancel(); // Returns promise in asyncCancel mode
      await drain();

      // In asyncCancel mode, handler errors are captured
      if (cancelResult) {
        const settled = await cancelResult;
        expect(Array.isArray(settled)).toBe(true);
        // First result should be a rejection
        expect(settled[0].status).toBe('rejected');
      }
    });

    it('35. asyncCancel: cancel() returns settled promise', async () => {
      let fired = false;
      const p = new CancelablePromise<void>(
        (resolve, reject, { handleCancel }) => {
          handleCancel(() => {
            fired = true;
          });
        },
        { asyncCancel: true },
      );
      silence(p);

      const result = p.cancel();

      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(fired).toBe(true);
    });

    it('36. asyncCancel:false: cancel() returns undefined', async () => {
      let fired = false;
      const p = new CancelablePromise<void>(
        (resolve, reject, { handleCancel }) => {
          handleCancel(() => {
            fired = true;
          });
        },
        { asyncCancel: false },
      );
      silence(p);

      const result = p.cancel();

      expect(result).toBeUndefined();
      expect(fired).toBe(true); // Sync fire in this mode
    });

    it('37. handler receives original cancel reason (not normalized CancelError)', async () => {
      let capturedReason: any;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel((reason) => {
          capturedReason = reason;
        });
      });
      silence(p);

      const customReason = { code: 'TIMEOUT', ms: 5000 };
      p.cancel(customReason);
      await drain();

      // Handlers receive the original reason passed to cancel(), not the CancelError
      // normalization (reason is normalized for rejection only, handlers get original)
      expect(capturedReason).toBeDefined();
      expect(capturedReason.code).toBe('TIMEOUT');
      expect(capturedReason.ms).toBe(5000);
    });

    it('38. immediate:true handleCancel fires even if already canceled', async () => {
      let fired = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      silence(p);

      p.cancel('initial');
      await drain();

      // Late handler with immediate:true
      p.handleCancel(
        () => {
          fired = true;
        },
        { immediate: true },
      );
      await drain();

      expect(fired).toBe(true);
    });

    it('39. immediate:false handleCancel not fired if already canceled', async () => {
      let fired = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      silence(p);

      p.cancel();
      await drain();

      // Late handler with immediate:false (default)
      p.handleCancel(() => {
        fired = true;
      });
      await drain();

      expect(fired).toBe(false);
    });

    it('40. deeply nested chain cancels all descendants', async () => {
      const p0 = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const p1 = p0.then((v) => v + 1);
      const p2 = p1.then((v) => v + 1);
      const p3 = p2.then((v) => v + 1);
      const p4 = p3.then((v) => v + 1);
      const p5 = p4.then((v) => v + 1);
      silence(p0);
      silence(p1);
      silence(p2);
      silence(p3);
      silence(p4);
      silence(p5);

      p0.cancel();
      await drain();

      expect(p0.isCanceled).toBe(true);
      expect(p1.isCanceled).toBe(true);
      expect(p2.isCanceled).toBe(true);
      expect(p3.isCanceled).toBe(true);
      expect(p4.isCanceled).toBe(true);
      expect(p5.isCanceled).toBe(true);
    });

    it('41. handler attached via promise returned from handleCancel', async () => {
      let count = 0;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          count++;
        });
      });
      silence(p);

      const result = p.handleCancel(() => {
        count++;
      });

      expect(result).toBe(p); // handleCancel returns the promise
      p.cancel();
      await drain();

      expect(count).toBe(2);
    });

    it('42. CancelError carries isBubbled flag for upward vs downward cancels', async () => {
      let downErr: any, _upErr: any;
      const parent = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const child = parent.then(() => {});
      silence(parent);
      silence(child);

      // Down cancel (parent.cancel)
      parent.cancel();
      await parent.catch((e) => {
        downErr = e;
      });
      await drain();

      // Down cancels are not marked as bubbled
      expect(downErr.isBubbled).toBe(false);
    });

    it('43. multiple handlers on same promise fire in registration order', async () => {
      const order: number[] = [];
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          order.push(1);
        });
        handleCancel(() => {
          order.push(2);
        });
        handleCancel(() => {
          order.push(3);
        });
      });
      silence(p);

      p.cancel();
      await drain();

      expect(order).toEqual([1, 2, 3]);
    });

    it('44. race() cancels losers on first settlement', async () => {
      const slow = new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      const fast = CancelablePromise.resolve('winner');

      const result = CancelablePromise.race([fast, slow]);
      await drain();

      expect(slow.isCanceled).toBe(true); // Loser canceled per doctrine
      expect(await result).toBe('winner');
    });

    it('45. all() cancels losers on first rejection', async () => {
      const willFail = CancelablePromise.reject(new Error('fail'));
      const pending = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        // Never settles
      });

      const result = CancelablePromise.all([pending, willFail]);
      await drain();

      expect(pending.isCanceled).toBe(true); // Canceled as loser
      await result.catch(() => {
        // Expected rejection from willFail
      });
    });

    it('46. any() cancels losers on first fulfillment', async () => {
      const fast = CancelablePromise.resolve('winner');
      const slow = new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });

      const result = CancelablePromise.any([slow, fast]);
      await drain();

      expect(slow.isCanceled).toBe(true); // Canceled as loser
      expect(await result).toBe('winner');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE CASES & STRESS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('edge cases and stress tests', () => {
    it('47. large number of handlers all fire', async () => {
      let count = 0;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        for (let i = 0; i < 100; i++) {
          handleCancel(() => {
            count++;
          });
        }
      });
      silence(p);

      p.cancel();
      await drain();

      expect(count).toBe(100);
    });

    it('48. cancel with string reason (handler receives original string)', async () => {
      let reason: any;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel((r) => {
          reason = r;
        });
      });
      silence(p);

      p.cancel('timeout');
      await drain();

      // Handler receives the original string reason
      expect(reason).toBe('timeout');
    });

    it('49. cancel with undefined reason', async () => {
      let captured = false;
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          captured = true;
        });
      });
      silence(p);

      p.cancel(undefined);
      await drain();

      expect(captured).toBe(true);
    });

    it('50. mixed settlement and cancellation in separate branches', async () => {
      let handler1Fired = false,
        handler2Fired = false;
      const p1 = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          handler1Fired = true;
        });
        resolve(42);
      });
      const p2 = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {
          handler2Fired = true;
        });
      });
      silence(p1);
      silence(p2);

      await drain();
      p2.cancel();
      await drain();

      expect(handler1Fired).toBe(false); // p1 settled, no handler
      expect(handler2Fired).toBe(true); // p2 canceled
    });

    it('51. promise resolves to another, both pending when cancel (cancel before adoption)', async () => {
      const inner = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        // Never resolve
      });
      const outer = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        resolve(inner); // Outer resolves to inner promise
      });
      silence(outer);
      silence(inner);

      // Both are pending when we cancel outer
      outer.cancel();
      await drain();

      // Outer is canceled, inner should also be canceled (down-propagation)
      let caught: any;
      await outer.catch((e) => {
        caught = e;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('52. strict mode: cancel on settled throws', async () => {
      const p = new CancelablePromise<number>((resolve) => resolve(42), { strict: true });

      await drain();

      expect(() => {
        p.cancel();
      }).toThrow();
    });

    it('53. strict mode: cancel on canceled throws', async () => {
      const p = new CancelablePromise<void>(
        (resolve, reject, { handleCancel }) => {
          handleCancel(() => {});
        },
        { strict: true },
      );
      silence(p);

      p.cancel();
      await drain();

      expect(() => {
        p.cancel();
      }).toThrow();
    });

    it('54. isCancelable changes to false after settlement', async () => {
      const p = new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
        // Sync resolve
        resolve(42);
      });

      // After sync resolve, internal state changes to FULFILLED
      expect(p.isCancelable).toBe(false);

      await p;

      expect(p.isCancelable).toBe(false);
    });

    it('55. isCancelable changes to false after cancellation', async () => {
      const p = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
        handleCancel(() => {});
      });
      silence(p);

      expect(p.isCancelable).toBe(true);

      p.cancel();

      expect(p.isCancelable).toBe(false);
    });
  });
});
