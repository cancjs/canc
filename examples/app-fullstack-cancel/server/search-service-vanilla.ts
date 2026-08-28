import type { EntityManager } from '@mikro-orm/core';
import { sleep } from '@shared/util';

import { UserSchema } from './entities/user';
import { RESULT_LIMIT, searchWhere } from './orm';

export interface SearchHit {
  id: number;
  name: string;
  email: string;
  city: string;
  cityCount: number;
}

// search that takes the request signal because nothing else stops the loop between statements
export async function searchUsers(em: EntityManager, q: string, signal: AbortSignal): Promise<SearchHit[]> {
  const users = await em.find(UserSchema, searchWhere(q), { limit: RESULT_LIMIT });

  const hits: SearchHit[] = [];
  for (const user of users) {
    // statement boundary yield needed by single-threaded WASM PGlite to observe cancel
    await sleep(0);
    // the fork's signal aborts a running query, not the code between two of them
    signal.throwIfAborted();
    const cityCount = await em.count(UserSchema, { city: user.city });
    hits.push({ id: user.id, name: user.name, email: user.email, city: user.city, cityCount });
  }
  return hits;
}
