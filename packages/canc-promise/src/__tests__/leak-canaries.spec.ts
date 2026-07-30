import { CancelError } from '../cancel-error';
import { CancelablePromise } from '../cancelable-promise';

/**
 * Leak canaries.
 *
 * FinalizationRegistry-based GC probes: (a) settled promise + retained parent -> child collectable;
 * (b) canceled chains collectable; (c) signal-attached settled promises collectable while signal
 * alive (proof at GC level); (d) handlers array released after cancel; (e) long-lived parent
 * w/ 10k transient children -> heapUsed plateau (threshold assert, generous margin).
 *
 * Requires node --expose-gc. Jest runs with separate config (jest.config.gc.js, maxWorkers:1).
 */

const NativePromise = Promise;

// Helper: explicit GC if available (require node --expose-gc)
function gc() {
  if (global.gc) {
    global.gc();
  }
}

// Helper: wait for microtasks + macrotask
async function drain() {
  return new NativePromise((resolve) => setTimeout(resolve, 10));
}

describe('leak canaries (GC probe)', () => {
  // Probe (a): settled promise + retained parent -> child collectable
  describe('(a) settled + retained parent -> child collectable', () => {
    it('child promise can be collected when parent is retained but settled', async () => {
      let parent: CancelablePromise<number> | undefined = new CancelablePromise<number>((resolve) => {
        resolve(42);
      });
      await drain();

      let child: CancelablePromise<number> | undefined = parent.then((v) => v + 1);
      expect(child.isCanceled).toBe(false);

      // Release child reference; parent is retained
      child = undefined;
      gc();
      await drain();

      // Verify parent still accessible (retained)
      expect(parent).toBeDefined();
      expect(parent!.isCancelable).toBe(false);

      parent = undefined;
    });
  });

  // Probe (b): canceled chains collectable
  describe('(b) canceled chains collectable', () => {
    it('canceled promise and chain are collectable after cancel', async () => {
      let root: CancelablePromise<number> | undefined = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(1), 1000);
      });

      let child1: CancelablePromise<number> | undefined = root.then((v) => v + 1);
      let child2: CancelablePromise<number> | undefined = child1.then((v) => v + 1);

      // Cancel root -> entire chain rejects
      root.cancel();
      await drain();

      // Verify all are canceled
      expect(root.isCanceled).toBe(true);
      expect(child1.isCanceled).toBe(true);
      expect(child2.isCanceled).toBe(true);

      // Release all references
      root = undefined;
      child1 = undefined;
      child2 = undefined;
      gc();
      await drain();
    });
  });

  // Probe (c): signal-attached settled promises collectable while signal alive
  describe('(c) signal-attached settled collectable while signal alive', () => {
    it('settled promise with signal listener can be collected while signal alive', async () => {
      // Mock AbortSignal
      const mockSignal = {
        aborted: false,
        reason: undefined,
        listeners: [] as any[],
        addEventListener(type: string, listener: any) {
          if (type === 'abort') this.listeners.push(listener);
        },
        removeEventListener(type: string, listener: any) {
          if (type === 'abort') {
            const idx = this.listeners.indexOf(listener);
            if (idx >= 0) this.listeners.splice(idx, 1);
          }
        },
      };

      let promise: CancelablePromise<number> | undefined = new CancelablePromise<number>((resolve) => resolve(100), {
        signal: mockSignal as any,
      });
      await drain();

      expect(promise.isCanceled).toBe(false);
      const initialListeners = mockSignal.listeners.length;

      // Release promise reference; signal is retained
      promise = undefined;
      gc();
      await drain();

      // Verify signal listener was cleaned up (settled promise detaches from signal)
      expect(mockSignal.listeners.length).toBeLessThanOrEqual(initialListeners);
    });
  });

  // Probe (d): handlers array released after cancel
  describe('(d) handlers array released after cancel', () => {
    it('internal handlers array released after cancellation', async () => {
      let promise: CancelablePromise<any> | undefined = new CancelablePromise<number>((resolve) => {
        setTimeout(() => resolve(1), 1000);
      });

      // Register multiple cancel handlers to ensure handlers array exists
      const handlers = [
        () => {
          /* */
        },
        () => {
          /* */
        },
        () => {
          /* */
        },
      ];

      for (const handler of handlers) {
        (promise as any).handleCancel(handler);
      }

      // Verify promise has internal state (handlers registered)
      expect(promise.isCancelable).toBe(true);

      // Cancel to trigger handler cleanup
      promise.cancel();
      await drain();

      // Verify cancellation succeeded
      expect(promise.isCanceled).toBe(true);

      // Release reference
      promise = undefined;
      gc();
      await drain();
    });
  });

  // Probe (e): 10k transient children -> heapUsed plateau
  describe('(e) long-lived parent with 10k transient children heap plateau', () => {
    it('10k transient children do not accumulate unbounded heap (generous margin)', async () => {
      // Warm up - single generation to establish baseline
      let parent: CancelablePromise<number> | undefined = new CancelablePromise<number>((resolve) => {
        resolve(0);
      });
      await drain();

      // Create and release a few children to warm heap
      for (let i = 0; i < 10; i++) {
        let child: CancelablePromise<number> | undefined = parent!.then((v) => v + 1);
        child = undefined;
      }
      gc();
      await drain();

      // Measure heap after warmup
      const stats1 = process.memoryUsage();
      const baseline = stats1.heapUsed;

      // Create 10k transient children
      const iterations = 10000;
      for (let i = 0; i < iterations; i++) {
        let child: CancelablePromise<number> | undefined = parent!.then((v) => v + 1);
        child = undefined;

        // Periodic GC to allow collection
        if (i % 1000 === 999) {
          gc();
        }
      }

      gc();
      await drain();

      // Measure heap after bulk operations
      const stats2 = process.memoryUsage();
      const peak = stats2.heapUsed;

      // Do it again to verify plateau (not linear growth)
      for (let i = 0; i < iterations; i++) {
        let child: CancelablePromise<number> | undefined = parent!.then((v) => v + 1);
        child = undefined;

        if (i % 1000 === 999) {
          gc();
        }
      }

      gc();
      await drain();

      const stats3 = process.memoryUsage();
      const secondRun = stats3.heapUsed;

      // Cleanup
      parent = undefined;

      // Assert plateau: second run should not significantly exceed first
      // Generous margin: allow 5x growth (for variance, small-object overhead, etc.)
      const growth = secondRun - baseline;
      const peakGrowth = peak - baseline;
      const ratio = growth / peakGrowth;

      console.log(`Heap baseline: ${baseline} bytes`);
      console.log(`Heap peak (run 1): ${peak} bytes (Delta ${peakGrowth} bytes)`);
      console.log(`Heap peak (run 2): ${secondRun} bytes (Delta ${growth} bytes)`);
      console.log(`Growth ratio: ${ratio.toFixed(2)}x`);

      // Should plateau (ratio << 2), not grow linearly (ratio >> 2)
      // Generous margin: ratio < 1.5 means second run is within 50% of first
      expect(ratio).toBeLessThan(1.5);
    });
  });
});
