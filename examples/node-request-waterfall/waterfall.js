// Request waterfall: fetch a user, then fetch that user's posts, cancel mid-chain.
// Run: node examples/node-request-waterfall/waterfall.js

const { CancelablePromise, CancelError } = require('@cancjs/promise');

// Stand-ins for network calls (setTimeout instead of a real fetch, no server needed to run this).
function getUser(id) {
 return new CancelablePromise((resolve) => {
 const t = setTimeout(() => resolve({ id, name: 'ada' }), 30);
 return () => clearTimeout(t);
 });
}

function getPosts(userId) {
 return new CancelablePromise((resolve) => {
 const t = setTimeout(() => resolve([{ id: 1, userId, title: 'hello' }]), 30);
 return () => clearTimeout(t);
 });
}

const waterfall = getUser(1)
 .then((user) => getPosts(user.id))
 .then((posts) => {
 console.log('posts:', posts);
 })
 .catch((err) => {
 if (err instanceof CancelError) {
 console.log('waterfall canceled before completion');
 return;
 }
 throw err;
 });

// Cancel after the first request settles but before the second one resolves.
setTimeout(() => waterfall.cancel(), 40);
