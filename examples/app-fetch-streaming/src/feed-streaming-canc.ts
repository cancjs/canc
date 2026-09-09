import * as canc from '@cancjs/coroutine';
import * as cancGen from '@cancjs/coroutine/gen';
import { cancelify } from '@cancjs/toolbox';

import { FeedPage, fetchFeedPage } from './mock/feed-api';

// Cancelify the API boundary ONCE.
const cancelableFetchPage = cancelify(({ getSignal }, cursor?: number) => fetchFeedPage(cursor, getSignal()));

export const fetchFeedCanc = cancGen.async(function* () {
  let cursor: number | null = 0;
  do {
    const page: FeedPage = yield* cancGen.await(cancelableFetchPage(cursor));

    for (const item of page.items) {
      yield item;
    }

    // when canceled here, the remaining pages are never fetched
    cursor = page.nextCursor;
  } while (cursor !== null);
});

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
