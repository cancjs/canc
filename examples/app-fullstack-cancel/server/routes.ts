import { Router } from 'express';
import { cancAwait } from '@cancjs/coroutine';
import { cancAsyncRoute } from './lib/cancelable-route';
import { requestEm } from './lib/canc-request-context';
import { searchUsers } from './search-service';

/**
 * The search route. The handler is a generator wrapped by cancAsyncRoute, so it cancels when the
 * client disconnects. It reads the request-scoped EntityManager from the ambient context and passes
 * it down; there is no fork and no signal in sight.
 */
export function createSearchRouter(): Router {
  const router = Router();

  router.get(
    '/api/search',
    cancAsyncRoute(function* (req, res) {
      // Grab the request-scoped fork while the context is live, then pass it down. Its abort signal
      // stays wired for every query, even those that run after the async context has moved on.
      const em = requestEm();
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
