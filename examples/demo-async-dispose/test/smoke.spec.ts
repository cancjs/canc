import { createMockApi } from '@shared/mock-api';
import { sleep } from '@shared/util';

import { generateReport } from '../src/report-canc';

describe('demo-async-dispose smoke', () => {
  it('await using dispose cancels the report and stops the underlying mock call', async () => {
    const { rag: ragApi, api } = createMockApi({ latency: 30, jitter: 0 });

    let report: ReturnType<typeof generateReport>;
    {
      await using r = generateReport(ragApi, 'r1');
      report = r;
      // Exit the scope without awaiting. Dispose should cancel the fetch step in flight.
    }

    expect(report.isCanceled).toBe(true);

    await report.catch(() => {
      // Expected: dispose rejects the report with a CancelError.
    });

    const aborted = api.calls.filter((c) => c.status === 'aborted');
    expect(aborted.length).toBeGreaterThan(0);
  });

  it('await using waits for cleanup handlers to settle before continuing', async () => {
    const { rag: ragApi } = createMockApi({ seedMode: true });

    const events: string[] = [];

    {
      await using _report = generateReport(ragApi, 'r2');
      events.push('report created');
    }
    // Scope exit above triggered dispose, which awaited cancel() settlement before this line ran.
    events.push('after scope');

    expect(events).toEqual(['report created', 'after scope']);
  });

  it('a shielded audit write finishes even after the report is canceled on scope exit', async () => {
    const { rag: ragApi, api } = createMockApi({ latency: 20, jitter: 0 });

    let report: ReturnType<typeof generateReport>;
    {
      await using r = generateReport(ragApi, 'r3');
      report = r;
      // Scope exit cancels the report immediately, before the fetch step even settles.
    }

    await report.catch(() => {
      // Expected: canceled before it resolved.
    });

    // Give the shielded audit write time to run past the fetch step it survives.
    await sleep(60);

    const r3Calls = api.calls.filter((c) => (c.args as { query?: string })?.query === 'r3');
    const aborted = r3Calls.filter((c) => c.status === 'aborted');
    const completed = r3Calls.filter((c) => c.status === 'completed');
    expect(aborted.length).toBeGreaterThan(0);
    expect(completed.length).toBeGreaterThan(0);
  });
});
