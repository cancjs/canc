// Aux scaffolding: an in-memory invoicing database on TypeORM over better-sqlite3. Pretend this is
// your real Postgres. It is here only so the API has customers to bill and a bulk-generation
// endpoint slow enough that a client can disconnect partway through.
//
// Honesty note: better-sqlite3 runs every statement synchronously on the calling thread. Nothing
// here can abort a statement that is already executing. What cancellation buys us is stopping
// BETWEEN inserts: the bulk generator below writes one chunk of invoices per step, so the coroutine
// can decide, at each chunk boundary, whether the client is still connected. If not, the remaining
// chunks never run and the surrounding transaction rolls back what it had written. A production
// Postgres driver could go further and issue a wire-level cancel of an in-flight statement (see
// README, "Real databases"). For a unit-level alternative that mocks the repository entirely, the
// README points at mock-typeorm.

import 'reflect-metadata';
import {
 Column,
 DataSource,
 Entity,
 PrimaryColumn,
} from 'typeorm';

// Column types are declared explicitly rather than inferred from emitted decorator metadata: the
// tsx runner (esbuild) does not emit design:type metadata, so TypeORM cannot guess the types.
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
