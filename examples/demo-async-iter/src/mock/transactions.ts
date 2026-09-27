import { sleep } from '@shared/util';

export interface Transaction {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
}

const SEED: Transaction[] = [
  { id: 'tx-1', amount: 100, status: 'completed' },
  { id: 'tx-2', amount: -50, status: 'completed' },
  { id: 'tx-3', amount: 200, status: 'pending' },
  { id: 'tx-4', amount: -150, status: 'failed' },
  { id: 'tx-5', amount: 500, status: 'completed' },
  { id: 'tx-6', amount: -300, status: 'completed' },
];

const ARCHIVED: Transaction[] = [
  { id: 'tx-archived-1', amount: 1000, status: 'completed' },
  { id: 'tx-archived-2', amount: -500, status: 'completed' },
];

let streamClosedResolvers: Array<() => void> = [];

/** Test hook: returns a promise that settles on next transactionStream finally. */
export function waitForStreamClosed(): Promise<void> {
  return new Promise((resolve) => {
    streamClosedResolvers.push(resolve);
  });
}

/**
 * Async generator yielding transactions one at a time. Each item takes ~30ms, simulating a
 * slow external data source (database cursor, paginated API). The finally block logs cleanup
 * so you can see when the source is properly closed by cancellation or break.
 */
export async function* transactionStream(log?: (msg: string) => void): AsyncGenerator<Transaction> {
  try {
    for (const tx of SEED) {
      log?.(`pulling: ${tx.id}`);
      await sleep(30);
      yield tx;
    }
  } finally {
    log?.('stream closed');
    const resolvers = streamClosedResolvers;
    streamClosedResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }
}

/** A second source for static-composition demos (concat, zip). No latency. */
export async function* archivedStream(): AsyncGenerator<Transaction> {
  for (const tx of ARCHIVED) {
    await sleep(10);
    yield tx;
  }
}
