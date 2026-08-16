import { isCancelError } from '@cancjs/promise';
import type { CallRecord } from '@shared/mock-api';
import { createMockApi } from '@shared/mock-api';
import { sleep } from '@shared/util';

import { answerWithCache } from './cache-race-canc';
import { ragPipeline } from './pipeline-canc';

const QUERY = 'how does cancel propagate';

const SETTLE_CEILING_MS = 3000;

async function waitFor(predicate: () => boolean, timeoutMs = SETTLE_CEILING_MS): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

function chatCalls(calls: CallRecord[]): number {
  return calls.filter((c) => c.endpoint.startsWith('chat.token')).length;
}

function abortedCalls(calls: CallRecord[]): number {
  return calls.filter((c) => c.status === 'aborted').length;
}

describe('rag pipeline (canc)', () => {
  it('runs the full pipeline through to a generated answer', async () => {
    const mockApi = createMockApi({ latency: 5, jitter: 0 });
    const answer = await ragPipeline(mockApi.rag, mockApi.chat, QUERY);
    expect(answer.query).toBe(QUERY);
    expect(answer.text.length).toBeGreaterThan(0);
    expect(chatCalls(mockApi.api.calls)).toBeGreaterThan(0);
    expect(abortedCalls(mockApi.api.calls)).toBe(0);
  });

  it('cancel during rerank aborts the in-flight step and generate never runs', async () => {
    const mockApi = createMockApi({ latency: 20, jitter: 0 });
    const pending = ragPipeline(mockApi.rag, mockApi.chat, QUERY);
    // Wait until retrieval calls have completed so rerank is in flight.
    await waitFor(
      () => mockApi.api.calls.filter((c) => c.endpoint === 'rag.search' && c.status === 'completed').length === 2,
    );
    pending.cancel();

    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    expect(isCancelError(caught)).toBe(true);
    // generate was never reached.
    expect(chatCalls(mockApi.api.calls)).toBe(0);
    // the rerank step's own timer was aborted (retrieval calls already completed).
    expect(abortedCalls(mockApi.api.calls)).toBe(0);
    // exactly the three pre-rerank steps ran, nothing downstream.
    expect(mockApi.api.calls.map((c) => c.endpoint).sort()).toEqual(['rag.search', 'rag.search']);
  });

  it('cache winning the race cancels the pipeline mid-retrieve', async () => {
    const mockApi = createMockApi({ latency: 60, jitter: 0 });
    // cache resolves at ~20ms; embed (~5ms) is done, so the parallel retrieve (60ms) is in flight
    // when the race is lost, and those calls abort.
    const winner = await answerWithCache(mockApi.rag, mockApi.chat, QUERY);
    expect(winner.text).toContain('cached');
    // wait for any un-canceled work or in-flight abort to settle before asserting.
    await waitFor(() => abortedCalls(mockApi.api.calls) > 0);
    expect(chatCalls(mockApi.api.calls)).toBe(0);
    expect(abortedCalls(mockApi.api.calls)).toBeGreaterThan(0);
  });
});
