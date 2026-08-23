import { createMockApi } from '@shared/mock-api';
import { sleep } from '@shared/util';

import { answerWithCache } from './cache-race-vanilla';
import { ragPipeline } from './pipeline-vanilla';

const QUERY = 'how does cancel propagate';

async function main(): Promise<void> {
  // scenario 1: full run to completion
  const full = createMockApi({ latency: 30, jitter: 0, trace: console.log });
  const { rag: fullRag, chat: fullChat } = full;
  console.log('vanilla: full run');
  const answer = await ragPipeline(fullRag, fullChat, QUERY);
  console.log(`vanilla: answer = "${answer.text}"`);
  console.log(`vanilla: calls = ${full.api.calls.length}\n`);

  // scenario 2: cancel during rerank is ignored and pipeline bills every step
  const mid = createMockApi({ latency: 30, jitter: 0, trace: console.log });
  const { rag: midRag, chat: midChat } = mid;
  console.log('vanilla: cancel during rerank (no real cancel)');
  const pending = ragPipeline(midRag, midChat, QUERY);
  // embed (~5) + parallel retrieve (30) settle by ~40ms; rerank (40) is in flight after that
  setTimeout(() => console.log('vanilla: caller left, but pipeline keeps going'), 55);
  await pending;
  console.log(`vanilla: calls = ${mid.api.calls.length} (nothing was skipped)\n`);

  // scenario 3: cache wins race but losing pipeline keeps running in background
  const race = createMockApi({ latency: 30, jitter: 0, trace: console.log });
  const { rag: raceRag, chat: raceChat } = race;
  console.log('vanilla: cache wins race');
  const winner = await answerWithCache(raceRag, raceChat, QUERY);
  console.log(`vanilla: winner = "${winner.text}"`);
  await sleep(300);
  console.log(`vanilla: calls = ${race.api.calls.length} (pipeline ran even though cache won)`);
}

main();
