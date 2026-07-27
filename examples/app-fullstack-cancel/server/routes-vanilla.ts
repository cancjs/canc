import { Router } from 'express';
import { getReqEm } from './lib/get-req-em';
import { getReqSignal } from './lib/get-req-signal-vanilla';
import { searchUsers } from './search-service-vanilla';

// vanilla search route. Same request fork as the canc route, but the signal is read separately and
// threaded into the service by hand. An aborted request is swallowed, not sent.
export const searchRouter = Router();

searchRouter.get('/api/search', (req, res, next) => {
  const em = getReqEm();
  const signal = getReqSignal(req, res);
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
