// React unmount-cancel: cancel in-flight requests when a component unmounts, instead of
// guarding every `setState` call with an `isUnmounted` flag or manual AbortController plumbing.
// This repo has no React dependency, so this file documents the pattern — copy it into a React
// project (with @cancjs/promise installed) rather than running it here.

import { useEffect, useState } from 'react';
import { CancelablePromise, suppressCancel } from '@cancjs/promise';

// BAD: no cancellation at all. setState can fire after unmount, requests keep running.
function BadExample({ id }) {
 const [state, setState] = useState(null);

 useEffect(() => {
 Promise.all([getFoo(id), getBar(id)])
 .then(([foo, bar]) => {
 setState({ foo, bar });
 return getBaz(foo, bar);
 })
 .then((baz) => {
 setState((s) => ({ ...s, baz }));
 });
 }, [id]);

 return state && <pre>{JSON.stringify(state)}</pre>;
}

// NOT BAD: AbortController plus a manual isUnmounted flag. Works, but every step needs its own
// guard and the two mechanisms (signal for the request, flag for setState) are separate.
function NotBadExample({ id }) {
 const [state, setState] = useState(null);

 useEffect(() => {
 const controller = new AbortController();
 let isUnmounted = false;

 Promise.all([
 getAbortableFoo(id, { signal: controller.signal }),
 getAbortableBar(id, { signal: controller.signal }),
 ])
 .then(([foo, bar]) => {
 setState({ foo, bar });
 return getBaz(foo, bar);
 })
 .then((baz) => {
 if (!isUnmounted) {
 setState((s) => ({ ...s, baz }));
 }
 })
 .catch((err) => {
 if (err?.name !== 'AbortError') {
 throw err;
 }
 });

 return function cleanup() {
 controller.abort();
 isUnmounted = true;
 };
 }, [id]);

 return state && <pre>{JSON.stringify(state)}</pre>;
}

// NICE: one cancelable chain, one cleanup call. Cancellation propagates through `all` to both
// requests and down through `getBaz`; `suppressCancel` treats the resulting CancelError as a
// normal (silent) outcome instead of an error to rethrow.
function NiceExample({ id }) {
 const [state, setState] = useState(null);

 useEffect(() => {
 const promise = CancelablePromise.all([getCancelableFoo(id), getCancelableBar(id)])
 .then(([foo, bar]) => {
 setState({ foo, bar });
 return getBaz(foo, bar);
 })
 .then((baz) => {
 setState((s) => ({ ...s, baz }));
 })
 .catch(suppressCancel);

 return promise.cancel;
 }, [id]);

 return state && <pre>{JSON.stringify(state)}</pre>;
}

export { BadExample, NotBadExample, NiceExample };
