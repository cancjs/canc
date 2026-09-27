// cache-vs-pipeline race where losing pipeline keeps running in background

import type { ChatApi, RagApi } from '@shared/mock-api';

import { RagAnswer } from './pipeline';
import { ragPipeline } from './pipeline-vanilla';

export function answerWithCache(ragApi: RagApi, chatApi: ChatApi, query: string): Promise<RagAnswer> {
  return Promise.race([lookupCache(query), ragPipeline(ragApi, chatApi, query)]);
}

// fast semantic-cache lookup resolving quickly on cache hits
function lookupCache(query: string): Promise<RagAnswer> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ query, text: `cached: ${query}`, sources: ['cache'] });
    }, 20);
  });
}
