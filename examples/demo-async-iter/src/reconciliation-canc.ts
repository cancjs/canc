// Cancelable async iteration: pipe operators, cancel forwards return() to the source.
// Compare side-by-side with reconciliation-vanilla.ts to see the difference.

// --- setup

import * as canc from '@cancjs/coroutine';
import * as asyncIter from '@cancjs/toolbox/async-iter';
import { sleep } from '@shared/util';

import { archivedStream, Transaction, transactionStream } from './mock/transactions';
import { formatTx, getAmount, isPositive, sumAmounts } from './reconciliation-shared';

// --- compose

// scenario 1: filter and map

/**
 * Filters positive transactions and formats them. Cancelable: canceling the returned promise
 * calls return() on the source generator, stopping it mid-stream. The generator's finally
 * block runs cleanup immediately.
 */
export const filterAndFormat = canc.async(function* (log?: (msg: string) => void) {
  // Generator callback inside map: the sleep becomes a per-item cancel point.
  const enrichAndFormat = function* (tx: Transaction) {
    yield* canc.await(sleep(5));
    return formatTx(tx);
  };

  // canceled here: the pipe stops pulling, source return() fires, stream closes
  const result = yield* canc.await(
    asyncIter.pipe(
      transactionStream(log),
      asyncIter.filter(isPositive),
      asyncIter.map(enrichAndFormat),
      asyncIter.toArray(),
    ),
  );
  return result;
});

// --- consume

// scenario 2: three ways to consume

/**
 * The same find/reduce/some logic as vanilla, but each is a single pipe expression.
 * Three terminate forms: wrapper (from().pipe()), free (pipe()), standalone (op()(pipe())).
 */
export const threeConsumers = canc.async(function* (log?: (msg: string) => void) {
  // Form 1 (wrapper): from(source).pipe(terminal)
  const found = yield* canc.await(
    asyncIter.from(transactionStream(log)).pipe(asyncIter.find((tx: Transaction) => tx.amount > 150)),
  );
  log?.(`find result: ${found?.id}`);

  // Form 2 (free): pipe(source, operators..., terminal)
  const total = yield* canc.await(
    asyncIter.pipe(transactionStream(log), asyncIter.map(getAmount), asyncIter.reduce(sumAmounts, 0)),
  );
  log?.(`reduce total: ${total}`);

  // Form 3 (standalone): terminal(pred)(pipe(source))
  const hasPending = yield* canc.await(
    asyncIter.some((tx: Transaction) => tx.status === 'pending')(asyncIter.pipe(transactionStream(log))),
  );
  log?.(`some pending: ${hasPending}`);
});

// scenario 3: static source composition

/**
 * Concat two streams and collect ids. Cancel stops pulling from whichever source is active.
 */
export const concatStreams = canc.async(function* (log?: (msg: string) => void) {
  const allIds = yield* canc.await(
    asyncIter.pipe(
      asyncIter.concat(transactionStream(log), archivedStream()),
      asyncIter.map((tx: Transaction) => tx.id),
      asyncIter.toArray(),
    ),
  );
  return allIds;
});

// scenario 4: stream with break

/**
 * Processes items one at a time via cancForAwait. A generator callback makes each step
 * cancelable; returning false breaks the stream (same as break in for-await, but the
 * driving coroutine can also be canceled externally).
 */
export const streamWithBreak = canc.async(function* (
  log?: (msg: string) => void,
  onItem?: (tx: Transaction) => boolean,
) {
  const pipeline = asyncIter.pipe(transactionStream(log));

  // canceled here: cancel reaches the source via return(), stream closes
  yield* canc.forAwait(pipeline, (tx: Transaction) => {
    const keepGoing = onItem?.(tx);
    if (keepGoing === false) {
      return false;
    }
  });
});

// scenario 5 (bonus): helper pipeline with take

/**
 * Shows the operator pipeline composing filter + map + take in one expression,
 * collected to array. take(n) stops after n items, closing the source.
 */
export const topPositiveIds = canc.async(function* (log?: (msg: string) => void) {
  const top = yield* canc.await(
    asyncIter.pipe(
      transactionStream(log),
      asyncIter.filter(isPositive),
      asyncIter.map((tx: Transaction) => tx.id),
      asyncIter.take(2),
      asyncIter.toArray(),
    ),
  );
  return top;
});
