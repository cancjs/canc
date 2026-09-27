import * as canc from '@cancjs/coroutine';
import { delay } from '@cancjs/toolbox';

import { executeCancelable, executeTakeFirstCancelable } from './lib/cancelable-kysely';
import type { ReportDb } from './mock/db';
import {
  aggregateChunkCount,
  CHUNK_LATENCY_MS,
  grandTotalChunkQuery,
  mapTopCustomersRow,
  ordersPageQuery,
  topCustomersQuery,
} from './report-queries';

const PAGE_LIMIT = 20;
const TOP_CUSTOMER_LIMIT = 10;

/**
 * The report as a cancelable coroutine. Cancellation is ambient: there are no aborted flags and
 * no signal parameter threaded through the steps. When the request-scoped root is canceled (the
 * middleware does this on client disconnect), the coroutine stops at its current `yield*` and the
 * remaining slices never run.
 */
export const buildReport = canc.async(function* (rdb: ReportDb) {
  const page = yield* canc.await(
    executeCancelable(ordersPageQuery(rdb, PAGE_LIMIT), { inflightQueryAbortStrategy: rdb.strategy }),
  );

  const topCustomersRaw = yield* canc.await(
    executeCancelable(topCustomersQuery(rdb, TOP_CUSTOMER_LIMIT), { inflightQueryAbortStrategy: rdb.strategy }),
  );
  const topCustomers = topCustomersRaw.map(mapTopCustomersRow);

  // slow aggregate: canc.await cancels between slices if client disconnected
  let grandTotal = 0;
  const chunks = aggregateChunkCount();
  for (let chunk = 0; chunk < chunks; chunk++) {
    yield* canc.await(delay(CHUNK_LATENCY_MS)); // canceled here, remaining slices never run
    const row = yield* canc.await(
      executeTakeFirstCancelable(grandTotalChunkQuery(rdb, chunk), { inflightQueryAbortStrategy: rdb.strategy }),
    );
    grandTotal += Number(row?.subtotal ?? 0);
  }

  return { page, topCustomers, grandTotal };
});
