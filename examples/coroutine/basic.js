// cancAsync/cancAwait: async..await replacement built on generators, cancelable.
// Run: node examples/coroutine/basic.js

const { async: cancAsync, await: cancAwait } = require('@cancjs/coroutine');
const { CancelablePromise, CancelError } = require('@cancjs/promise');

function delay(value, ms) {
 return new CancelablePromise((resolve) => {
 const t = setTimeout(() => resolve(value), ms);
 return () => clearTimeout(t);
 });
}

const loadFooBar = cancAsync(function* () {
 const foo = yield* cancAwait(delay('foo', 20));
 const bar = yield* cancAwait(delay('bar', 20));
 return { foo, bar };
});

const task = loadFooBar();

task
 .then((result) => console.log('loaded:', result))
 .catch((err) => {
 if (err instanceof CancelError) {
 console.log('load canceled');
 return;
 }
 throw err;
 });

// Cancel while still waiting on `bar` — `foo` already resolved, coroutine unwinds cleanly.
setTimeout(() => task.cancel(), 30);
