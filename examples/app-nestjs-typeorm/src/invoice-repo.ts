// shared persistence layer backing bulk invoice generation

import { CancelablePromise } from '@cancjs/promise';
import type { EntityManager } from 'typeorm';

import { Customer, Invoice } from './mock/db';

export interface BulkResult {
  generated: number;
  chunks: number;
}

/** Per-chunk delay standing in for real write latency */
export const CHUNK_LATENCY_MS = 25;

/** Fast read: how many invoices exist right now */
export function countInvoices(manager: EntityManager): Promise<number> {
  return manager.getRepository(Invoice).count();
}

/** A page of customers to bill */
export function fetchCustomers(manager: EntityManager, limit: number): Promise<Customer[]> {
  return manager.getRepository(Customer).find({ order: { id: 'ASC' }, take: limit });
}

/**
 * One chunk of the bulk generation, exposed as a single runnable slice
 * The service runs chunks in sequence and can stop between them to rollback
 */
export function generateInvoiceChunk(
  manager: EntityManager,
  customers: Customer[],
  baseId: number,
  issuedAt: number,
): CancelablePromise<number> {
  return new CancelablePromise<number>((resolve, reject, { handleCancel }) => {
    // canceled chunk skips insert so no writes land after rollback
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
      // insert joins caller transaction without opening nested transaction
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
