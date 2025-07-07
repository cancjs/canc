// Babel legacy decorators (`@babel/plugin-proposal-decorators` with `legacy: true`, plus
// `@babel/plugin-proposal-class-properties` in loose mode for field support).
// Requires that Babel config to run; not executed standalone here.

import { BabelLegacyAsyncMethod, BabelLegacyBindMethod } from '@cancjs/decorators';
import { await as cancAwait } from '@cancjs/coroutine';

class Loader {
 @BabelLegacyAsyncMethod() // proto-level (default)
 *load(url) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }

 @BabelLegacyBindMethod() // per-instance, safe to detach
 *loadBound(url) {
 const data = yield* cancAwait(fetch(url));
 return data;
 }
}

const loader = new Loader();
const task = loader.load('/api/foo');
task.cancel();
