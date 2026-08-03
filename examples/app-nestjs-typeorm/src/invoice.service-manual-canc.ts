import * as canc from '@cancjs/coroutine';
import type { CancelablePromise } from '@cancjs/promise';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BillingTier } from './billing-metadata';
import type { InvoiceServiceLike } from './invoice.tokens';
import { BulkResult, chunk, countInvoices, fetchCustomers, generateInvoiceChunk } from './invoice-repo';
import { CHUNK_CUSTOMERS } from './mock/db';

const LIST_LIMIT = 200;

/**
 * The no-decorator twin of InvoiceService. Same behavior, wired by hand: each method body is a
 * generator passed to canc.async explicitly instead of being wrapped by @AsyncMethod. This is the
 * flavor comparison the module lets you switch on (CANC_MANUAL=1) so you can read the decorated and
 * the explicit wiring side by side. The Nest @BillingTier marker still sits on the methods, so the
 * guard behaves identically; only the canc wrapping differs.
 */
@Injectable()
export class InvoiceServiceManual implements InvoiceServiceLike {
  // The @Inject(DataSource) is explicit rather than inferred: the tsx runner (esbuild) does not
  // emit constructor param metadata, so Nest cannot infer the token from the type alone.
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  @BillingTier('standard')
  listInvoices(): CancelablePromise<number> {
    return canc
      .async(function* (this: InvoiceServiceManual) {
        return yield* canc.await(countInvoices(this.dataSource.manager));
      })
      .call(this) as CancelablePromise<number>;
  }

  @BillingTier('bulk')
  generateAll(): CancelablePromise<BulkResult> {
    return canc
      .async(function* (this: InvoiceServiceManual) {
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
            generated += yield* canc.await(
              generateInvoiceChunk(queryRunner.manager, groups[i], before + generated + 1, issuedAt),
            );
          }
          yield* canc.await(queryRunner.commitTransaction());
        } finally {
          // shielded finally, same as the decorated twin: a canceled bulk rolls back to the count it
          // started at, and the cleanup is always driven to completion.
          if (queryRunner.isTransactionActive) {
            yield* canc.await(queryRunner.rollbackTransaction());
            rolledBack = true;
          }
          yield* canc.await(queryRunner.release());
          if (rolledBack) console.log(`[canc] bulk canceled: rolled back, ${generated} invoices discarded`);
        }

        return { generated, chunks: groups.length };
      })
      .call(this) as CancelablePromise<BulkResult>;
  }
}
