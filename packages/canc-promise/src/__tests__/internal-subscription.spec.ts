import { CancelError } from '../cancel-error';
import { CancelablePromise } from '../cancelable-promise';

/**
 * Internal subscription primitives (`_subscribe` + the `_addChainRef` core).
 *
 * These back the combinator species-bypass: per-item reactions and bubble-count accounting without
 * constructing a derived CancelablePromise. This suite pins the guarantees the bypass relies
 * on:
 * - `_subscribe` delivers value/reason with A+ (async microtask) timing and does NOT hand back a
 * canc species (the whole point is skipping species construction).
 * - `_subscribe` marks the source's rejection handled (no unhandled rejection), same as the
 * per-item `.then()` it replaces.
 *
 * Deterministic: microtask draining / a bounded macrotask, no arbitrary sleeps.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

// Reach protected members for white-box testing (same convention as two-way-propagation.spec.ts).
interface Internal {
  _subscribe(onF?: ((v: any) => any) | null, onR?: ((r: any) => any) | null): void;
  _chain(child: any, bubbleOnComplete?: boolean): void;
  _chainsCount: number;
  _completedChainsCount: number;
}

function asInternal<T>(p: CancelablePromise<T>): Internal & CancelablePromise<T> {
  return p as unknown as Internal & CancelablePromise<T>;
}

describe('internal subscription primitives', () => {
  describe('_subscribe', () => {
    it('delivers the fulfilled value asynchronously (A+ timing)', async () => {
      const p = new CancelablePromise<string>((resolve) => resolve('v'));
      let delivered: string | undefined;
      let sync = true;

      asInternal(p)._subscribe((value) => {
        delivered = value;
      });
      // Reaction must NOT have run synchronously.
      sync = false;
      expect(delivered).toBeUndefined();

      await macrotask();
      expect(sync).toBe(false);
      expect(delivered).toBe('v');
    });

    it('delivers the rejection reason to onRejected', async () => {
      const err = new Error('boom');
      const p = new CancelablePromise<string>((_res, reject) => reject(err));
      let seen: any;

      asInternal(p)._subscribe(undefined, (reason) => {
        seen = reason;
      });

      await macrotask();
      expect(seen).toBe(err);
    });

    it('does NOT return a canc species (returns void / bypasses species)', () => {
      const p = new CancelablePromise<number>((resolve) => resolve(1));
      const ret = asInternal(p)._subscribe(() => {
        /**/
      });
      // Contract: internal subscription is a sink, not a derived promise.
      expect(ret).toBeUndefined();
    });

    it('marks the source rejection handled (no unhandled rejection)', async () => {
      const unhandled: any[] = [];
      const onUnhandled = (reason: any) => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        const err = new Error('suppressed');
        const p = new CancelablePromise<string>((_res, reject) => reject(err));
        // Attaching a rejection reaction via _subscribe must count as handled.
        asInternal(p)._subscribe(undefined, () => {
          /**/
        });

        await macrotask();
        expect(unhandled).not.toContain(err);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });

  describe('_addChainRef core parity with _chain', () => {
    it('_chain still bubbles up when all children complete (unchanged behavior)', async () => {
      const parent = new CancelablePromise<any>(() => {
        /**/
      });
      const child = parent.then(() => {
        /**/
      });
      child.catch(() => {
        /**/
      });

      // Sole child canceled -> parent bubbles up and cancels.
      child.cancel(new CancelError('c'));
      await macrotask();

      expect(child.isCanceled).toBe(true);
      expect(parent.isCanceled).toBe(true);
    });
  });
});
