import { attachAbort } from '@shared/util';

export interface Activity {
  id: string;
  user: string;
  action: string;
}

export interface FeedPage {
  items: Activity[];
  nextCursor: number | null;
}

const DB: Activity[] = Array.from({ length: 100 }, (_, i) => ({
  id: `act_${1000 + i}`,
  user: `user_${(i % 5) + 1}`,
  action: `did action ${i}`,
}));

const PAGE_SIZE = 10;
export const FEED_LATENCY_MS = 50;

export async function fetchFeedPage(cursor: number = 0, signal?: AbortSignal): Promise<FeedPage> {
  console.log(`[mock] Fetching feed page starting at offset ${cursor}...`);
  if (signal?.aborted) throw signal.reason;

  let timer: ReturnType<typeof setTimeout>;
  let detach: (() => void) | undefined;

  await new Promise<void>((resolve, reject) => {
    timer = setTimeout(resolve, FEED_LATENCY_MS);
    detach = attachAbort(signal, () => {
      clearTimeout(timer);
      console.log(`[mock] Aborted fetch for offset ${cursor}`);
      reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
    });
  });

  detach?.();

  const end = cursor + PAGE_SIZE;
  const items = DB.slice(cursor, end);
  const nextCursor = end < DB.length ? end : null;

  return { items, nextCursor };
}
