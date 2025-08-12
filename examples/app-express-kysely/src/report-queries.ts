// Shared (suffix-free) query layer. Both the vanilla and canc report services call these; the
// only thing the twins differ on is HOW they sequence and cancel them. Keeping the raw kysely
// here keeps the twin services focused on the cancellation mechanics, not on SQL.

import { sleep } from '@shared/util';
import { CHUNK_ROWS, SEED_ORDER_COUNT, ReportDb, sql } from './mock/db';

export interface OrderRowView {
 id: number;
 customerId: number;
 quantity: number;
 unitPrice: number;
}

export interface CustomerTotal {
 customerId: number;
 total: number;
}

export interface ReportPayload {
 page: OrderRowView[];
 topCustomers: CustomerTotal[];
 grandTotal: number;
}

/** Step 1: a page of recent orders. Fast. */
export function fetchOrdersPage(rdb: ReportDb, limit: number): Promise<OrderRowView[]> {
 return rdb.db
 .selectFrom('orders')
 .select(['id', 'customer_id as customerId', 'quantity', 'unit_price as unitPrice'])
 .orderBy('created_at', 'desc')
 .limit(limit)
 .execute();
}

/** Step 2: per-customer revenue for the top spenders. Medium. */
export function fetchTopCustomers(rdb: ReportDb, limit: number): Promise<CustomerTotal[]> {
 return rdb.db
 .selectFrom('orders')
 .select(['customer_id as customerId'])
 .select((eb) => eb.fn.sum(sql<number>`quantity * unit_price`).as('total'))
 .groupBy('customer_id')
 .orderBy('total', 'desc')
 .limit(limit)
 .execute()
 .then((rows) => rows.map((row) => ({ customerId: row.customerId, total: Number(row.total) })));
}

/** Number of slices the grand-total aggregate is split into (rounds up). */
export function aggregateChunkCount(): number {
 return Math.ceil(SEED_ORDER_COUNT / CHUNK_ROWS);
}

/** Per-slice delay standing in for real query latency, so a client can disconnect mid-report. */
export const CHUNK_LATENCY_MS = 25;

/**
 * Step 3, the slow aggregate, exposed as one runnable slice per call rather than a single
 * statement. Each slice sums revenue over CHUNK_ROWS orders. Splitting it is what makes chain
 * cancellation meaningful: the handler runs the slices in sequence and can stop between any two
 * of them, so a disconnected client leaves the remaining slices unrun. A single monolithic
 * aggregate would give sqlite no boundary to stop at.
 *
 * A small delay per slice stands in for the latency a real database call would have. sqlite runs
 * synchronously and returns in microseconds, which would leave no realistic window to disconnect
 * in; the delay makes the report long enough to cancel, without pretending sqlite is abortable.
 */
export function grandTotalChunk(rdb: ReportDb, chunkIndex: number): Promise<number> {
 const offset = chunkIndex * CHUNK_ROWS;
 return sleep(CHUNK_LATENCY_MS).then(() =>
 rdb.db
 .selectFrom('orders')
 .select((eb) => eb.fn.sum(sql<number>`quantity * unit_price`).as('subtotal'))
 .where('id', '>', offset)
 .where('id', '<=', offset + CHUNK_ROWS)
 .executeTakeFirst()
 .then((row) => Number(row?.subtotal ?? 0)),
 );
}
