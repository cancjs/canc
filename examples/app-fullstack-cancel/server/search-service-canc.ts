import * as canc from '@cancjs/coroutine';
import { delay } from '@cancjs/toolbox';
import type { EntityManager } from '@mikro-orm/core';

import { UserSchema } from './entities/user';
import { RESULT_LIMIT, searchWhere } from './orm';

export interface SearchHit {
  id: number;
  name: string;
  email: string;
  city: string;
  cityCount: number;
}

// cancelable search coroutine stopping at current yield* on client disconnect
export const searchUsers = canc.async(function* (em: EntityManager, q: string) {
  const users = yield* canc.await(em.find(UserSchema, searchWhere(q), { limit: RESULT_LIMIT }));

  const hits: SearchHit[] = [];
  for (const user of users) {
    // statement boundary yield needed by single-threaded WASM PGlite to observe cancel
    yield* canc.await(delay(0));
    const cityCount = yield* canc.await(em.count(UserSchema, { city: user.city }));
    hits.push({ id: user.id, name: user.name, email: user.email, city: user.city, cityCount });
  }
  return hits;
});
