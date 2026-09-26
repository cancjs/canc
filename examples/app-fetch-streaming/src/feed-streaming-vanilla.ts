import { fetchFeedPage } from './mock/feed-api';

// 1. A plain generator that produces items, hand-wiring cancellation.
export async function* fetchFeedVanilla(signal?: AbortSignal) {
  let cursor: number | null = 0;
  do {
    // keeps running after the user left (wasted work)
    if (signal?.aborted) throw signal.reason;
    const page = await fetchFeedPage(cursor, signal);

    for (const item of page.items) {
      if (signal?.aborted) throw signal.reason;
      yield item;
    }

    // keeps running after the user left (wasted work)
    cursor = page.nextCursor;
  } while (cursor !== null);
}

// 2. A consumer that processes the stream until it finds what it needs.
export async function consumeFeedVanilla(signal: AbortSignal) {
  let count = 0;

  try {
    for await (const item of fetchFeedVanilla(signal)) {
      if (signal.aborted) throw signal.reason;

      console.log(`[vanilla] Consumed: ${item.action}`);
      count++;

      // Stop early after 15 items
      if (count >= 15) {
        console.log(`[vanilla] Found what we needed. Stopping.`);
        break;
      }
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') throw err;
    console.log(`[vanilla] Caught abort error in consumer.`);
  }
}
