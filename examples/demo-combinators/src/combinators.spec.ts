import * as canc from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { createMockApi, type MockApiBundle } from '@shared/mock-api';

declare global {
  interface PromiseConstructor {
    any(values: Iterable<any>): Promise<any>;
  }
}

function createWidgets(mockBundle: MockApiBundle) {
  return {
    canc: {
      loadOrders: cancelify(({ getSignal }, _id?: string) => mockBundle.orders.list(getSignal())),
      checkInventory: cancelify(({ getSignal }, id: string) => mockBundle.inventory.check(id, getSignal())),
      quotePrice: cancelify(({ getSignal }, id: string) => mockBundle.prices.quote(id, getSignal())),
      getDeployStatus: cancelify(({ getSignal }, id: string) => mockBundle.deployments.getStatus(id, getSignal())),
    },
    vanilla: {
      loadOrders: (_id?: string) => mockBundle.orders.list(),
      checkInventory: (id: string) => mockBundle.inventory.check(id),
      quotePrice: (id: string) => mockBundle.prices.quote(id),
      getDeployStatus: (id: string) => mockBundle.deployments.getStatus(id),
    },
  };
}

describe('combinators', () => {
  describe('canc combinators (loser cancellation)', () => {
    it('all: one widget rejects, the other three show aborted markers', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { canc: widgets } = createWidgets(mockBundle);

      try {
        await canc.async(function* () {
          yield* canc.await.all([
            widgets.checkInventory('non-existent'), // fails first
            widgets.loadOrders('user-1'),
            widgets.checkInventory('product-1'),
            widgets.quotePrice('AAPL'),
          ]);
        })();
        throw new Error('should have rejected');
      } catch (err) {
        expect(isCancelError(err)).toBe(false);
      }

      const failedCount = mockBundle.api.calls.filter((c) => c.status === 'failed').length;
      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;
      const completedCount = mockBundle.api.calls.filter((c) => c.status === 'completed').length;

      expect(failedCount).toBe(1);
      expect(abortedCount).toBe(3);
      expect(completedCount).toBe(0);
    });

    it('any: the winner shows completed, the three losers aborted', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { canc: widgets } = createWidgets(mockBundle);

      const winner = await canc.async(function* () {
        return yield* canc.await.any([
          widgets.loadOrders('user-1'), // winner
          widgets.checkInventory('product-1'),
          widgets.quotePrice('AAPL'),
          widgets.getDeployStatus('deploy-1'),
        ]);
      })();

      expect(winner).toBeDefined();

      const completedCount = mockBundle.api.calls.filter((c) => c.status === 'completed').length;
      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;

      expect(completedCount).toBe(1);
      expect(abortedCount).toBe(3);
    });

    it('race: exactly one settled, three aborted', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { canc: widgets } = createWidgets(mockBundle);

      const winner = await canc.async(function* () {
        return yield* canc.await.race([
          widgets.getDeployStatus('deploy-1'), // winner
          widgets.loadOrders('user-1'),
          widgets.checkInventory('product-1'),
          widgets.quotePrice('AAPL'),
        ]);
      })();

      expect(winner).toBe('deployed');

      const settledCount = mockBundle.api.calls.filter((c) => c.status === 'completed' || c.status === 'failed').length;
      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;

      expect(settledCount).toBe(1);
      expect(abortedCount).toBe(3);
    });

    it('allSettled: zero aborted markers, all four settle', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { canc: widgets } = createWidgets(mockBundle);

      const settled = await canc.async(function* () {
        return yield* canc.await.allSettled([
          widgets.loadOrders('user-1'),
          widgets.checkInventory('product-1'),
          widgets.checkInventory('non-existent'), // rejects
          widgets.quotePrice('AAPL'),
        ]);
      })();

      expect(settled).toHaveLength(4);

      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;
      const settledCount = mockBundle.api.calls.filter((c) => c.status === 'completed' || c.status === 'failed').length;

      expect(abortedCount).toBe(0);
      expect(settledCount).toBe(4);
    });

    it('isolation: the bubble:false widget has no aborted marker while its siblings do', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { canc: widgets } = createWidgets(mockBundle);

      const isolatedPrice = widgets.quotePrice('AAPL');
      isolatedPrice.bubble = false;

      try {
        await canc.async(function* () {
          yield* canc.await.all([
            widgets.checkInventory('non-existent'), // fails first
            widgets.loadOrders('user-1'),
            widgets.checkInventory('product-1'),
            isolatedPrice, // bubble:false (isolated from sibling rejection)
          ]);
        })();
        throw new Error('should have rejected');
      } catch {
        // rejected as expected
      }

      const isolatedCall = mockBundle.api.calls.find((c) => c.endpoint === 'prices.quote');
      expect(isolatedCall?.status).not.toBe('aborted');

      await isolatedPrice;
      expect(isolatedCall?.status).toBe('completed');

      const abortedSiblings = mockBundle.api.calls.filter(
        (c) => c.endpoint !== 'prices.quote' && c.status === 'aborted',
      );
      expect(abortedSiblings).toHaveLength(2);
    });
  });

  describe('vanilla combinators (wasted work)', () => {
    it('all: rejection leaves remaining widgets running', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { vanilla: widgets } = createWidgets(mockBundle);

      const p1 = widgets.checkInventory('non-existent');
      const p2 = widgets.loadOrders('user-1');
      const p3 = widgets.checkInventory('product-1');
      const p4 = widgets.quotePrice('AAPL');

      try {
        await Promise.all([p1, p2, p3, p4]);
      } catch {
        // One rejected
      }

      await Promise.allSettled([p2, p3, p4]);

      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;
      const completedCount = mockBundle.api.calls.filter((c) => c.status === 'completed').length;
      const failedCount = mockBundle.api.calls.filter((c) => c.status === 'failed').length;

      expect(abortedCount).toBe(0);
      expect(completedCount).toBe(3);
      expect(failedCount).toBe(1);
    });

    it('any: fulfillment leaves losers running', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { vanilla: widgets } = createWidgets(mockBundle);

      const p1 = widgets.loadOrders('user-1');
      const p2 = widgets.checkInventory('product-1');
      const p3 = widgets.quotePrice('AAPL');
      const p4 = widgets.getDeployStatus('deploy-1');

      const winner = await Promise.any([p1, p2, p3, p4]);
      expect(winner).toBeDefined();

      await Promise.allSettled([p1, p2, p3, p4]);

      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;
      const completedCount = mockBundle.api.calls.filter((c) => c.status === 'completed').length;

      expect(abortedCount).toBe(0);
      expect(completedCount).toBe(4);
    });

    it('race: settlement leaves losers running', async () => {
      const mockBundle = createMockApi({ latency: 40, jitter: 0 });
      const { vanilla: widgets } = createWidgets(mockBundle);

      const p1 = widgets.getDeployStatus('deploy-1');
      const p2 = widgets.loadOrders('user-1');
      const p3 = widgets.checkInventory('product-1');
      const p4 = widgets.quotePrice('AAPL');

      const winner = await Promise.race([p1, p2, p3, p4]);
      expect(winner).toBe('deployed');

      await Promise.allSettled([p1, p2, p3, p4]);

      const abortedCount = mockBundle.api.calls.filter((c) => c.status === 'aborted').length;
      const completedCount = mockBundle.api.calls.filter((c) => c.status === 'completed').length;

      expect(abortedCount).toBe(0);
      expect(completedCount).toBe(4);
    });
  });
});
