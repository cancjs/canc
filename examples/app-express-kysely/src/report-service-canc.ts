import { cancAsync, cancAwait } from '@cancjs/coroutine';
import {
 aggregateChunkCount,
 fetchOrdersPage,
 fetchTopCustomers,
 grandTotalChunk,
} from './report-queries';
import type { ReportDb } from './mock/db';

const PAGE_LIMIT = 20;
const TOP_CUSTOMER_LIMIT = 10;

/**
 * The report as a cancelable coroutine. Cancellation is ambient: there are no aborted flags and
 * no signal parameter threaded through the steps. When the request-scoped root is canceled (the
 * middleware does this on client disconnect), the coroutine stops at its current `yield*` and the
 * remaining slices never run.
 */
export const buildReport = cancAsync(function* (rdb: ReportDb) {
 const page = yield* cancAwait(fetchOrdersPage(rdb, PAGE_LIMIT));

 const topCustomers = yield* cancAwait(fetchTopCustomers(rdb, TOP_CUSTOMER_LIMIT));

 // The slow aggregate, one slice at a time. Each `cancAwait` is a cancellation point: if the
 // client left, the coroutine is canceled here and nothing below runs.
 let grandTotal = 0;
 const chunks = aggregateChunkCount();
 for (let chunk = 0; chunk < chunks; chunk++) {
 grandTotal += yield* cancAwait(grandTotalChunk(rdb, chunk));
 }

 return { page, topCustomers, grandTotal };
});
