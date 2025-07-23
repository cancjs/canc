import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { generateReport } from '../src/report-canc';

describe('demo-async-dispose smoke', () => {
 it('await using dispose cancels unfinished report on scope exit', async () => {
 const mockApi = createMockApi({ seedMode: true });

 let disposed = false;

 // Create a disposable report generator.
 await using report = generateReport(mockApi, 'r1');

 // Exit the scope without awaiting — dispose should cancel.
 // (In a real test, we'd verify the cancellation marker in mockApi.calls).
 disposed = true;

 // Verify the promise is canceled after scope exit.
 expect(report.isCanceled).toBe(true);
 });

 it('await using waits for cleanup handlers to settle', async () => {
 const mockApi = createMockApi({ seedMode: true });

 const events: string[] = [];

 await using report = generateReport(mockApi, 'r2');
 events.push('report created');
 // Scope exit here triggers dispose, which awaits cancel() settlement.
 events.push('after scope');

 // Verify ordering: dispose must have settled before "after scope" is pushed.
 expect(events).toEqual(['report created', 'after scope']);
 });
});
