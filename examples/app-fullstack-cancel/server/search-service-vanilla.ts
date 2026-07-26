import { sleep } from '@shared/util';
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

// The search with a hand-threaded AbortSignal. The signal is passed in, drilled into every query,
// and checked between steps. When the client disconnects the signal aborts, the next check throws,
// and the remaining rows are never queried.
export async function searchUsers(em: EntityManager, q: string, signal: AbortSignal): Promise<SearchHit[]> {
  const users = await em.find(UserSchema, searchWhere(q), { limit: RESULT_LIMIT, signal });

  const hits: SearchHit[] = [];
  for (const user of users) {
    // Only PGlite needs this yield; real Postgres does not. PGlite runs Postgres in one WASM
    // thread, so a cancel is only seen at a boundary between statements. The yield is that boundary;
    // the throwIfAborted below is the manual cancel point.
    await sleep(0);
    signal.throwIfAborted();
    const cityCount = await em.count(UserSchema, { city: user.city }, { signal });
    hits.push({ id: user.id, name: user.name, email: user.email, city: user.city, cityCount });
  }
  return hits;
}
