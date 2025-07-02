'use strict';

/**
 * Macro / real-world suite.
 *
 * Micro-benchmarks measure a single promise op in a tight loop; they lie
 * about real apps. This suite times two *simulated application flows* end to end
 * and reports numbers in the framing the README actually needs:
 *
 * - overhead per operation in microseconds, and % vs native
 * - retained memory per 1000 in-flight operations
 *
 * Flows (all local, no real network — resolution driven by setImmediate so the
 * microtask/macrotask interleaving resembles real async I/O):
 *
 * 1. mock-fetch waterfall: 5 sequential "requests" then 3 parallel ones
 * (a classic load-page-then-fan-out shape). 30% of runs are canceled
 * mid-flight (simulating a user navigating away / aborting).
 *
 * 2. component-lifecycle: mount -> fire 3 requests -> unmount, where unmount
 * cancels the 3 in-flight requests. Run 10k times. This is the React/Vue
 * "abort on unmount" pattern that motivates cancelable promises.
 *
 * Implementations compared:
 * - native : native Promise + hand-rolled AbortController wiring
 * - canc : @cancjs/promise CancelablePromise
 * - bluebird : bluebird with { cancellation: true }
 *
 * This suite is self-rendering: it does its own timing/memory sampling and
 * returns markdown + a plain-English summary, rather than going through the
 * ops/sec tinybench path in lib/run-suite.js (which can't express overhead-µs
 * or per-1k-memory). cli.js delegates to the exported `run()`.
 */

const { CancelablePromise, isCancelError } = require('@cancjs/promise');
const Bluebird = require('bluebird');
const { captureEnv } = require('../lib/env');

Bluebird.config({ cancellation: true });

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const WATERFALL_RUNS = 20000; // waterfall flow iterations per impl
const WATERFALL_CANCEL_RATE = 0.3; // 30% canceled mid-flight
const LIFECYCLE_RUNS = 10000; // component-lifecycle iterations per impl
const LIFECYCLE_REQUESTS = 3; // requests fired per mount
const WARMUP_FRACTION = 0.1; // fraction of runs used as un-timed warmup
const INFLIGHT_SAMPLE = 1000; // promises held live for memory-per-1k

// A deterministic PRNG so the "30% canceled" decisions are identical across
// impls (fair comparison) and stable across runs (reproducible numbers).
function makeRng(seed) {
 let s = seed >>> 0;
 return function next() {
 // xorshift32
 s ^= s << 13;
 s ^= s >>> 17;
 s ^= s << 5;
 s >>>= 0;
 return s / 0xffffffff;
 };
}

// ---------------------------------------------------------------------------
// Flow factories — one object per implementation. Each exposes:
// waterfall(cancelMidFlight) -> Promise settling when the flow is done/aborted
// lifecycle() -> Promise settling after mount+requests+unmount
// inflight() -> { promises: [...], cancelAll() } for memory
// Every impl swallows its own cancellation so the harness loop never rejects.
// ---------------------------------------------------------------------------

// resolve on the macrotask queue, like a real async request completing.
function laterNative(value) {
 return new Promise((resolve) => setImmediate(() => resolve(value)));
}

const impls = {
 // Native Promise + hand-rolled AbortController. This is the honest baseline:
 // what you write today if you want cancellation without a library. Note the
 // manual ceremony (signal checks, listener wiring) — that's the point.
 native: {
 name: 'native (Promise + AbortController)',

 request(signal, value) {
 return new Promise((resolve, reject) => {
 if (signal.aborted) {
 reject(signal.reason || new DOMExceptionLike());
 return;
 }
 const t = setImmediate(() => {
 signal.removeEventListener('abort', onAbort);
 resolve(value);
 });
 function onAbort() {
 clearImmediate(t);
 reject(signal.reason || new DOMExceptionLike());
 }
 signal.addEventListener('abort', onAbort, { once: true });
 });
 },

 async waterfall(cancelMidFlight) {
 const ac = new AbortController();
 const flow = (async () => {
 let acc = 0;
 for (let i = 0; i < 5; i++) {
 acc += await this.request(ac.signal, i);
 }
 const parallel = await Promise.all([
 this.request(ac.signal, acc),
 this.request(ac.signal, acc + 1),
 this.request(ac.signal, acc + 2),
 ]);
 return parallel;
 })();
 if (cancelMidFlight) {
 // abort during the sequential phase
 setImmediate(() => ac.abort());
 }
 return flow.catch(swallowAbort);
 },

 lifecycle() {
 const ac = new AbortController();
 const reqs = [];
 for (let i = 0; i < LIFECYCLE_REQUESTS; i++) {
 reqs.push(this.request(ac.signal, i).catch(swallowAbort));
 }
 // unmount: cancel everything in-flight
 ac.abort();
 return Promise.all(reqs);
 },

 inflight() {
 const ac = new AbortController();
 const promises = [];
 for (let i = 0; i < INFLIGHT_SAMPLE; i++) {
 promises.push(this.request(ac.signal, i).catch(swallowAbort));
 }
 return { promises, cancelAll: () => ac.abort() };
 },
 },

 // canc: cancellation is a first-class rejection; no manual signal plumbing.
 canc: {
 name: 'canc (CancelablePromise)',

 request(value) {
 return new CancelablePromise((resolve, reject, onCancel) => {
 const t = setImmediate(() => resolve(value));
 onCancel(() => clearImmediate(t));
 });
 },

 async waterfall(cancelMidFlight) {
 const root = this.request(0);
 const flow = root
 .then(async (first) => {
 let acc = first;
 for (let i = 1; i < 5; i++) {
 acc += await this.request(i);
 }
 return CancelablePromise.all([
 this.request(acc),
 this.request(acc + 1),
 this.request(acc + 2),
 ]);
 });
 if (cancelMidFlight) {
 setImmediate(() => root.cancel());
 }
 return flow.catch(swallowCancel);
 },

 lifecycle() {
 const reqs = [];
 for (let i = 0; i < LIFECYCLE_REQUESTS; i++) {
 reqs.push(this.request(i));
 }
 // unmount: cancel each in-flight request
 const guarded = reqs.map((p) => p.catch(swallowCancel));
 for (const p of reqs) p.cancel();
 return Promise.all(guarded);
 },

 inflight() {
 const promises = [];
 for (let i = 0; i < INFLIGHT_SAMPLE; i++) {
 promises.push(this.request(i));
 }
 const guarded = promises.map((p) => p.catch(swallowCancel));
 return {
 promises: promises.concat(guarded),
 cancelAll: () => {
 for (const p of promises) p.cancel();
 },
 };
 },
 },

 // bluebird: library cancellation, opt-in via config. onCancel handler shape
 // mirrors canc; cancel() propagates down the chain like canc.
 bluebird: {
 name: 'bluebird (cancellation:true)',

 request(value) {
 return new Bluebird((resolve, reject, onCancel) => {
 const t = setImmediate(() => resolve(value));
 onCancel(() => clearImmediate(t));
 });
 },

 async waterfall(cancelMidFlight) {
 const root = this.request(0);
 const flow = root.then(async (first) => {
 let acc = first;
 for (let i = 1; i < 5; i++) {
 acc += await this.request(i);
 }
 return Bluebird.all([
 this.request(acc),
 this.request(acc + 1),
 this.request(acc + 2),
 ]);
 });
 if (cancelMidFlight) {
 setImmediate(() => root.cancel());
 }
 // bluebird cancellation makes the chain never settle (by design), so we
 // race a resolved sentinel to keep the harness loop moving.
 return Bluebird.race([flow, markCanceledLater(cancelMidFlight)]).catch(swallowAll);
 },

 // NOTE: bluebird's lifecycle number is NOT comparable to native/canc.
 // A canceled bluebird promise never settles (documented design), so we
 // cannot await it to completion the way the mount/unmount pattern needs.
 // We still time the cancel work (which happens synchronously in cancel())
 // plus a tick, but the harness marks this flow non-comparable rather than
 // pretending it did equivalent await-to-settle work.
 lifecycleComparable: false,
 lifecycle() {
 const reqs = [];
 for (let i = 0; i < LIFECYCLE_REQUESTS; i++) {
 reqs.push(this.request(i));
 }
 for (const p of reqs) p.cancel();
 return new Promise((resolve) => setImmediate(resolve));
 },

 inflight() {
 const promises = [];
 for (let i = 0; i < INFLIGHT_SAMPLE; i++) {
 promises.push(this.request(i));
 }
 return {
 promises,
 cancelAll: () => {
 for (const p of promises) p.cancel();
 },
 };
 },
 },
};

// A canceled bluebird promise never settles; when we know a run is canceled we
// resolve after a tick so the harness can time the cancel path fairly.
function markCanceledLater(canceled) {
 if (!canceled) return new Bluebird(() => {}); // never resolves; loses the race
 return new Bluebird((resolve) => setImmediate(resolve));
}

class DOMExceptionLike extends Error {
 constructor() {
 super('The operation was aborted');
 this.name = 'AbortError';
 }
}

function swallowAbort(err) {
 if (err && (err.name === 'AbortError' || err instanceof DOMExceptionLike)) return;
 throw err;
}
function swallowCancel(err) {
 if (isCancelError(err)) return;
 throw err;
}
function swallowAll() {
 /* macro flow, any settle is fine */
}

// ---------------------------------------------------------------------------
// Timing + memory
// ---------------------------------------------------------------------------

async function timeFlow(runOne, total, opsPerRun, seed) {
 const rng = makeRng(seed);
 const warmup = Math.floor(total * WARMUP_FRACTION);

 // Warmup (untimed) — let V8 tier up.
 for (let i = 0; i < warmup; i++) {
 await runOne(rng() < WATERFALL_CANCEL_RATE);
 }

 const rng2 = makeRng(seed ^ 0x9e3779b9);
 const start = process.hrtime.bigint();
 for (let i = 0; i < total; i++) {
 await runOne(rng2() < WATERFALL_CANCEL_RATE);
 }
 const end = process.hrtime.bigint();

 const totalNs = Number(end - start);
 const totalOps = total * opsPerRun;
 const usPerOp = totalNs / 1000 / totalOps;
 const usPerRun = totalNs / 1000 / total;
 return { usPerOp, usPerRun, totalMs: totalNs / 1e6, runs: total };
}

async function measureMemoryPer1k(impl) {
 if (typeof global.gc !== 'function') {
 return { supported: false };
 }
 // settle any prior work, collect.
 await new Promise((r) => setImmediate(r));
 global.gc();
 global.gc();
 const before = process.memoryUsage().heapUsed;

 const { promises, cancelAll } = impl.inflight();
 // hold them in-flight; measure retained heap while pending.
 const after = process.memoryUsage().heapUsed;

 const bytesPer1k = ((after - before) / INFLIGHT_SAMPLE) * 1000;

 // clean up so the next impl starts fair.
 cancelAll();
 await Promise.all(
 promises.map((p) => (p && typeof p.then === 'function' ? p.then(noop, noop) : null))
 );
 void promises;
 global.gc();

 return { supported: true, bytesPer1k, kbPer1k: bytesPer1k / 1024 };
}

function noop() {}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
 const env = captureEnv();
 const results = {};

 const order = ['native', 'canc', 'bluebird'];

 for (const key of order) {
 const impl = impls[key];

 const waterfall = await timeFlow(
 (cancel) => impl.waterfall(cancel),
 WATERFALL_RUNS,
 8, // 5 sequential + 3 parallel "requests" per run
 0x1234567 + key.length
 );

 const lifecycle = await timeFlow(
 () => impl.lifecycle(),
 LIFECYCLE_RUNS,
 LIFECYCLE_REQUESTS,
 0x7654321 + key.length
 );

 const memory = await measureMemoryPer1k(impl);

 results[key] = {
 name: impl.name,
 waterfall,
 lifecycle,
 lifecycleComparable: impl.lifecycleComparable !== false,
 memory,
 };
 }

 const result = {
 suite: 'macro-realworld',
 env,
 params: {
 waterfallRuns: WATERFALL_RUNS,
 waterfallCancelRate: WATERFALL_CANCEL_RATE,
 lifecycleRuns: LIFECYCLE_RUNS,
 lifecycleRequests: LIFECYCLE_REQUESTS,
 inflightSample: INFLIGHT_SAMPLE,
 },
 results,
 };

 const md = toMarkdown(result);
 return { result, md };
}

// ---------------------------------------------------------------------------
// Markdown + plain-English summary
// ---------------------------------------------------------------------------

function pct(value, base) {
 if (base === 0) return 'n/a';
 const p = ((value - base) / base) * 100;
 const sign = p >= 0 ? '+' : '';
 return `${sign}${p.toFixed(1)}%`;
}

function toMarkdown(result) {
 const { env, params, results } = result;
 const order = Object.keys(results);
 const nativeW = results.native.waterfall.usPerOp;
 const nativeL = results.native.lifecycle.usPerOp;

 const lines = [];
 lines.push('## Suite: macro-realworld');
 lines.push('');
 lines.push(
 `Node ${env.node} · ${env.platform}/${env.arch} · ${env.cpuModel} (${env.cpuCount} cores) · ${env.timestamp}`
 );
 lines.push('');
 lines.push(
 `Flows: waterfall (5 sequential + 3 parallel requests, ${Math.round(
 params.waterfallCancelRate * 100
 )}% canceled mid-flight) × ${params.waterfallRuns.toLocaleString()} · ` +
 `component-lifecycle (mount → ${params.lifecycleRequests} requests → unmount-cancel) × ${params.lifecycleRuns.toLocaleString()}.`
 );
 lines.push('');
 lines.push('### Waterfall — overhead per request operation');
 lines.push('');
 lines.push('| Impl | µs/op | vs native | µs/run | total ms |');
 lines.push('|------|------:|----------:|-------:|---------:|');
 for (const key of order) {
 const w = results[key].waterfall;
 lines.push(
 `| ${results[key].name} | ${w.usPerOp.toFixed(3)} | ${
 key === 'native' ? '—' : pct(w.usPerOp, nativeW)
 } | ${w.usPerRun.toFixed(3)} | ${w.totalMs.toFixed(0)} |`
 );
 }
 lines.push('');
 lines.push('### Component-lifecycle — overhead per request operation');
 lines.push('');
 lines.push('| Impl | µs/op | vs native | µs/run | total ms |');
 lines.push('|------|------:|----------:|-------:|---------:|');
 let anyNonComparable = false;
 for (const key of order) {
 const l = results[key].lifecycle;
 const comparable = results[key].lifecycleComparable;
 if (!comparable) anyNonComparable = true;
 const vs = key === 'native' ? '—' : comparable ? pct(l.usPerOp, nativeL) : 'n/c*';
 const label = comparable ? results[key].name : `${results[key].name}*`;
 lines.push(
 `| ${label} | ${l.usPerOp.toFixed(3)} | ${vs} | ${l.usPerRun.toFixed(3)} | ${l.totalMs.toFixed(0)} |`
 );
 }
 lines.push('');
 if (anyNonComparable) {
 lines.push(
 '\\* Not comparable: a canceled bluebird promise never settles by design, so its ' +
 'lifecycle flow cannot be awaited to completion like native/canc — only the ' +
 'synchronous cancel work is timed.'
 );
 lines.push('');
 }
 lines.push('### Memory — retained heap per 1000 in-flight requests');
 lines.push('');
 const memSupported = order.some((k) => results[k].memory.supported);
 if (memSupported) {
 lines.push('| Impl | MB / 1k in-flight |');
 lines.push('|------|------------------:|');
 for (const key of order) {
 const m = results[key].memory;
 lines.push(
 `| ${results[key].name} | ${m.supported ? (m.kbPer1k / 1024).toFixed(2) : 'n/a'} |`
 );
 }
 } else {
 lines.push('_Memory not measured — run with `node --expose-gc` for per-1k heap numbers._');
 }
 lines.push('');
 lines.push('### Summary');
 lines.push('');
 lines.push(buildSummary(result));
 lines.push('');
 return lines.join('\n');
}

/**
 * Plain-English, user-meaningful summary. One paragraph, README-embeddable.
 * Framed around the real question: "what does canc cost in a real app?"
 */
function buildSummary(result) {
 const { results } = result;
 const nW = results.native.waterfall.usPerOp;
 const cW = results.canc.waterfall.usPerOp;
 const nL = results.native.lifecycle.usPerOp;
 const cL = results.canc.lifecycle.usPerOp;

 const wDelta = ((cW - nW) / nW) * 100;
 const lDelta = ((cL - nL) / nL) * 100;
 const wAbs = cW - nW;

 const bbW = results.bluebird.waterfall.usPerOp;
 const bbDelta = ((bbW - nW) / nW) * 100;

 const cMem = results.canc.memory;
 const nMem = results.native.memory;

 // Direction word from the sign; magnitude bucket from the size. No canned
 // conclusion — the sentence follows whatever the numbers actually say.
 const dir = (delta) => (delta <= 0 ? 'faster than' : 'slower than');
 const bucket = (delta) => {
 const a = Math.abs(delta);
 if (a < 5) return 'about even with';
 if (a < 30) return 'modestly ' + (delta <= 0 ? 'ahead of' : 'behind');
 if (a < 150) return 'meaningfully ' + (delta <= 0 ? 'ahead of' : 'behind');
 return 'far ' + (delta <= 0 ? 'ahead of' : 'behind');
 };

 let mem = '';
 if (cMem.supported && nMem.supported) {
 const memDelta = cMem.kbPer1k - nMem.kbPer1k;
 const memWord =
 memDelta <= 0 ? 'no more heap' : `about ${(memDelta / 1024).toFixed(1)} MB more heap`;
 mem =
 ` Holding 1,000 requests in flight, canc retains ${memWord} per 1,000 than the hand-rolled ` +
 `AbortController baseline (${(cMem.kbPer1k / 1024).toFixed(1)} MB vs ${(
 nMem.kbPer1k / 1024
 ).toFixed(1)} MB per 1k).`;
 } else {
 mem = ' (Run with `node --expose-gc` to also see per-1,000-in-flight memory.)';
 }

 const wPhrase =
 Math.abs(wDelta) < 5
 ? `about even with native (${wDelta >= 0 ? '+' : ''}${wDelta.toFixed(0)}%, ~${Math.abs(
 wAbs
 ).toFixed(2)} µs per request)`
 : `${Math.abs(wDelta).toFixed(0)}% ${dir(wDelta)} native (~${Math.abs(wAbs).toFixed(
 2
 )} µs extra per request)`;

 const lPhrase =
 `${bucket(lDelta)} native on the cancel-heavy lifecycle flow ` +
 `(${lDelta >= 0 ? '+' : ''}${lDelta.toFixed(0)}%)`;

 // Honest bottom line: costs are real and grow with cancel density. The value
 // proposition is correctness/ergonomics stated as a trade-off — not a claim
 // that canc is free.
 const bottom =
 Math.abs(wDelta) < 5 && Math.abs(lDelta) < 30
 ? `Bottom line: on request-shaped async work the overhead is small relative to the async ` +
 `gaps themselves, so the choice comes down to ergonomics and correctness rather than throughput.`
 : `Bottom line: cancelable promises are not free — the cost is a real per-operation tax that ` +
 `grows with how much cancellation the flow does (see the lifecycle row) — but it buys real, ` +
 `try/catch-native cancellation without the manual AbortController plumbing the baseline needs. ` +
 `For I/O-bound flows the tax is dwarfed by network and timer latency; for hot, cancel-dense ` +
 `loops it is worth measuring against your own budget.`;

 return (
 `In a simulated app — a 5-then-3 request waterfall and a mount/unmount-cancel component ` +
 `lifecycle — canc's cancelable promises come out ${wPhrase} on the waterfall and are ${lPhrase}, ` +
 `while giving you cancellation as a first-class rejection instead of hand-rolled AbortController ` +
 `wiring. Bluebird's cancellation runs ${Math.abs(bbDelta).toFixed(0)}% ${dir(bbDelta)} native on ` +
 `the same waterfall (its lifecycle flow is not directly comparable — canceled bluebird promises ` +
 `never settle).${mem} ${bottom}`
 );
}

module.exports = {
 name: 'macro-realworld',
 run,
 // exported for reuse/testing
 _internal: { impls, timeFlow, buildSummary, toMarkdown },
};

// tiny guard so an accidental direct `node suites/macro-realworld.js` still works
if (require.main === module) {
 run()
 .then(({ md }) => {
 // eslint-disable-next-line no-console
 console.log(md);
 })
 .catch((err) => {
 // eslint-disable-next-line no-console
 console.error(err);
 process.exitCode = 1;
 });
}
