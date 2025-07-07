// TS legacy decorators (`experimentalDecorators: true`).
// Type-checks against this repo's own `tsconfig.legacy.json` shape; not executed standalone here.

import { LegacyAsyncMethod, LegacyBindMethod } from '@cancjs/decorators';
import { await as cancAwait } from '@cancjs/coroutine';

class Loader {
 @LegacyAsyncMethod() // proto-level (default)
 *load(url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }

 @LegacyBindMethod() // per-instance, safe to detach
 *loadBound(url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }
}

// TS sees the declared generator return type, not what the decorator produces at runtime
// (decorators can't change a method's static signature) — cast at the call site, same as any
// other decorator-transformed member.
import type { CancelablePromise } from '@cancjs/promise';

const loader = new Loader();
const task = loader.load('/api/foo') as unknown as CancelablePromise<Response>;
task.cancel();
