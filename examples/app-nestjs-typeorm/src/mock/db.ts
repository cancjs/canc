// In-memory invoicing database on TypeORM over better-sqlite3 (mock data layer)
//
// Honesty note: better-sqlite3 statements execute synchronously on the calling thread.
// Cancellation stops between chunked inserts, not inside a running statement.
// Disconnect aborts remaining chunks and rolls back the transaction.

import 'reflect-metadata';

import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm';

// explicit column types needed because esbuild does not emit design:type metadata
@Entity('customers')
export class Customer {
  @PrimaryColumn('integer')
  id!: number;

  @Column('text')
  name!: string;

  @Column('text')
  plan!: string;
}

@Entity('invoices')
export class Invoice {
  @PrimaryColumn('integer')
  id!: number;

  @Column('integer')
  customerId!: number;

  @Column('integer')
  amountCents!: number;

  @Column('integer')
  issuedAt!: number;
}

/** Customers billed per bulk-generation chunk. Small enough that a chunk is a natural cancel point. */
export const CHUNK_CUSTOMERS = 25;

/** Seeded customers. 200 customers over 8 chunks makes a bulk run visibly non-trivial. */
export const SEED_CUSTOMER_COUNT = 200;

/** Builds and seeds an in-memory DataSource. Deterministic: no randomness, so tests are stable. */
export async function createDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [Customer, Invoice],
    synchronize: true,
  });

  await dataSource.initialize();

  const customers = dataSource.getRepository(Customer);
  const rows: Customer[] = [];
  for (let id = 1; id <= SEED_CUSTOMER_COUNT; id++) {
    rows.push(customers.create({ id, name: `Customer ${id}`, plan: id % 3 === 0 ? 'pro' : 'basic' }));
  }
  await customers.save(rows);

  return dataSource;
}

/** Total number of bulk-generation chunks (rounds up). */
export function bulkChunkCount(): number {
  return Math.ceil(SEED_CUSTOMER_COUNT / CHUNK_CUSTOMERS);
}
