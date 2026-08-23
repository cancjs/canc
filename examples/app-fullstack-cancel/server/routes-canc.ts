import * as canc from '@cancjs/coroutine';
import { Router } from 'express';

import { cancAsyncRoute } from './lib/cancelable-route';
import { getReqEm } from './lib/get-req-em';
import { searchUsers } from './search-service-canc';

// search route that cancels when client disconnects
export const searchRouter = Router();

searchRouter.get(
  '/api/search',
  cancAsyncRoute(function* (req, res) {
    const em = getReqEm();
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q.trim()) {
      res.json([]);
      return;
    }
    const hits = yield* canc.await(searchUsers(em, q));
    res.json(hits);
  }),
);

searchRouter.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
