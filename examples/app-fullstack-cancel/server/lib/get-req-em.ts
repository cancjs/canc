import { type EntityManager, RequestContext } from '@mikro-orm/core';

/**
 * The request-scoped EntityManager, from MikroORM's RequestContext. Call it at the top of a handler,
 * before the first await, while the async context is still live, then pass the fork down. After an
 * await the context has moved on and this would not find it. Throws if the context is missing, which
 * means the request-context middleware was not installed ahead of the route (a wiring bug worth
 * failing loudly on, rather than silently querying an unscoped global manager).
 *
 * RequestContext is a MikroORM feature, not a canc one, so both flavors use it, and both bind the
 * request's signal to the fork. The difference is what happens between two queries: the canc handler
 * is a coroutine and stops on its own, the vanilla one reads the signal back and checks it.
 */
export function getReqEm(): EntityManager {
  const em = RequestContext.getEntityManager();
  if (!em) {
    throw new Error('No request EntityManager. Install the request-context middleware before this route.');
  }
  return em;
}
