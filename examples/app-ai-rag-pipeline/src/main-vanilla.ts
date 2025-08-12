import { sleep } from '@shared/util';
import { createMockApi } from '@shared/mock-api';
import { ragPipeline } from './pipeline-vanilla';
import { answerWithCache } from './cache-race-vanilla';

const QUERY = 'how does cancel propagate';

async function main(): Promise<void> {
 // Scenario 1: full run to completion.
 const full = createMockApi({ latency: 30, jitter: 0, trace: console.log });
 console.log('vanilla: full run');
 const answer = await ragPipeline(full, QUERY);
 console.log(`vanilla: answer = "${answer.text}"`);
 console.log(`vanilla: calls = ${full.api.calls.length}\n`);

 // Scenario 2: "cancel" during rerank. There is no cancel, so the pipeline runs to the end anyway
 // and the caller just throws away the result. Every step still ran and billed.
 const mid = createMockApi({ latency: 30, jitter: 0, trace: console.log });
 console.log('vanilla: cancel during rerank (no real cancel)');
 const pending = ragPipeline(mid, QUERY);
 // embed (~5) + parallel retrieve (30) settle by ~40ms; rerank (40) is in flight after that.
 setTimeout(() => console.log('vanilla: caller left, but pipeline keeps going'), 55);
 await pending;
 console.log(`vanilla: calls = ${mid.api.calls.length} (nothing was skipped)\n`);

 // Scenario 3: cache wins the race. The cached answer comes back fast, but the pipeline loser keeps
 // running to completion in the background.
 const race = createMockApi({ latency: 30, jitter: 0, trace: console.log });
 console.log('vanilla: cache wins race');
 const winner = await answerWithCache(race, QUERY);
 console.log(`vanilla: winner = "${winner.text}"`);
 await sleep(300);
 console.log(`vanilla: calls = ${race.api.calls.length} (pipeline ran even though cache won)`);
}

main();
