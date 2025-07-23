import { createMockApi } from '@shared/mock-api';
import { generateReport } from './report-canc';

async function main(): Promise<void> {
 const mockApi = createMockApi({ latency: 50, jitter: 0, trace: console.log });

 // Scenario 1: happy path, scope exits normally.
 {
 console.log('canc: start report (happy path)');
 await using report = generateReport(mockApi, 'r1');
 try {
 const generated = await report;
 console.log('canc: report generated:', generated);
 } catch (error) {
 throw error;
 }
 // [Symbol.asyncDispose] called here — awaits cancel() settlement before continuing.
 console.log('canc: scope exited, cleanup settled');
 }

 console.log('');

 // Scenario 2: error thrown, scope exits early.
 {
 console.log('canc: start report (error path)');
 try {
 await using report = generateReport(mockApi, 'r2');
 await report;
 throw new Error('Simulate user error');
 } catch (error) {
 // canceled here — scope exit called dispose, which canceled the promise.
 if (error instanceof Error && error.message === 'Simulate user error') {
 console.log('canc: caught error — dispose ran (cleanup automatic)');
 } else {
 throw error;
 }
 }
 }

 console.log('');

 // Scenario 3: early return (scope exited without await).
 {
 console.log('canc: start report (early return)');
 await using report = generateReport(mockApi, 'r3');
 // Simulate early return: leave the scope without awaiting the report.
 // canceled here — dispose runs, canceling the unfinished report.
 console.log('canc: early return — dispose cancels unfinished work');
 }

 console.log('canc: done');
}

main();
