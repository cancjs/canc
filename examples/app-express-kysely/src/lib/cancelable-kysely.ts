/**
 * cancelable-kysely.ts
 * Reusable kysely query cancellation helpers.
 */
import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import type { AbortableQueryOptions, InflightQueryAbortStrategy, Kysely, Transaction } from 'kysely';

export interface KyselyCancelOptions {
  /** 'ignore query' (default, only pglite-safe). 'cancel query'/'kill session' need a client/server driver. */
  inflightQueryAbortStrategy?: InflightQueryAbortStrategy;
}
const DEFAULT_STRATEGY: InflightQueryAbortStrategy = 'ignore query';

type Executable<R> = { execute(options?: AbortableQueryOptions): Promise<R> };
type TakeFirstExecutable<R> = { executeTakeFirst(options?: AbortableQueryOptions): Promise<R | undefined> };

/**
 * Generic per-query wrapper. The row type is inferred from the builder.
 *
 * The `cancelify(...)()` call is inline on purpose. Hoisting it into one shared wrapper would fix
 * `R` at the first call site and erase the row type everywhere else. The two helpers below do the
 * same for the same reason.
 */
export function executeCancelable<R>(query: Executable<R>, options?: KyselyCancelOptions): CancelablePromise<R> {
  return cancelify(({ getSignal }) =>
    query.execute({
      signal: getSignal(),
      inflightQueryAbortStrategy: options?.inflightQueryAbortStrategy ?? DEFAULT_STRATEGY,
    }),
  )();
}

/** Take-first variant. */
export function executeTakeFirstCancelable<R>(
  query: TakeFirstExecutable<R>,
  options?: KyselyCancelOptions,
): CancelablePromise<R | undefined> {
  return cancelify(({ getSignal }) =>
    query.executeTakeFirst({
      signal: getSignal(),
      inflightQueryAbortStrategy: options?.inflightQueryAbortStrategy ?? DEFAULT_STRATEGY,
    }),
  )();
}

/** Raw sql fragment variant. */
export function executeRawCancelable<R>(
  fragment: { execute(db: Kysely<any>, options?: AbortableQueryOptions): Promise<{ rows: R[] }> },
  db: Kysely<any>,
  options?: KyselyCancelOptions,
): CancelablePromise<{ rows: R[] }> {
  return cancelify(({ getSignal }) =>
    fragment.execute(db, {
      signal: getSignal(),
      inflightQueryAbortStrategy: options?.inflightQueryAbortStrategy ?? DEFAULT_STRATEGY,
    }),
  )();
}

/**
 * Bound factory mirroring an ORM "fork-scoped default signal" without threading a signal.
 */
export function makeKyselyRunner(defaults: KyselyCancelOptions = {}) {
  const options = { inflightQueryAbortStrategy: defaults.inflightQueryAbortStrategy ?? DEFAULT_STRATEGY };
  return {
    run: <R>(query: Executable<R>) => executeCancelable(query, options),
    runTakeFirst: <R>(query: TakeFirstExecutable<R>) => executeTakeFirstCancelable(query, options),
    transaction: <DB, T>(db: Kysely<DB>, body: (trx: Transaction<DB>) => Promise<T>) =>
      transactionCancelable(db, body, options),
  };
}

/**
 * Runs a transaction, and rejects the caller when canceled.
 *
 * `transaction().execute()` takes no options, so there is no transaction-level signal to thread.
 * Cancel settles the returned promise and nothing more: the body keeps running and the transaction
 * commits. To stop the statements themselves, cancel the queries inside the body. Their rejection
 * reaches kysely, which rolls the transaction back.
 *
 * `_options` is unused for that reason. It stays so the three per-query helpers and this one take
 * the same arguments.
 */
export function transactionCancelable<DB, T>(
  db: Kysely<DB>,
  body: (trx: Transaction<DB>) => Promise<T>,
  _options?: KyselyCancelOptions,
): CancelablePromise<T> {
  return cancelify(() => db.transaction().execute(body))();
}
