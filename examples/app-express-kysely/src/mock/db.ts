// In-memory e-commerce database seeded at boot (mock data layer)
//
// Honesty note: pglite runs in-process WASM and cannot wire-cancel running statements
// Cancellation stops between chunked queries; wire-cancel requires a real Postgres instance

import { PGlite } from '@electric-sql/pglite';
import { InflightQueryAbortStrategy, Kysely, PGliteDialect, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

interface OrderRow {
  id: number;
  customer_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  created_at: number;
}

interface ProductRow {
  id: number;
  name: string;
  category: string;
}

export interface Schema {
  orders: OrderRow;
  products: ProductRow;
}

/** Rows scanned per aggregate slice. Small enough that a slice is a natural cancellation point. */
export const CHUNK_ROWS = 5000;

/** Total seeded orders. 50k rows across 10 chunks makes the aggregate visibly non-trivial. */
export const SEED_ORDER_COUNT = 50_000;
const SEED_CUSTOMER_COUNT = 500;
const SEED_PRODUCT_COUNT = 40;

export interface ReportDb {
  db: Kysely<Schema>;
  /** Every executed query is logged here so a test can assert which queries ran (and which did not). */
  queryLog: string[];
  strategy: InflightQueryAbortStrategy;
  close(): Promise<void>;
}

/** Builds and seeds the database. Deterministic: no randomness, so tests are stable. */
export async function createReportDb(): Promise<ReportDb> {
  const queryLog: string[] = [];

  let db: Kysely<Schema>;
  let strategy: InflightQueryAbortStrategy;
  let close: () => Promise<void>;

  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = new Kysely<Schema>({
      dialect: new PostgresDialect({ pool }),
      log: (event) => {
        if (event.level === 'query') {
          queryLog.push(event.query.sql);
        }
      },
    });
    strategy = 'cancel query';
    close = async () => {
      await db.destroy();
    };

    await sql`DROP TABLE IF EXISTS orders`.execute(db);
    await sql`DROP TABLE IF EXISTS products`.execute(db);
  } else {
    const pglite = new PGlite();
    await pglite.waitReady;
    db = new Kysely<Schema>({
      dialect: new PGliteDialect({ pglite }),
      log: (event) => {
        if (event.level === 'query') {
          queryLog.push(event.query.sql);
        }
      },
    });
    strategy = 'ignore query';
    close = async () => {
      await db.destroy();
    };
  }

  await sql`
    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    )
  `.execute(db);

  await sql`CREATE INDEX idx_orders_customer ON orders (customer_id)`.execute(db);

  // seed products
  const productValues = [];
  for (let id = 1; id <= SEED_PRODUCT_COUNT; id++) {
    productValues.push({
      id,
      name: `Product ${id}`,
      category: `cat-${id % 5}`,
    });
  }
  await db.insertInto('products').values(productValues).execute();

  // seed orders
  const orderValues = [];
  for (let id = 1; id <= SEED_ORDER_COUNT; id++) {
    orderValues.push({
      id,
      customer_id: (id % SEED_CUSTOMER_COUNT) + 1,
      product_id: (id % SEED_PRODUCT_COUNT) + 1,
      quantity: (id % 5) + 1,
      unit_price: 100 + (id % 900),
      created_at: id,
    });
  }

  // chunk inserts to stay within SQL parameter limits
  const CHUNK_SIZE = 5000;
  for (let i = 0; i < orderValues.length; i += CHUNK_SIZE) {
    await db
      .insertInto('orders')
      .values(orderValues.slice(i, i + CHUNK_SIZE))
      .execute();
  }

  return { db, queryLog, strategy, close };
}

export { sql };
