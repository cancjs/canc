import { Router } from 'express';
import { reqDb } from './middleware-vanilla';
import { searchUsers } from './search-service-vanilla';

// vanilla search route. It reads the request signal and EntityManager from the middleware and
// threads the signal into the service by hand. An aborted request is swallowed, not sent.
export const searchRouter = Router();

searchRouter.get('/api/search', (req, res, next) => {
  const { em, signal } = reqDb(req);
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.json([]);
    return;
  }
  searchUsers(em, q, signal).then(
    (hits) => res.json(hits),
    (err) => {
      if (signal.aborted) return; // client left, nothing to send
      next(err);
    },
  );
});

searchRouter.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
