import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { delay } from '@cancjs/toolbox';
import type { EntityManager } from '@mikro-orm/core';
import { UserSchema } from './entities/user';
import { searchWhere, RESULT_LIMIT } from './orm';

export interface SearchHit {
  id: number;
  name: string;
  email: string;
  city: string;
  /** Number of seeded users in the same city. Computed per hit, one query each. */
  cityCount: number;
}

/**
 * The search as a cancelable coroutine. It runs the article's name/email match, then enriches each
 * hit with a per-city count: one query per row. Every `yield* cancAwait(...)` is a cancellation
 * point, so when the request-scoped coroutine is canceled (client disconnect) the loop stops and
 * the remaining rows are never queried. The EntityManager is the request fork; its signal is
 * ambient, so no signal is threaded here.
 */
export const searchUsers = cancAsync(function* (em: EntityManager, q: string) {
  const users = yield* cancAwait(em.find(UserSchema, searchWhere(q), { limit: RESULT_LIMIT }));

  const hits: SearchHit[] = [];
  for (const user of users) {
    // Yield to the event loop before each query. PGlite runs Postgres in one WASM thread, so a
    // disconnect (or any cancel) can only be observed at a macrotask boundary between statements;
    // without this yield the whole loop runs as one uninterruptible microtask burst. This is also
    // the cancellation point: a canceled coroutine stops here and the remaining rows never query.
    yield* cancAwait(delay(0));
    const cityCount = yield* cancAwait(em.count(UserSchema, { city: user.city }));
    hits.push({ id: user.id, name: user.name, email: user.email, city: user.city, cityCount });
  }
  return hits;
});
