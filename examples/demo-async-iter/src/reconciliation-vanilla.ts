// Vanilla async iteration: plain for-await loops, no cancellation support.
// Compare side-by-side with reconciliation-canc.ts to see the difference.

// --- setup

import { sleep } from '@shared/util';

import { archivedStream, Transaction, transactionStream } from './mock/transactions';
import { formatTx, getAmount, isPositive, sumAmounts } from './reconciliation-shared';

// --- compose

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
      await sleep(5);
      result.push(formatTx(tx));
    }
  }
  return result;
}

// --- consume

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

// scenario 5 (bonus): helper pipeline with take
export async function topPositiveIds(_log?: (msg: string) => void): Promise<string[]> {
  // (no vanilla counterpart: take(n) operator requires stream composition and automatic
  // source closing, which cannot be modeled side-by-side with vanilla loops without
  // extensive boilerplate)
  return [];
}
