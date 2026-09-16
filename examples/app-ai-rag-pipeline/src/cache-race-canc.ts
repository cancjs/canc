// cache-vs-pipeline race where loser cancels down whole tree

import type { BreakError } from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import type { ChatApi, RagApi } from '@shared/mock-api';

import { RagAnswer } from './pipeline';
import { ragPipeline } from './pipeline-canc';

export function answerWithCache(
  ragApi: RagApi,
  chatApi: ChatApi,
  query: string,
): CancelablePromise<RagAnswer, BreakError> {
  return CancelablePromise.race([lookupCache(query), ragPipeline(ragApi, chatApi, query)]);
}

// fast semantic-cache lookup resolving quickly on cache hits
function lookupCache(query: string): CancelablePromise<RagAnswer, never> {
  return new CancelablePromise((resolve) => {
    setTimeout(() => {
      resolve({ query, text: `cached: ${query}`, sources: ['cache'] });
    }, 20);
  });
}
