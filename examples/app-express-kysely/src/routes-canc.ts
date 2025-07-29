import { Router } from 'express';
import { isCancelError } from '@cancjs/promise';
import { buildReport } from './report-service-canc';
import type { ReportDb } from './mock/db';

/**
 * canc routes. The report handler hands its work to `res.locals.run`, which cancels it if the
 * client disconnects. A CancelError just means the client left, so there is nothing to send.
 */
export function createReportRouter(rdb: ReportDb): Router {
 const router = Router();

 router.get('/orders/report', (req, res, next) => {
 const run = res.locals.run;
 if (!run) return next(new Error('cancelOnDisconnect middleware not installed'));

 run(() => buildReport(rdb)).then(
 (report) => res.json(report),
 (error) => {
 if (isCancelError(error)) return; // canceled here — nothing below runs, socket already gone
 next(error);
 },
 );
 });

 router.get('/products', (_req, res, next) => {
 rdb.db
 .selectFrom('products')
 .selectAll()
 .execute()
 .then((products) => res.json(products), next);
 });

 return router;
}
