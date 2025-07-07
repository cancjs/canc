// Manual cancAsync(fn, ctx) wiring — the pattern @cancjs/decorators wraps as sugar.
// Works everywhere (no decorator transform required), so this is the one decorator-flavor
// example that runs directly under plain node. See decorators/*.ts for the three decorator
// flavors themselves (stage-3, TS legacy, babel legacy) — those need a matching compiler/
// transform to execute and are meant to be read and copied into a project with that toolchain,
// not run standalone here.
//
// Run: node examples/decorators/manual-wiring.js

const { async: cancAsync, await: cancAwait } = require('@cancjs/coroutine');
const { CancelablePromise, CancelError } = require('@cancjs/promise');

function delay(value, ms) {
 return new CancelablePromise((resolve) => {
 const t = setTimeout(() => resolve(value), ms);
 return () => clearTimeout(t);
 });
}

class Loader {
 constructor() {
 // Per-instance, own property — equivalent to `@AsyncMethod({ bind: true })`.
 // Safe to detach: pass `loader.load` around as a bare callback.
 this.load = cancAsync(this.load, this);
 }

 *load(url) {
 const data = yield* cancAwait(delay(`data from ${url}`, 20));
 return data;
 }
}

// Proto-level manual equivalent — wrap once, outside the constructor, no per-instance cost.
// Equivalent to `@AsyncMethod()` (bind:false, the default).
class ProtoLoader {
 *load(url) {
 const data = yield* cancAwait(delay(`proto data from ${url}`, 20));
 return data;
 }
}
ProtoLoader.prototype.load = cancAsync(ProtoLoader.prototype.load);

const loader = new Loader();
loader.load('/api/foo').then((data) => console.log('bound:', data));

const protoLoader = new ProtoLoader();
const detached = protoLoader.load; // late-bound: works because it flows from call site here
detached.call(protoLoader, '/api/bar').then((data) => console.log('proto:', data));

const cancelable = loader.load('/api/baz');
cancelable.catch((err) => {
 if (err instanceof CancelError) {
 console.log('load canceled');
 return;
 }
 throw err;
});
cancelable.cancel();
