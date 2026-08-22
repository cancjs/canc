// Vanilla async iteration: plain for-await loops, no cancellation support.
// Compare side-by-side with reconciliation-canc.ts to see the difference.

import { archivedStream, Transaction, transactionStream } from './mock/transactions';
import { formatTx, getAmount, isPositive, sumAmounts } from './reconciliation-shared';

// scenario 1: filter and map

/**
 * Filters positive transactions and formats them. Runs to completion: once started, every
 * item is pulled even if the caller no longer needs the result.
 */
export async function filterAndFormat(log?: (msg: string) => void): Promise<string[]> {
  const result: string[] = [];
  // Pulls every item even if nobody is waiting for the result (wasted work).
  for await (const tx of transactionStream(log)) {
    if (isPositive(tx)) {
      result.push(formatTx(tx));
    }
  }
  return result;
}

// scenario 2: three ways to consume

/**
 * Demonstrates find, reduce, some as manual for-await loops.
 */
export async function threeConsumers(log?: (msg: string) => void): Promise<void> {
  // Find: first transaction above 150
  let found: Transaction | undefined;
  for await (const tx of transactionStream(log)) {
    if (tx.amount > 150) {
      found = tx;
      break; // closes the generator, but there is no way to abort in-flight work
    }
  }
  log?.(`find result: ${found?.id}`);

  // Reduce: sum all amounts
  let total = 0;
  for await (const tx of transactionStream(log)) {
    total = sumAmounts(total, getAmount(tx));
  }
  log?.(`reduce total: ${total}`);

  // Some: is there a pending transaction?
  let hasPending = false;
  for await (const tx of transactionStream(log)) {
    if (tx.status === 'pending') {
      hasPending = true;
      break;
    }
  }
  log?.(`some pending: ${hasPending}`);
}

// scenario 3: static source composition

/**
 * Concatenates two streams by consuming them sequentially.
 */
export async function concatStreams(log?: (msg: string) => void): Promise<string[]> {
  const ids: string[] = [];
  for await (const tx of transactionStream(log)) {
    ids.push(tx.id);
  }
  for await (const tx of archivedStream()) {
    ids.push(tx.id);
  }
  return ids;
}

// scenario 4: stream with break

/**
 * Processes items one at a time, stopping when the callback returns false.
 */
export async function streamWithBreak(
  log?: (msg: string) => void,
  onItem?: (tx: Transaction) => boolean,
): Promise<void> {
  for await (const tx of transactionStream(log)) {
    const keepGoing = onItem?.(tx);
    if (keepGoing === false) {
      break;
    }
  }
}

// (no cancellation counterpart: once a for-await loop is running, there is no way for an
// external caller to stop the in-flight await or abort the source from outside the loop)
