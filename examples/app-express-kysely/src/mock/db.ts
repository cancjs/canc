// Aux scaffolding: an in-memory e-commerce database, seeded once at boot. Pretend this is your
// real Postgres. It is here only so the report endpoint has something slow and real to compute
// while a client is (or is not) still connected.
//
// Honesty note: better-sqlite3 runs every statement synchronously on the calling thread. Nothing
// here can abort a statement that is already executing. What cancellation buys us is stopping
// BETWEEN queries: the aggregate below is deliberately split into slices (`chunkedQuery`) so the
// handler can decide, at each slice boundary, whether the client is still there. If not, the
// remaining slices never run and the response is released. A production Postgres driver could go
// further and issue a wire-level cancel of an in-flight statement (see README, "Real databases").

import SqliteDatabase from 'better-sqlite3';
import { Kysely, sql, SqliteDialect } from 'kysely';

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
  close(): void;
}

/** Builds and seeds the in-memory database. Deterministic: no randomness, so tests are stable. */
export function createReportDb(): ReportDb {
  const sqlite = new SqliteDatabase(':memory:');
  sqlite.pragma('journal_mode = OFF');
  sqlite.pragma('synchronous = OFF');

  sqlite.exec(`
 CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL);
 CREATE TABLE orders (
 id INTEGER PRIMARY KEY,
 customer_id INTEGER NOT NULL,
 product_id INTEGER NOT NULL,
 quantity INTEGER NOT NULL,
 unit_price INTEGER NOT NULL,
 created_at INTEGER NOT NULL
 );
 CREATE INDEX idx_orders_customer ON orders (customer_id);
 `);

  const insertProduct = sqlite.prepare('INSERT INTO products (id, name, category) VALUES (?, ?, ?)');
  const insertOrder = sqlite.prepare(
    'INSERT INTO orders (id, customer_id, product_id, quantity, unit_price, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const seed = sqlite.transaction(() => {
    for (let id = 1; id <= SEED_PRODUCT_COUNT; id++) {
      insertProduct.run(id, `Product ${id}`, `cat-${id % 5}`);
    }
    for (let id = 1; id <= SEED_ORDER_COUNT; id++) {
      const customerId = (id % SEED_CUSTOMER_COUNT) + 1;
      const productId = (id % SEED_PRODUCT_COUNT) + 1;
      const quantity = (id % 5) + 1;
      const unitPrice = 100 + (id % 900);
      insertOrder.run(id, customerId, productId, quantity, unitPrice, id);
    }
  });
  seed();

  const queryLog: string[] = [];

  const db = new Kysely<Schema>({
    dialect: new SqliteDialect({ database: sqlite }),
    log: (event) => {
      if (event.level === 'query') {
        queryLog.push(event.query.sql);
      }
    },
  });

  return {
    db,
    queryLog,
    close: () => void db.destroy(),
  };
}

export { sql };
