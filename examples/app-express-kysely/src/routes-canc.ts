import * as canc from '@cancjs/coroutine';
import { Router } from 'express';

import { executeCancelable } from './lib/cancelable-kysely';
import { cancAsyncRoute } from './lib/cancelable-route';
import type { ReportDb } from './mock/db';
import { buildReport } from './report-service-canc';

/**
 * canc routes. Both handlers are generators wrapped by `cancAsyncRoute`, which cancels the
 * coroutine if the client disconnects. Cancellation is handled by the wrapper, not the handler.
 */
export function createReportRouter(rdb: ReportDb): Router {
  const router = Router();

  router.get(
    '/orders/report',
    cancAsyncRoute(function* (req, res) {
      const report = yield* canc.await(buildReport(rdb));
      res.json(report); // handler owns the response, full control
    }),
  );

  router.get(
    '/products',
    cancAsyncRoute(function* (_req, res) {
      // canceled on disconnect like the report, though one short query leaves little to stop
      const productsQuery = rdb.db.selectFrom('products').selectAll();
      const products = yield* canc.await(
        executeCancelable(productsQuery, { inflightQueryAbortStrategy: rdb.strategy }),
      );
      res.json(products);
    }),
  );

  return router;
}
