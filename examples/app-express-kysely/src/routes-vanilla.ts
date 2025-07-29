import { Router } from 'express';
import { buildReport, buildReportAbortable } from './report-service-vanilla';
import type { ReportDb } from './mock/db';

/**
 * vanilla routes. Two report handlers: `/orders/report` cannot be stopped at all, and
 * `/orders/report-abortable` is the hand-rolled AbortController version. Compare both against the
 * single canc handler.
 */
export function createReportRouter(rdb: ReportDb): Router {
 const router = Router();

 router.get('/orders/report', (_req, res, next) => {
 // No cancellation: this runs to completion even if the client already disconnected.
 buildReport(rdb).then(
 (report) => res.json(report), // res.json writes to nobody when the socket is dead
 (error) => next(error),
 );
 });

 router.get('/orders/report-abortable', (_req, res, next) => {
 const signal = res.locals.abortSignal;
 if (!signal) return next(new Error('abortOnDisconnect middleware not installed'));

 buildReportAbortable(rdb, signal).then(
 (report) => res.json(report),
 (error) => {
 if (error?.name === 'AbortError') return; // aborted by hand — the workaround's cost
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
