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
 * Generic per-query wrapper. Row type inferred from the builder.
 * Note: the inplace cancelify(...)() is required to preserve the R generic.
 */
export function executeCancelable<R>(query: Executable<R>, options?: KyselyCancelOptions): CancelablePromise<R> {
  return cancelify(({ getSignal }) =>
    query.execute({
      signal: getSignal(),
      inflightQueryAbortStrategy: options?.inflightQueryAbortStrategy ?? DEFAULT_STRATEGY,
    }),
  )();
}

/**
 * Take-first variant.
 * Note: the inplace cancelify(...)() is required to preserve the R generic.
 */
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

/**
 * Raw sql fragment variant.
 * Note: the inplace cancelify(...)() is required to preserve the R generic.
 */
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
 * Cancel a whole transaction. Wrapper threads the tx-level signal.
 */
export function transactionCancelable<DB, T>(
  db: Kysely<DB>,
  body: (trx: Transaction<DB>) => Promise<T>,
  _options?: KyselyCancelOptions,
): CancelablePromise<T> {
  return cancelify(({ getSignal }) => (db.transaction() as any).execute(body, { signal: getSignal() }))();
}
