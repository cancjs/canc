import type { ReportDb } from './mock/db';
import {
  aggregateChunkCount,
  fetchOrdersPage,
  fetchTopCustomers,
  grandTotalChunk,
  ReportPayload,
} from './report-queries';

const PAGE_LIMIT = 20;
const TOP_CUSTOMER_LIMIT = 10;

/**
 * The report as a plain async function. There is no way to stop it once it starts. If the client
 * disconnects mid-report, every remaining slice still runs and the finished payload is written to
 * a socket nobody is reading.
 */
export async function buildReport(rdb: ReportDb): Promise<ReportPayload> {
  const page = await fetchOrdersPage(rdb, PAGE_LIMIT);

  const topCustomers = await fetchTopCustomers(rdb, TOP_CUSTOMER_LIMIT);

  // The slow aggregate, one slice at a time. Nothing checks whether the client is still here, so
  // every slice runs to the end even after the socket is dead. This aggregate still burns CPU.
  let grandTotal = 0;
  const chunks = aggregateChunkCount();
  for (let chunk = 0; chunk < chunks; chunk++) {
    grandTotal += await grandTotalChunk(rdb, chunk);
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
  const page = await fetchOrdersPage(rdb, PAGE_LIMIT);

  throwIfAborted(signal);
  const topCustomers = await fetchTopCustomers(rdb, TOP_CUSTOMER_LIMIT);

  // The slow aggregate, one slice at a time. Every slice must re-check the signal by hand; miss
  // one boundary and the endpoint keeps computing for a client that already left.
  let grandTotal = 0;
  const chunks = aggregateChunkCount();
  for (let chunk = 0; chunk < chunks; chunk++) {
    throwIfAborted(signal);
    grandTotal += await grandTotalChunk(rdb, chunk);
  }

  return { page, topCustomers, grandTotal };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The report was aborted', 'AbortError');
  }
}
