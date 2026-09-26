import * as canc from '@cancjs/coroutine';
import * as cancGen from '@cancjs/coroutine/gen';
import { cancelify } from '@cancjs/toolbox';

import { FeedPage, fetchFeedPage } from './mock/feed-api';

// Cancelify the API boundary ONCE.
const cancelableFetchPage = cancelify(({ getSignal }, cursor?: number) => fetchFeedPage(cursor, getSignal()));

// 1. A coroutine generator producer.
// Uses cancGen.async and yields items from pages. No raw AbortController.
export const fetchFeedCanc = cancGen.async(function* () {
  let cursor: number | null = 0;
  do {
    const page: FeedPage = yield* cancGen.await(cancelableFetchPage(cursor));

    for (const item of page.items) {
      yield item;
    }

    // canceled here — the remaining pages are never fetched.
    cursor = page.nextCursor;
  } while (cursor !== null);
});

// 2. A coroutine consumer that processes the stream and stops early.
export const consumeFeedCanc = canc.async(function* () {
  let count = 0;

  yield* canc.forAwait(fetchFeedCanc(), (item) => {
    console.log(`[canc] Consumed: ${item.action}`);
    count++;

    // Stop early after 15 items
    if (count >= 15) {
      console.log(`[canc] Found what we needed. Stopping.`);
      return false; // Break the consumption stream, canceling the generator upwards
    }
  });
});
