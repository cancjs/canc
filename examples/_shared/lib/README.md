# @shared/lib

Publishable-tidy canc helper code shared by the canc examples. Unlike `@shared/mock-api` and
`@shared/util`, files here are copy targets: each one is written as if it were already a
`@cancjs/*` package, and a reader may copy it into their own project today.

## createPool

Cancel-aware concurrency pool. Runs at most `limit` jobs at once.

```ts
import { createPool } from '@shared/lib';

const pool = createPool(3);
const handle = pool.run(() => fetchPage(url));

// Cancel a single job: if it already started, its cancel() runs; if still queued,
// it is removed from the queue and never starts.
handle.cancel();

// Cancel everything: active jobs are canceled and the queue is dropped.
pool.cancelAll('shutdown');
```

This is a seed for a future `@cancjs/p-limit` package. Copy `src/pool.ts` into your own project
freely: it has no dependency beyond `@cancjs/promise`.
