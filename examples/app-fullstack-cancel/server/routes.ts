import { Router } from 'express';
import { cancAwait } from '@cancjs/coroutine';
import { RequestContext, type MikroORM } from '@mikro-orm/core';
import { cancAsyncRoute } from './lib/cancelable-route';
import { searchUsers } from './search-service';

/**
 * The search route. The handler is a generator wrapped by cancAsyncRoute, so it cancels when the
 * client disconnects. It reads the request-scoped EntityManager from the ambient context and passes
 * it down; there is no fork and no signal in sight.
 */
export function createSearchRouter(orm: MikroORM): Router {
  const router = Router();

  router.get(
    '/api/search',
    cancAsyncRoute(function* (req, res) {
      // Grab the request-scoped fork itself, not `orm.em`. `orm.em` resolves the context fork lazily
      // through AsyncLocalStorage at each call, but the coroutine's queries run on microtasks after
      // that context has exited, where `orm.em` would fall back to the global manager (no signal).
      // Capturing the fork object here, while the context is live, keeps its abort signal wired for
      // every query no matter when it runs.
      const em = RequestContext.getEntityManager() ?? orm.em;
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (!q.trim()) {
        res.json([]);
        return;
      }
      const hits = yield* cancAwait(searchUsers(em, q));
      res.json(hits);
    }),
  );

  router.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}
