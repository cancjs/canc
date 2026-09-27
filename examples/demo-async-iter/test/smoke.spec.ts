import { isCancelError } from '@cancjs/promise';

import { waitForStreamClosed } from '../src/mock/transactions';
import { filterAndFormat, topPositiveIds } from '../src/reconciliation-canc';
import { filterAndFormat as filterAndFormatVanilla } from '../src/reconciliation-vanilla';

describe('demo-async-iter', () => {
  it('filterAndFormat returns correct results when completed', async () => {
    const logs: string[] = [];

    const result = await filterAndFormat((msg) => logs.push(msg));

    expect(result).toEqual(['tx-1: $100', 'tx-3: $200', 'tx-5: $500']);
    expect(logs).toContain('stream closed');
    expect(logs.filter((l) => l.startsWith('pulling'))).toHaveLength(6);
  });

  it('cancel mid-pipeline stops pulling and closes the source', async () => {
    const logs: string[] = [];
    const closedPromise = waitForStreamClosed();

    const pipeline = filterAndFormat((msg) => {
      logs.push(msg);
      // Cancel after the second item is pulled (deterministic, no sleep)
      if (logs.filter((l) => l.startsWith('pulling')).length >= 2) {
        pipeline.cancel();
      }
    });

    try {
      await pipeline;
      throw new Error('should have thrown CancelError');
    } catch (err) {
      expect(isCancelError(err)).toBe(true);
    }

    // Core assertion: cancel stopped the pipeline before pulling all 6 items.
    const pulled = logs.filter((l) => l.startsWith('pulling'));
    expect(pulled.length).toBeLessThan(6);

    // source generator finally block fires once return() propagates
    await closedPromise;
    expect(logs).toContain('stream closed');
  });

  it('topPositiveIds takes only the first 2 positive', async () => {
    const result = await topPositiveIds();
    expect(result).toEqual(['tx-1', 'tx-3']);
  });

  it('vanilla filterAndFormat returns same data (no cancellation)', async () => {
    const result = await filterAndFormatVanilla();
    expect(result).toEqual(['tx-1: $100', 'tx-3: $200', 'tx-5: $500']);
  });
});
