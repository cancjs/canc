import { isCancelError } from '@cancjs/promise';
import { sleep } from '@shared/util';
import { createMockApi } from '@shared/mock-api';
import { ragPipeline } from './pipeline-canc';
import { answerWithCache } from './cache-race-canc';

const QUERY = 'how does cancel propagate';

async function main(): Promise<void> {
 // Scenario 1: full run to completion.
 const full = createMockApi({ latency: 30, jitter: 0, trace: console.log });
 console.log('canc: full run');
 const answer = await ragPipeline(full, QUERY);
 console.log(`canc: answer = "${answer.text}"`);
 console.log(`canc: calls = ${full.api.calls.length}\n`);

 // Scenario 2: cancel during rerank. One cancel() aborts the in-flight step and generate never runs.
 const mid = createMockApi({ latency: 30, jitter: 0, trace: console.log });
 console.log('canc: cancel during rerank');
 const pending = ragPipeline(mid, QUERY);
 // embed (~5) + parallel retrieve (30) settle by ~40ms; rerank (40) is in flight after that.
 setTimeout(() => pending.cancel(), 55);
 try {
 await pending;
 } catch (error) {
 if (!isCancelError(error)) throw error;
 console.log('canc: caught CancelError — generate was never called');
 }
 const aborted = mid.api.calls.filter((c) => c.status === 'aborted').length;
 console.log(`canc: calls = ${mid.api.calls.length}, aborted = ${aborted} (downstream skipped)\n`);

 // Scenario 3: cache wins the race, and race() cancels the pipeline loser mid-retrieve.
 const race = createMockApi({ latency: 30, jitter: 0, trace: console.log });
 console.log('canc: cache wins race');
 const winner = await answerWithCache(race, QUERY);
 console.log(`canc: winner = "${winner.text}"`);
 await sleep(300);
 const raceAborted = race.api.calls.filter((c) => c.status === 'aborted').length;
 console.log(`canc: calls = ${race.api.calls.length}, aborted = ${raceAborted} (pipeline canceled, no wasted work)`);
}

main();
