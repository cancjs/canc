// Shared (suffix-free) persistence layer. Both service flavors call these; the only thing the
// service twins differ on is HOW they sequence the chunks and whether they can stop between them.
// Keeping the raw TypeORM here keeps the twin services focused on the cancellation mechanics.

import { CancelablePromise } from '@cancjs/promise';
import type { EntityManager } from 'typeorm';

import { Customer, Invoice } from './mock/db';

export interface BulkResult {
  generated: number;
  chunks: number;
}

/** Per-chunk delay standing in for real write latency, so a client can disconnect mid-bulk. */
export const CHUNK_LATENCY_MS = 25;

/** Fast read: how many invoices exist right now. Used to prove a rollback left the count unchanged. */
export function countInvoices(manager: EntityManager): Promise<number> {
  return manager.getRepository(Invoice).count();
}

/** A page of customers to bill. Fast. */
export function fetchCustomers(manager: EntityManager, limit: number): Promise<Customer[]> {
  return manager.getRepository(Customer).find({ order: { id: 'ASC' }, take: limit });
}

/**
 * One chunk of the bulk generation, exposed as a single runnable slice rather than a monolithic
 * insert. Splitting it is what makes chain cancellation meaningful: the service runs the chunks in
 * sequence inside one transaction and can stop between any two of them, so a disconnected client
 * leaves the remaining chunks unwritten and the transaction rolls back what it had.
 *
 * A small delay per chunk stands in for the latency a real write would have. better-sqlite3 runs
 * synchronously and returns in microseconds, which would leave no realistic window to disconnect
 * in; the delay makes the run long enough to cancel, without pretending sqlite is abortable.
 */
export function generateInvoiceChunk(
  manager: EntityManager,
  customers: Customer[],
  baseId: number,
  issuedAt: number,
): CancelablePromise<number> {
  return new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
    // If the chunk is canceled while it is still waiting, the insert below never runs, so no rows
    // are written after the transaction has been rolled back. A plain promise here would let a
    // late insert land outside the rolled-back transaction and autocommit.
    let canceled = false;
    handleCancel(() => {
      canceled = true;
    });

    setTimeout(() => {
      if (canceled) return;
      const invoices = customers.map((customer, offset) => ({
        id: baseId + offset,
        customerId: customer.id,
        amountCents: customer.plan === 'pro' ? 4900 : 1900,
        issuedAt,
      }));
      // insert (not save) so the write joins the caller's transaction directly rather than opening
      // a nested transaction of its own, which would escape the outer rollback.
      manager
        .getRepository(Invoice)
        .insert(invoices)
        .then(() => resolve(invoices.length), reject);
    }, CHUNK_LATENCY_MS);
  });
}

/** Splits a customer list into fixed-size chunks. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
