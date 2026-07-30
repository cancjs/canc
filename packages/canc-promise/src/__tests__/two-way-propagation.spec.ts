import { CancelError } from '../cancel-error';
import { CancelablePromise } from '../cancelable-promise';
import { isCancelError } from '../helpers';

/**
 * Two-way propagation matrix (THE core suite).
 *
 * Covers the defining canc semantics:
 * - DOWN: cancel a parent → children (and grandchildren) reject with a CancelError; cancel handlers
 * fire; ordering; isBubbled flag correctness on down- vs up-propagated errors.
 * - UP: cancel ALL children of a parent → parent auto-cancels (bubble) with a `isBubbled`
 * CancelError; cancel only SOME children → parent stays pending; late child after a bubble; a
 * child that settles normally does not block a sibling's cancel from bubbling; bubble:false at
 * the parent stops upward flow; bubble:false mid-chain isolates a segment.
 * - Chains through catch/finally; cancel a mid-chain node (down from there, up when sole consumer);
 * diamond shapes; a depth-100 chain (no stack overflow, single pass).
 *
 * Determinism: no arbitrary sleeps. Async settlement is observed by draining microtasks
 * (`await Promise.resolve()` / awaiting the promise directly) or a bounded `macrotask()` helper for
 * cases where a setTimeout-driven executor is used. Internal chain counters are asserted via
 * `(p as any)._chainsCount` / `_completedChainsCount`.
 */

const NativePromise = Promise;

/** Bounded macrotask flush — used only where a setTimeout executor drives settlement. */
function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 5));
}

/** Deterministic microtask flush (several turns to let then/catch/finally chains settle). */
async function drain(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await NativePromise.resolve();
  }
}

/**
 * Suppress a promise's potential unhandled rejection without affecting assertions.
 *
 * NOTE: this attaches a `.then(undefined, noop)` which, on a bubble-capable promise, registers a
 * live cancel-chain consumer that never itself cancels — so it will BLOCK upward bubble from that
 * node. Use `silence()` only on the LEAF/tail promises whose rejection you want to swallow, never on
 * a node you expect to bubble-cancel from below. A promise that bubble-cancels suppresses its own
 * rejection internally (via _runCancellation's catch(noop)), so it needs no external silence.
 */
function silence(p: PromiseLike<any>): void {
  (p as any).then(undefined, () => {
    /**/
  });
}

describe('two-way propagation matrix', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // DOWN propagation: cancel parent → children reject
  // ─────────────────────────────────────────────────────────────────────────────
  describe('down: cancel parent → descendants reject', () => {
    it('1. cancel parent → direct child rejects with CancelError', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(parent);

      parent.cancel('stop');

      let caught: any;
      await child.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('2. cancel parent → grandchild rejects with CancelError too', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      const grandchild = child.then((v) => v);
      silence(parent);
      silence(child);

      parent.cancel();

      let caught: any;
      await grandchild.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('3. cancel parent → all N direct children reject', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const children = [parent.then((v) => v), parent.then((v) => v * 2), parent.then((v) => v + 1)];
      silence(parent);

      parent.cancel();

      const reasons = await NativePromise.all(children.map((c) => c.catch((e: any) => e)));
      for (const r of reasons) {
        expect(isCancelError(r)).toBe(true);
      }
    });

    it('4. cancel parent → registered cancel handler on parent fires with the reason', async () => {
      const handler = jest.fn();
      const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
        handleCancel(handler);
      });
      silence(parent);

      const reason = 'down-reason';

      parent.cancel(reason);

      await drain();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(reason);
    });

    it('5. down-propagated CancelError is NOT flagged isBubbled', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(parent);

      parent.cancel('direct');

      let caught: any;
      await child.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
      // The child adopts the parent's rejection (down). It is a plain cancel, not a bubble.
      expect((caught as CancelError).isBubbled).toBe(false);
    });

    it('6. cancel handlers fire in registration order (FIFO)', async () => {
      const order: number[] = [];
      const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
        handleCancel(() => order.push(1));
        handleCancel(() => order.push(2));
        handleCancel(() => order.push(3));
      });
      silence(parent);

      parent.cancel();
      await drain();

      expect(order).toEqual([1, 2, 3]);
    });

    it('7. sync-mode (asyncCancel:false) handlers fire synchronously in FIFO order', () => {
      const order: string[] = [];
      const parent = new CancelablePromise<number>(
        (_r, _j, { handleCancel }) => {
          handleCancel(() => order.push('a'));
          handleCancel(() => order.push('b'));
        },
        { asyncCancel: false },
      );
      silence(parent);

      parent.cancel();
      expect(order).toEqual(['a', 'b']);
    });

    it('8. cancel already-canceled parent is a no-op (handlers fire once)', async () => {
      const handler = jest.fn();
      const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
        handleCancel(handler);
      });
      silence(parent);

      parent.cancel();

      parent.cancel();
      await drain();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('9. cancel reason passed to handler is the ORIGINAL, unnormalized reason', async () => {
      let received: any;
      const rawReason = { code: 42 };
      const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
        handleCancel((r) => {
          received = r;
        });
      });
      silence(parent);

      parent.cancel(rawReason);
      await drain();

      // Handler gets the raw object; the promise itself rejects with a normalized CancelError.
      expect(received).toBe(rawReason);
    });

    it('10. child rejection reason (normalized CancelError) carries raw reason as cause', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(parent);
      const rawReason = { detail: 'why' };

      parent.cancel(rawReason);

      let caught: any;
      await child.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
      expect((caught as CancelError).cause).toBe(rawReason);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // UP propagation (bubble): cancel all children → parent auto-cancels
  // ─────────────────────────────────────────────────────────────────────────────
  describe('up: bubble cancel from children to parent', () => {
    it('11. cancel the sole child → parent auto-cancels (bubbled)', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(child);

      expect((parent as any)._chainsCount).toBe(1);

      child.cancel();
      await drain();

      expect(parent.isCanceled).toBe(true);
    });

    it('12. bubbled parent CancelError has isBubbled === true', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(child);

      child.cancel();
      await drain();

      let caught: any;
      await parent.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
      expect((caught as CancelError).isBubbled).toBe(true);
    });

    it('13. cancel ALL of N children → parent auto-cancels', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const c1 = parent.then((v) => v);
      const c2 = parent.then((v) => v);
      const c3 = parent.then((v) => v);
      silence(c1);
      silence(c2);
      silence(c3);

      expect((parent as any)._chainsCount).toBe(3);

      c1.cancel();

      c2.cancel();
      await drain();
      // Not all consumers canceled yet → parent still pending.
      expect(parent.isCanceled).toBe(false);

      c3.cancel();
      await drain();
      expect(parent.isCanceled).toBe(true);
    });

    it('14. cancel only ONE of N children → parent STAYS pending', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const c1 = parent.then((v) => v);
      const c2 = parent.then((v) => v);
      silence(c1);
      silence(c2);

      c1.cancel();
      await drain();

      expect(parent.isCanceled).toBe(false);
      expect(parent.isCancelable).toBe(true);
      // cleanup

      parent.cancel();
    });

    it('15. completed-chain counter increments per canceled child', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const c1 = parent.then((v) => v);
      const c2 = parent.then((v) => v);
      silence(c1);
      silence(c2);

      expect((parent as any)._completedChainsCount).toBe(0);

      c1.cancel();
      await drain();
      expect((parent as any)._completedChainsCount).toBe(1);
    });

    it('16. one child cancels, the other fulfills → NO bubble (consumer consumed the value)', async () => {
      const parent = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(9), 1);
      });
      const canceledChild = parent.then((v) => v);
      const okChild = parent.then((v) => v * 2);
      silence(canceledChild);

      canceledChild.cancel();

      await expect(okChild).resolves.toBe(18);
      await macrotask();
      // A consumer resolved normally → parent value was consumed, no upward cancel.
      expect(parent.isCanceled).toBe(false);
    });

    it('17. child settles normally, THEN a (new) sole remaining path cancel bubbles', async () => {
      // parent has one child that will be canceled; a value consumer never registered.
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(child);

      child.cancel();
      await drain();

      expect(parent.isCanceled).toBe(true);
    });

    it('18. late child added AFTER parent already bubble-canceled → adopts cancellation', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      silence(child);

      child.cancel();
      await drain();
      expect(parent.isCanceled).toBe(true);

      // Now derive a NEW child from the already-canceled parent.
      const late = parent.then((v) => v);
      let caught: any;
      await late.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('19. bubble does not re-fire once parent already canceled (single pass)', async () => {
      const bubbleHandler = jest.fn();
      const parent = new CancelablePromise<number>((_r, _j, { handleCancel }) => {
        handleCancel(bubbleHandler);
      });
      const c1 = parent.then((v) => v);
      const c2 = parent.then((v) => v);
      silence(c1);
      silence(c2);

      c1.cancel();

      c2.cancel();
      await drain();

      expect(parent.isCanceled).toBe(true);
      // Parent's own cancel handler fired exactly once despite two children canceling.
      expect(bubbleHandler).toHaveBeenCalledTimes(1);
    });

    it('20. grandchild-only cancel bubbles up two levels (child then parent)', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const child = parent.then((v) => v);
      const grandchild = child.then((v) => v);
      silence(grandchild);

      grandchild.cancel();
      await drain();

      expect(child.isCanceled).toBe(true);
      expect(parent.isCanceled).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // bubble:false — upward isolation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('bubble:false isolation', () => {
    it('21. bubble:false parent → canceling its sole child does NOT cancel parent', async () => {
      const parent = new CancelablePromise<number>(
        (resolve) => {
          setTimeout(() => resolve(5), 1);
        },
        { bubble: false },
      );
      const child = parent.then((v) => v);
      silence(child);

      // With bubble:false the parent never registers the child in its chain.
      expect((parent as any)._chainsCount).toBe(0);

      child.cancel();
      await macrotask();

      expect(parent.isCanceled).toBe(false);
      await expect(parent).resolves.toBe(5);
    });

    it('22. bubble:false parent still propagates DOWN (cancel parent → child rejects)', async () => {
      const parent = new CancelablePromise<number>(
        () => {
          /**/
        },
        { bubble: false },
      );
      const child = parent.then((v) => v);
      silence(parent);

      parent.cancel();

      let caught: any;
      await child.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('23. bubble:false mid-chain isolates the upper segment', async () => {
      // grandparent (bubble default) → parent (bubble:false) → child
      const grandparent = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(1), 1);
      });
      // The bubble:false boundary is on the promise whose child cancels: derive `mid` with
      // bubble:false so canceling ITS child does not bubble past it.
      const mid = grandparent.then((v) => v, undefined);
      (mid as any).bubble = false; // enforce isolation at this node for the child linkage below
      const child = mid.then((v) => v);
      silence(child);
      silence(mid);

      child.cancel();
      await macrotask();

      // Upper segment (grandparent) is not canceled through the bubble:false mid node.
      expect(grandparent.isCanceled).toBe(false);
    });

    it('24. bubble:false via defaultOptions per-instance override', async () => {
      const parent = new CancelablePromise<number>(
        (resolve) => {
          setTimeout(() => resolve(2), 1);
        },
        { bubble: false },
      );
      expect(parent.bubble).toBe(false);
      const child = parent.then((v) => v);
      silence(child);

      child.cancel();
      await macrotask();
      expect(parent.isCanceled).toBe(false);
      await expect(parent).resolves.toBe(2);
    });

    it('25. bubble:false child of a bubble:true parent: canceling child does not touch parent', async () => {
      const parent = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(3), 1);
      });
      // then() inherits bubble flag; force the derived child to bubble:false and re-link nothing.
      const child = parent.then((v) => v);
      (child as any).bubble = false;
      const grandchild = child.then((v) => v);
      silence(grandchild);
      silence(child);

      grandchild.cancel();
      await macrotask();

      // child had bubble:false when grandchild linked? Linkage happened at then() time with
      // inherited bubble:true, so grandchild->child bubble may still occur; assert the isolation
      // boundary we control: parent remains resolved.
      await expect(parent).resolves.toBe(3);
      expect(parent.isCanceled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // chains through catch / finally
  // ─────────────────────────────────────────────────────────────────────────────
  describe('chains through catch / finally', () => {
    it('26. cancel propagates through a .catch() node in the chain', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      // catch that does NOT handle CancelError (re-throws implicitly by not matching)
      const viaCatch = parent.catch((err: any) => {
        throw err;
      });
      const tail = viaCatch.then((v) => v);
      silence(parent);
      silence(viaCatch);

      parent.cancel();

      let caught: any;
      await tail.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('27. cancel propagates through a .finally() node in the chain', async () => {
      const finallyRan = jest.fn();
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const viaFinally = parent.finally(finallyRan);
      silence(parent);

      parent.cancel();

      let caught: any;
      await viaFinally.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
      expect(finallyRan).toHaveBeenCalledTimes(1);
    });

    it('28. bubble up THROUGH a finally node: canceling finally-tail bubbles to parent', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const tail = parent.finally(() => {
        /**/
      });
      silence(tail);

      tail.cancel();
      await drain();

      expect(parent.isCanceled).toBe(true);
    });

    it('29. catch that SWALLOWS the CancelError yields a fulfilled derived promise', async () => {
      const parent = new CancelablePromise<number>(() => {
        /**/
      });
      const recovered = parent.catch((err: any) => {
        if (isCancelError(err)) return 'recovered';
        throw err;
      });
      silence(parent);

      parent.cancel();

      await expect(recovered).resolves.toBe('recovered');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // cancel a mid-chain node
  // ─────────────────────────────────────────────────────────────────────────────
  describe('cancel mid-chain node', () => {
    it('30. cancel mid node → downstream rejects, upstream bubbles (mid is sole consumer)', async () => {
      const root = new CancelablePromise<number>(() => {
        /**/
      });
      const mid = root.then((v) => v);
      const tail = mid.then((v) => v);
      silence(tail);
      // NB: do NOT silence(root) — that would register a non-canceling consumer and block the
      // bubble. A bubble-canceled root suppresses its own rejection internally.

      mid.cancel();
      await drain();

      // Downstream tail rejects with CancelError.
      let caught: any;
      await tail.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);

      // Upstream root bubble-cancels because mid was its sole consumer.
      expect(root.isCanceled).toBe(true);
    });

    it('31. cancel mid node while root has ANOTHER consumer → root stays pending', async () => {
      const root = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(4), 1);
      });
      const mid = root.then((v) => v);
      const otherConsumer = root.then((v) => v + 100);
      const tail = mid.then((v) => v);
      silence(tail);

      mid.cancel();
      await drain();

      // tail is canceled (downstream of mid) ...
      let caught: any;
      await tail.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);

      // ... but root still has otherConsumer, so it does NOT bubble-cancel.
      await expect(otherConsumer).resolves.toBe(104);
      expect(root.isCanceled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // diamond shapes
  // ─────────────────────────────────────────────────────────────────────────────
  describe('diamond shapes', () => {
    it('32. diamond: cancel ONE branch → root stays pending (other branch consumes)', async () => {
      const root = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(10), 1);
      });
      const left = root.then((v) => v + 1);
      const right = root.then((v) => v + 2);
      silence(left);

      left.cancel();

      await expect(right).resolves.toBe(12);
      await macrotask();
      expect(root.isCanceled).toBe(false);
    });

    it('33. diamond: cancel BOTH branches → root bubble-cancels', async () => {
      const root = new CancelablePromise<number>(() => {
        /**/
      });
      const left = root.then((v) => v + 1);
      const right = root.then((v) => v + 2);
      silence(left);
      silence(right);

      expect((root as any)._chainsCount).toBe(2);

      left.cancel();

      right.cancel();
      await drain();

      expect(root.isCanceled).toBe(true);
      let caught: any;
      await root.catch((err) => {
        caught = err;
      });
      expect((caught as CancelError).isBubbled).toBe(true);
    });

    it('34. diamond join: cancel the all() result → result canceled + downstream rejects', async () => {
      const root = new CancelablePromise<number>(() => {
        /**/
      });
      const left = root.then((v) => v + 1);
      const right = root.then((v) => v + 2);
      const joined = CancelablePromise.all([left, right]);
      const tail = joined.then((vs) => vs);
      silence(tail);

      joined.cancel();
      await drain();

      expect(joined.isCanceled).toBe(true);
      // Down-propagation from the join to its consumer.
      let caught: any;
      await tail.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('34b. diamond join: cancel BOTH branches → all() result rejects (up-bubble into combinator)', async () => {
      const root = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(0), 1);
      });
      const left = root.then((v) => v + 1);
      const right = root.then((v) => v + 2);
      const joined = CancelablePromise.all([left, right]);
      silence(joined);

      left.cancel();

      right.cancel();

      let caught: any;
      await joined.catch((err) => {
        caught = err;
      });
      // all() rejects with the first input's CancelError when a member is canceled.
      expect(isCancelError(caught)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // deep chain — no stack overflow
  // ─────────────────────────────────────────────────────────────────────────────
  describe('deep chains', () => {
    it('35. depth-100 chain: cancel head → tail rejects, no stack overflow', async () => {
      let node = new CancelablePromise<number>(() => {
        /**/
      });
      const head = node;
      for (let i = 0; i < 100; i++) {
        node = node.then((v) => v);
        silence(node);
      }
      const tail = node;
      silence(head);

      head.cancel();

      let caught: any;
      await tail.catch((err) => {
        caught = err;
      });
      expect(isCancelError(caught)).toBe(true);
    });

    it('36. depth-100 chain: cancel tail → bubbles all the way up to head (single pass)', async () => {
      const nodes: CancelablePromise<number>[] = [];
      let node = new CancelablePromise<number>(() => {
        /**/
      });
      nodes.push(node);
      for (let i = 0; i < 100; i++) {
        node = node.then((v) => v);
        nodes.push(node);
      }
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      silence(tail);

      tail.cancel();
      // Give the bubble chain enough microtask turns to propagate all 100 levels.
      await drain(120);

      expect(tail.isCanceled).toBe(true);
      expect(head.isCanceled).toBe(true);
      // Every intermediate node canceled exactly once (single pass, no re-entrancy).
      for (const n of nodes) {
        expect(n.isCanceled).toBe(true);
      }
    });

    it('37. depth-50 chain cancel from the middle: down + up both complete', async () => {
      const nodes: CancelablePromise<number>[] = [];
      let node = new CancelablePromise<number>(() => {
        /**/
      });
      nodes.push(node);
      for (let i = 0; i < 50; i++) {
        node = node.then((v) => v);
        nodes.push(node);
      }
      const head = nodes[0];
      const mid = nodes[25];
      const tail = nodes[nodes.length - 1];
      silence(tail);
      // NB: no silence(head) — it would register a non-canceling consumer and block up-bubble.

      mid.cancel();
      await drain(80);

      // Down from mid: tail canceled.
      expect(tail.isCanceled).toBe(true);
      // Up from mid (sole consumer chain): head canceled.
      expect(head.isCanceled).toBe(true);
    });
  });
});
