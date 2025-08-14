import { sleep } from '@shared/util';
import { createMockApi } from '@shared/mock-api';
import { generateReport } from './report-vanilla';

async function main(): Promise<void> {
 const { rag: ragApi, api } = createMockApi({ latency: 50, jitter: 0, trace: console.log });

 // Scenario 1: happy path, scope exits normally.
 {
 console.log('vanilla: start report (happy path)');
 await using report = generateReport(ragApi, 'r1');
 try {
 const generated = await report;
 console.log('vanilla: report generated:', generated);
 } catch (error) {
 throw error;
 }
 // Symbol.asyncDispose called here. Hand-attached, aborting after settle is harmless.
 console.log('vanilla: scope exited, cleanup settled');
 }

 console.log('');

 // Scenario 2: error thrown, scope exits early.
 {
 console.log('vanilla: start report (error path)');
 try {
 await using report = generateReport(ragApi, 'r2');
 await report;
 throw new Error('Simulate user error');
 } catch (error) {
 // aborted here: scope exit called our hand-attached dispose, which aborted the controller.
 // the fetch/render steps had already resolved though: abort after completion changes nothing.
 if (error instanceof Error && error.message === 'Simulate user error') {
 console.log('vanilla: caught error, dispose ran (cleanup automatic, but hand-wired)');
 } else {
 throw error;
 }
 }
 }

 console.log('');

 // Scenario 3: early return (scope exited without await).
 {
 console.log('vanilla: start report (early return)');
 await using report = generateReport(ragApi, 'r3');
 // Simulate early return: leave the scope without awaiting the report.
 // aborted here: dispose runs, but the in-flight step keeps running until its own await settles.
 console.log('vanilla: early return, dispose calls abort, work already past the point of no return');
 }

 console.log('');

 // Scenario 4: scope-exit abort still lets the audit write finish, because it was never wired to
 // the controller. The same result as the shielded step in main-canc.ts, but it depends on
 // remembering to leave that one call unwired rather than an explicit option.
 {
 console.log('vanilla: start report (unwired audit write)');
 await using report = generateReport(ragApi, 'r4');
 // aborted here: fetch/render steps stop, the audit write keeps running underneath.
 console.log('vanilla: early return, audit write is unaffected by the report abort');
 }

 await sleep(70);
 const auditCalls = api.calls.filter((c) => c.args && (c.args as { query: string }).query === 'r4');
 console.log(`vanilla: r4 calls settled = ${auditCalls.filter((c) => c.status !== 'started').length}/${auditCalls.length}`);

 console.log('vanilla: done');
}

main();
