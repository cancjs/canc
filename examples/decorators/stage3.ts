// ES / TC39 stage-3 decorators (native, TS 5+, `experimentalDecorators: false`).
// Requires a compiler with stage-3 decorator support to run (TS 5+, or a matching Babel preset).
// Type-checks against this repo's own `tsconfig.stage3.json` shape; not executed standalone here.

import { AsyncMethod, BindMethod } from '@cancjs/decorators';
import { await as cancAwait } from '@cancjs/coroutine';

class Loader {
 @AsyncMethod() // proto-level (default): `this` flows from call site
 *load(url: string) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }

 @BindMethod() // per-instance: safe to detach, e.g. onClick={loader.loadBound}
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
