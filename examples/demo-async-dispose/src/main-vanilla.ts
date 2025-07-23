import { createMockApi } from '@shared/mock-api';
import { generateReport } from './report-vanilla';

async function main(): Promise<void> {
 const mockApi = createMockApi({ latency: 50, jitter: 0, trace: console.log });

 // Scenario 1: happy path, no early exit.
 {
 console.log('vanilla: start report (happy path)');
 try {
 const report = await generateReport(mockApi, 'r1');
 console.log('vanilla: report generated:', report);
 } catch (error) {
 throw error;
 }
 }

 console.log('');

 // Scenario 2: early exit (throw).
 {
 console.log('vanilla: start report (error path)');
 try {
 const report = await generateReport(mockApi, 'r2');
 throw new Error('Simulate user error after generation started');
 } catch (error) {
 if (error instanceof Error && error.message.includes('user error')) {
 console.log('vanilla: caught error — finally ran (manual cleanup)');
 } else {
 throw error;
 }
 }
 }

 console.log('');

 // Scenario 3: early return (abandon before settling).
 {
 console.log('vanilla: start report (early exit)');
 try {
 // Simulate early return: create promise but abandon it (controller.abort() still runs in finally).
 const promise = generateReport(mockApi, 'r3');
 // Exit scope immediately without awaiting.
 console.log('vanilla: early exit — finally ran (manual cleanup)');
 } catch (error) {
 throw error;
 }
 }
}

main();
