import { isCancelError } from '@cancjs/promise';
import { PGlite } from '@electric-sql/pglite';
import { sleep } from '@shared/util';
import { Kysely, PGliteDialect, sql } from 'kysely';

import { executeCancelable, transactionCancelable } from './cancelable-kysely';

interface StockSchema {
  stock_adjustments: {
    id: number;
    sku: string;
    qty: number;
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: () => settle() };
}

let db: Kysely<StockSchema>;
const queryLog: string[] = [];

beforeAll(async () => {
  const pglite = new PGlite();
  await pglite.waitReady;
  db = new Kysely<StockSchema>({
    dialect: new PGliteDialect({ pglite }),
    log: (event) => {
      if (event.level === 'query') {
        queryLog.push(event.query.sql);
      }
    },
  });

  await sql`
    CREATE TABLE stock_adjustments (
      id SERIAL PRIMARY KEY,
      sku TEXT NOT NULL,
      qty INTEGER NOT NULL
    )
  `.execute(db);
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await db.deleteFrom('stock_adjustments').execute();
  queryLog.length = 0;
});

describe('transactionCancelable', () => {
  it('rejects the caller on cancel, and the transaction it started still commits', async () => {
    const bodyStarted = deferred();
    const bodyDone = deferred();
    let bodyFinished = false;

    const adjustment = transactionCancelable(db, async (trx) => {
      try {
        await trx.insertInto('stock_adjustments').values({ id: 1, sku: 'sku-1', qty: 1 }).execute();
        bodyStarted.resolve();
        await sleep(50);
        await trx.insertInto('stock_adjustments').values({ id: 2, sku: 'sku-2', qty: 2 }).execute();
        bodyFinished = true;
      } finally {
        bodyDone.resolve();
      }
    });

    await bodyStarted.promise;
    adjustment.cancel();

    const reason = await adjustment.then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(isCancelError(reason)).toBe(true);

    await bodyDone.promise;
    expect(bodyFinished).toBe(true);

    const rows = await db.selectFrom('stock_adjustments').selectAll().execute();
    expect(rows).toHaveLength(2);
  });

  it('rolls back when the body rejects, which is how a canceled query stops a transaction', async () => {
    const adjustment = transactionCancelable(db, async (trx) => {
      await trx.insertInto('stock_adjustments').values({ id: 3, sku: 'sku-3', qty: 3 }).execute();
      throw new Error('stock check failed');
    });

    await expect(adjustment).rejects.toThrow('stock check failed');

    const rows = await db.selectFrom('stock_adjustments').selectAll().execute();
    expect(rows).toHaveLength(0);
  });
});

describe('executeCancelable', () => {
  it('never sends the statement when the query is canceled before it runs', async () => {
    const insert = db.insertInto('stock_adjustments').values({ id: 4, sku: 'sku-4', qty: 4 });
    const pending = executeCancelable(insert);
    pending.cancel();

    const reason = await pending.then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(isCancelError(reason)).toBe(true);

    // the select queues behind the insert, so an insert that was sent would be visible by now
    const rows = await db.selectFrom('stock_adjustments').selectAll().execute();
    expect(rows).toHaveLength(0);
    expect(queryLog.filter((statement) => statement.includes('insert into'))).toHaveLength(0);
  });
});
