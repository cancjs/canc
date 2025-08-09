import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BillingTier } from './billing-metadata';
import {
 BulkResult,
 chunk,
 countInvoices,
 fetchCustomers,
 generateInvoiceChunk,
} from './invoice-repo';
import { CHUNK_CUSTOMERS } from './mock/db';

const LIST_LIMIT = 200;

/**
 * The vanilla service. Each method is a plain async function, so there is no way to stop it once
 * it starts. Nest's @Injectable and the @BillingTier marker still sit on the same class and method
 * (the guard reads the marker either way); what is missing is any cancellation, so a disconnect
 * mid-bulk cannot stop the run.
 *
 * There is no ambient cancellation. If the client disconnects mid-bulk, every remaining chunk still
 * runs, the transaction still commits, and the finished result is written to a dead socket.
 */
@Injectable()
export class InvoiceService {
 // The @Inject(DataSource) is explicit rather than inferred: the tsx runner (esbuild) does not
 // emit constructor param metadata, so Nest cannot infer the token from the type alone.
 constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

 @BillingTier('standard')
 async listInvoices(): Promise<number> {
 return await countInvoices(this.dataSource.manager);
 }

 /**
 * Bulk-generate one invoice per customer inside a single transaction. The transaction callback
 * runs the chunks in sequence; nothing checks whether the client is still here, so every chunk
 * runs and the transaction commits even after the socket is dead. The finally only undoes work
 * on a thrown error, never on a disconnect (there is no cancellation to react to).
 */
 @BillingTier('bulk')
 async generateAll(): Promise<BulkResult> {
 const before = await countInvoices(this.dataSource.manager);
 const customers = await fetchCustomers(this.dataSource.manager, LIST_LIMIT);
 const groups = chunk(customers, CHUNK_CUSTOMERS);
 const issuedAt = 1;

 let generated = 0;
 let rolledBack = false;
 const queryRunner = this.dataSource.createQueryRunner();
 await queryRunner.connect();
 await queryRunner.startTransaction();
 try {
 for (let i = 0; i < groups.length; i++) {
 // No cancellation point: nothing checks whether the client left, so every chunk below runs
 // to the end even after the socket is dead.
 generated += await generateInvoiceChunk(
 queryRunner.manager, groups[i], before + generated + 1, issuedAt,
 );
 }
 await queryRunner.commitTransaction();
 } finally {
 // Only reached with an active transaction on a thrown error; a disconnect never lands here,
 // so a bulk run always commits in full for a client that may already be gone.
 if (!queryRunner.isTransactionActive) {
 // committed already; nothing to undo
 } else {
 await queryRunner.rollbackTransaction();
 rolledBack = true;
 }
 await queryRunner.release();
 if (rolledBack) console.log(`[vanilla] bulk errored: rolled back, ${generated} invoices discarded`);
 }

 return { generated, chunks: groups.length };
 }
}
