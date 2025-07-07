// cancAwait.all/race/any/allSettled: typed combinators for coroutine bodies, mirroring
// CancelablePromise.all/race/any/allSettled but usable with `yield*` inside a cancAsync generator.
// Run: node examples/coroutine/iterator.js

const { async: cancAsync, await: cancAwait } = require('@cancjs/coroutine');
const { CancelablePromise, CancelError } = require('@cancjs/promise');

function delay(value, ms) {
 return new CancelablePromise((resolve) => {
 const t = setTimeout(() => resolve(value), ms);
 return () => clearTimeout(t);
 });
}

const loadAll = cancAsync(function* () {
 const [user, posts] = yield* cancAwait.all([delay({ id: 1 }, 10), delay(['post'], 15)]);
 return { user, posts };
});

const raceFirst = cancAsync(function* () {
 return yield* cancAwait.race([delay('slow', 50), delay('fast', 10)]);
});

loadAll().then((result) => console.log('all:', result));

const race = raceFirst();
race.then((winner) => console.log('race winner:', winner));

// Cancel a still-pending combinator: cancellation propagates to every branch promise.
const pendingAll = cancAsync(function* () {
 return yield* cancAwait.all([delay('a', 100), delay('b', 100)]);
})();

pendingAll.catch((err) => {
 if (err instanceof CancelError) {
 console.log('combinator canceled, all branches unsubscribed');
 return;
 }
 throw err;
});

setTimeout(() => pendingAll.cancel(), 20);
