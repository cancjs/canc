// Aux scaffolding: wraps @shared/mock-api's music domain behind a small, browser-friendly facade.
// Treat this as "your API client" — the teaching payload is the store, not this file.

import { createMockApi, type Album, type Track } from '@shared/mock-api';

export type { Album, Track };

const mock = createMockApi({ latency: 60, jitter: 30 });

export const mediaApi = mock.music;
export const mockCalls = mock.api.calls;
