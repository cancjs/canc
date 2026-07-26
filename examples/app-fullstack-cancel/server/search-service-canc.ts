import * as canc from '@cancjs/coroutine';
import { delay } from '@cancjs/toolbox';
import type { EntityManager } from '@mikro-orm/core';
import { UserSchema } from './entities/user';
import { searchWhere, RESULT_LIMIT } from './orm';

export interface SearchHit {
  id: number;
  name: string;
  email: string;
  city: string;
  cityCount: number;
}

// The search as a cancelable coroutine. Cancellation is ambient: no signal is threaded through the
// steps. When the request coroutine is canceled (client disconnect) it stops at the current yield*
// and the remaining rows are never queried.
export const searchUsers = canc.async(function* (em: EntityManager, q: string) {
  const users = yield* canc.await(em.find(UserSchema, searchWhere(q), { limit: RESULT_LIMIT }));

  const hits: SearchHit[] = [];
  for (const user of users) {
    // Only PGlite needs this yield; real Postgres does not. PGlite runs Postgres in one WASM
    // thread, so a cancel is only seen at a boundary between statements. The yield is that boundary
    // and the coroutine's cancel point.
    yield* canc.await(delay(0));
    const cityCount = yield* canc.await(em.count(UserSchema, { city: user.city }));
    hits.push({ id: user.id, name: user.name, email: user.email, city: user.city, cityCount });
  }
  return hits;
});
