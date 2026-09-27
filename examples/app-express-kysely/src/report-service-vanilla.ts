import { sleep } from '@shared/util';

import type { ReportDb } from './mock/db';
import {
  aggregateChunkCount,
  CHUNK_LATENCY_MS,
  grandTotalChunkQuery,
  mapTopCustomersRow,
  ordersPageQuery,
  ReportPayload,
  topCustomersQuery,
} from './report-queries';

const PAGE_LIMIT = 20;
const TOP_CUSTOMER_LIMIT = 10;

/**
 * The report as a plain async function. There is no way to stop it once it starts. If the client
 * disconnects mid-report, every remaining slice still runs and the finished payload is written to
 * a socket nobody is reading.
 */
export async function buildReport(rdb: ReportDb): Promise<ReportPayload> {
  const page = await ordersPageQuery(rdb, PAGE_LIMIT).execute();

  const topCustomersRaw = await topCustomersQuery(rdb, TOP_CUSTOMER_LIMIT).execute();
  const topCustomers = topCustomersRaw.map(mapTopCustomersRow);

  // slow aggregate: uncancelable loop runs every slice even if socket closed
  let grandTotal = 0;
  const chunks = aggregateChunkCount();
  for (let chunk = 0; chunk < chunks; chunk++) {
    await sleep(CHUNK_LATENCY_MS); // keeps querying for dead socket
    const row = await grandTotalChunkQuery(rdb, chunk).executeTakeFirst();
    grandTotal += Number(row?.subtotal ?? 0);
  }

  return { page, topCustomers, grandTotal };
}

/**
 * The AbortController workaround. Same report, made stoppable by hand: the caller threads a signal
 * in, and every step re-checks `signal.aborted` before doing more work. This is the bloat canc
 * removes. The abort points must be added, and remembered, at every boundary or the guarantee is
 * lost.
 */
export async function buildReportAbortable(rdb: ReportDb, signal: AbortSignal): Promise<ReportPayload> {
  throwIfAborted(signal);
  const page = await ordersPageQuery(rdb, PAGE_LIMIT).execute({
    signal,
    inflightQueryAbortStrategy: rdb.strategy,
  });

  throwIfAborted(signal);
  const topCustomersRaw = await topCustomersQuery(rdb, TOP_CUSTOMER_LIMIT).execute({
    signal,
    inflightQueryAbortStrategy: rdb.strategy,
  });
  const topCustomers = topCustomersRaw.map(mapTopCustomersRow);

  // slow aggregate: each slice re-checks signal by hand
  let grandTotal = 0;
  const chunks = aggregateChunkCount();
  for (let chunk = 0; chunk < chunks; chunk++) {
    throwIfAborted(signal);
    await sleep(CHUNK_LATENCY_MS); // keeps querying for dead socket
    throwIfAborted(signal);
    const row = await grandTotalChunkQuery(rdb, chunk).executeTakeFirst({
      signal,
      inflightQueryAbortStrategy: rdb.strategy,
    });
    grandTotal += Number(row?.subtotal ?? 0);
  }

  return { page, topCustomers, grandTotal };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The report was aborted', 'AbortError');
  }
}
