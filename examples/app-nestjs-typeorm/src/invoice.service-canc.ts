import type { AsyncResult } from '@cancjs/coroutine';
import * as canc from '@cancjs/coroutine';
import { AsyncMethod } from '@cancjs/decorators/legacy';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BillingTier } from './billing-metadata';
import { BulkResult, chunk, countInvoices, fetchCustomers, generateInvoiceChunk } from './invoice-repo';
import { CHUNK_CUSTOMERS } from './mock/db';

const LIST_LIMIT = 200;

/**
 * The decorated service. Each method is a canc coroutine written as a generator and wrapped by
 * @AsyncMethod, so it returns a cancelable promise. Nest's @Injectable and a custom @BillingTier
 * marker sit on the same class and method; the marker is read by BillingTierGuard at request time,
 * which is the coexistence proof: our wrapper preserves the metadata Nest attached.
 *
 * Cancellation is ambient. There are no aborted flags and no signal parameter threaded through the
 * steps. When the request-scoped root is canceled (the interceptor does this on disconnect), the
 * coroutine stops at its current canc.await and the remaining chunks never run.
 */
@Injectable()
export class InvoiceService {
  // The @Inject(DataSource) is explicit rather than inferred: the tsx runner (esbuild) does not
  // emit constructor param metadata, so Nest cannot infer the token from the type alone.
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  // @AsyncMethod (the experimental-decorators build) wraps the method. Decorators apply bottom-up,
  // so @BillingTier sets its marker first and the wrapper carries it forward. This is the
  // coexistence proof the guard checks.
  @AsyncMethod()
  @BillingTier('standard')
  *listInvoices(): AsyncResult<number> {
    return yield* canc.await(countInvoices(this.dataSource.manager));
  }

  /**
   * Bulk-generate one invoice per customer inside a single transaction. The transaction callback
   * runs the chunks in sequence; a canceled coroutine stops between chunks and the whole
   * transaction rolls back. The rollback is driven by the surrounding coroutine's finally, which
   * canc runs SHIELDED, so cancellation can never abort the cleanup half-done.
   */
  @AsyncMethod()
  @BillingTier('bulk')
  *generateAll(): AsyncResult<BulkResult> {
    const before = yield* canc.await(countInvoices(this.dataSource.manager));
    const customers = yield* canc.await(fetchCustomers(this.dataSource.manager, LIST_LIMIT));
    const groups = chunk(customers, CHUNK_CUSTOMERS);
    const issuedAt = 1;

    let generated = 0;
    let rolledBack = false;
    const queryRunner = this.dataSource.createQueryRunner();
    yield* canc.await(queryRunner.connect());
    yield* canc.await(queryRunner.startTransaction());
    try {
      for (let i = 0; i < groups.length; i++) {
        // Each canc.await is a cancellation point: if the client left, the coroutine is canceled
        // here and the chunks below never run.
        generated += yield* canc.await(
          generateInvoiceChunk(queryRunner.manager, groups[i], before + generated + 1, issuedAt),
        );
      }
      yield* canc.await(queryRunner.commitTransaction());
    } finally {
      // shielded: canceled here, this cleanup is driven to completion regardless. A partial run
      // rolls back so the invoice count is left exactly as it was before the request started.
      if (!queryRunner.isTransactionActive) {
        // committed already; nothing to undo
      } else {
        yield* canc.await(queryRunner.rollbackTransaction());
        rolledBack = true;
      }
      yield* canc.await(queryRunner.release());
      if (rolledBack) console.log(`[canc] bulk canceled: rolled back, ${generated} invoices discarded`);
    }

    return { generated, chunks: groups.length };
  }
}
