import { Router } from 'express';
import { cancAwait } from '@cancjs/coroutine';
import { cancAsyncRoute } from './lib/cancelable-route';
import { buildReport } from './report-service-canc';
import type { ReportDb } from './mock/db';

/**
 * canc routes. The report handler is a generator wrapped by `cancAsyncRoute`, which cancels the
 * coroutine if the client disconnects. Cancellation is handled by the wrapper, not the handler.
 */
export function createReportRouter(rdb: ReportDb): Router {
 const router = Router();

 router.get(
 '/orders/report',
 cancAsyncRoute(function* (req, res) {
 const report = yield* cancAwait(buildReport(rdb));
 res.json(report); // handler owns the response, full control
 }),
 );

 router.get('/products', (_req, res, next) => {
 rdb.db
 .selectFrom('products')
 .selectAll()
 .execute()
 .then((products) => res.json(products), next);
 });

 return router;
}
