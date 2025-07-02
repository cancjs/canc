'use strict';

/**
 * P3-2 micro benchmark suites. Isolated hot-path costs of CancelablePromise vs
 * native Promise vs bluebird. NOT representative of real apps —
 * see macro suite (P3-3) for that. µbenchmarks lie; treat these as relative
 * signal, not absolute truth.
 *
 * Cases (each: native, CancelablePromise, and bluebird where the API allows):
 * a) construct + resolve (executor) throughput
 * b) then-chain depth 1 / 10 / 100 (build + settle)
 * c) fanout: 1 promise, 100 then children
 * d) all / race width 10 / 1000
 * e) cancel storm: build depth-50 chain, cancel root (canc + bluebird only —
 * native Promise has no cancellation)
 * f) coroutine step loop vs native async/await (cancAsync vs async fn, 100 awaits)
 * g) allocation pressure: 10k promises, heapUsed delta + GC count
 * (run via `node --expose-gc suites/micro.js`; perf_hooks GC observer)
 *
 * Deopt discipline: every case is monomorphic — a case never mixes impls or
 * feeds a callback polymorphic inputs. Each impl gets its own case so V8 keeps
 * the call sites monomorphic and the numbers comparable.
 */

const { CancelablePromise, async: cancAsync, await: cancAwait } = require('../../packages/canc-promise/dist/index.cjs');
const Bluebird = require('bluebird');

// bluebird cancellation is opt-in and global; enable once so case (e) works.
Bluebird.config({ cancellation: true });

// ---------------------------------------------------------------------------
// helpers (kept monomorphic per impl — no shared polymorphic call sites)
// ---------------------------------------------------------------------------

// b) then-chain of a given depth, returns the tail promise (settled).
function nativeChain(depth) {
 let p = Promise.resolve(0);
 for (let i = 0; i < depth; i++) p = p.then((x) => x + 1);
 return p;
}
function cancChain(depth) {
 let p = CancelablePromise.resolve(0);
 for (let i = 0; i < depth; i++) p = p.then((x) => x + 1);
 return p;
}
function bbChain(depth) {
 let p = Bluebird.resolve(0);
 for (let i = 0; i < depth; i++) p = p.then((x) => x + 1);
 return p;
}

// c) fanout: one root, N independent then children; await all children.
function nativeFanout(width) {
 const root = Promise.resolve(1);
 const kids = new Array(width);
 for (let i = 0; i < width; i++) kids[i] = root.then((x) => x + 1);
 return Promise.all(kids);
}
function cancFanout(width) {
 const root = CancelablePromise.resolve(1);
 const kids = new Array(width);
 for (let i = 0; i < width; i++) kids[i] = root.then((x) => x + 1);
 return CancelablePromise.all(kids);
}
function bbFanout(width) {
 const root = Bluebird.resolve(1);
 const kids = new Array(width);
 for (let i = 0; i < width; i++) kids[i] = root.then((x) => x + 1);
 return Bluebird.all(kids);
}

// d) all/race over an array of already-resolved promises of a given width.
function nativeResolvedArray(width) {
 const a = new Array(width);
 for (let i = 0; i < width; i++) a[i] = Promise.resolve(i);
 return a;
}
function cancResolvedArray(width) {
 const a = new Array(width);
 for (let i = 0; i < width; i++) a[i] = CancelablePromise.resolve(i);
 return a;
}
function bbResolvedArray(width) {
 const a = new Array(width);
 for (let i = 0; i < width; i++) a[i] = Bluebird.resolve(i);
 return a;
}

// e) cancel storm: build a pending depth-N chain, cancel the root, swallow the
// CancelError so the rejection is handled. Only canc + bluebird cancel.
function buildCancChain(depth) {
 let never;
 const root = new CancelablePromise((_resolve) => {
 never = _resolve;
 });
 void never; // never resolved — chain stays pending until cancel
 let tail = root;
 for (let i = 0; i < depth; i++) tail = tail.then((x) => x + 1);
 return { root, tail };
}
function buildBbChain(depth) {
 const root = new Bluebird(() => {
 // never settles
 });
 let tail = root;
 for (let i = 0; i < depth; i++) tail = tail.then((x) => x + 1);
 return { root, tail };
}

// f) coroutine: cancAsync generator doing N awaits vs equivalent async fn.
const AWAITS = 100;

const cancLoop = cancAsync(function* () {
 let acc = 0;
 for (let i = 0; i < AWAITS; i++) {
 acc = yield* cancAwait(CancelablePromise.resolve(acc + 1));
 }
 return acc;
});

async function nativeLoop() {
 let acc = 0;
 for (let i = 0; i < AWAITS; i++) {
 acc = await Promise.resolve(acc + 1);
 }
 return acc;
}

// ---------------------------------------------------------------------------
// tinybench cases (a–f). Each fn returns a promise; tinybench awaits it.
// ---------------------------------------------------------------------------

const cases = [
 // a) construct + resolve throughput
 { name: 'a/construct-resolve native', fn() { return new Promise((res) => res(1)); } },
 { name: 'a/construct-resolve canc', fn() { return new CancelablePromise((res) => res(1)); } },
 { name: 'a/construct-resolve bluebird', fn() { return new Bluebird((res) => res(1)); } },

 // b) then-chain depths
 { name: 'b/chain-1 native', fn() { return nativeChain(1); } },
 { name: 'b/chain-1 canc', fn() { return cancChain(1); } },
 { name: 'b/chain-1 bluebird', fn() { return bbChain(1); } },
 { name: 'b/chain-10 native', fn() { return nativeChain(10); } },
 { name: 'b/chain-10 canc', fn() { return cancChain(10); } },
 { name: 'b/chain-10 bluebird', fn() { return bbChain(10); } },
 { name: 'b/chain-100 native', fn() { return nativeChain(100); } },
 { name: 'b/chain-100 canc', fn() { return cancChain(100); } },
 { name: 'b/chain-100 bluebird', fn() { return bbChain(100); } },

 // c) fanout 1 -> 100 children
 { name: 'c/fanout-100 native', fn() { return nativeFanout(100); } },
 { name: 'c/fanout-100 canc', fn() { return cancFanout(100); } },
 { name: 'c/fanout-100 bluebird', fn() { return bbFanout(100); } },

 // d) all width 10 / 1000
 { name: 'd/all-10 native', fn() { return Promise.all(nativeResolvedArray(10)); } },
 { name: 'd/all-10 canc', fn() { return CancelablePromise.all(cancResolvedArray(10)); } },
 { name: 'd/all-10 bluebird', fn() { return Bluebird.all(bbResolvedArray(10)); } },
 { name: 'd/all-1000 native', fn() { return Promise.all(nativeResolvedArray(1000)); } },
 { name: 'd/all-1000 canc', fn() { return CancelablePromise.all(cancResolvedArray(1000)); } },
 { name: 'd/all-1000 bluebird', fn() { return Bluebird.all(bbResolvedArray(1000)); } },

 // d) race width 10 / 1000
 { name: 'd/race-10 native', fn() { return Promise.race(nativeResolvedArray(10)); } },
 { name: 'd/race-10 canc', fn() { return CancelablePromise.race(cancResolvedArray(10)); } },
 { name: 'd/race-10 bluebird', fn() { return Bluebird.race(bbResolvedArray(10)); } },
 { name: 'd/race-1000 native', fn() { return Promise.race(nativeResolvedArray(1000)); } },
 { name: 'd/race-1000 canc', fn() { return CancelablePromise.race(cancResolvedArray(1000)); } },
 { name: 'd/race-1000 bluebird', fn() { return Bluebird.race(bbResolvedArray(1000)); } },

 // e) cancel storm depth-50 (canc + bluebird only)
 {
 name: 'e/cancel-storm-50 canc',
 fn() {
 const { root, tail } = buildCancChain(50);
 const settled = tail.catch(() => {});
 root.cancel();
 return settled;
 },
 },
 {
 name: 'e/cancel-storm-50 bluebird',
 fn() {
 const { root, tail } = buildBbChain(50);
 // bluebird cancellation does not reject; tail simply never settles, so we
 // just measure the cancel() propagation cost and resolve immediately.
 root.cancel();
 void tail;
 return Bluebird.resolve();
 },
 },

 // f) coroutine loop vs native async/await (100 awaits)
 { name: 'f/coroutine-100 native-async', fn() { return nativeLoop(); } },
 { name: 'f/coroutine-100 canc-cancAsync', fn() { return cancLoop(); } },
];

module.exports = { name: 'micro', cases };

// ---------------------------------------------------------------------------
// g) allocation pressure lane. Not a tinybench ops/s case — it measures heapUsed
// delta + GC count for 10k allocated promises. Requires --expose-gc. Run
// directly: `node --expose-gc suites/micro.js`. Writes micro-alloc.{json,md}.
// ---------------------------------------------------------------------------

const ALLOC_COUNT = 10000;

function measureAllocation(label, make) {
 const { PerformanceObserver } = require('perf_hooks');

 let gcCount = 0;
 const obs = new PerformanceObserver((list) => {
 gcCount += list.getEntries().length;
 });
 obs.observe({ entryTypes: ['gc'], buffered: false });

 global.gc();
 const before = process.memoryUsage().heapUsed;

 // Hold references so the allocation is real and not immediately collected.
 const held = new Array(ALLOC_COUNT);
 for (let i = 0; i < ALLOC_COUNT; i++) {
 held[i] = make(i);
 }

 const after = process.memoryUsage().heapUsed;
 const heapDelta = after - before;

 // Settle/consume so unhandled-rejection machinery doesn't skew things, then
 // let observers flush.
 for (let i = 0; i < ALLOC_COUNT; i++) {
 if (held[i] && typeof held[i].then === 'function') held[i].then(() => {}, () => {});
 }

 obs.disconnect();

 return {
 name: label,
 count: ALLOC_COUNT,
 heapDeltaBytes: heapDelta,
 heapDeltaPerPromise: Math.round(heapDelta / ALLOC_COUNT),
 gcDuringAlloc: gcCount,
 };
}

async function runAllocationLane() {
 if (typeof global.gc !== 'function') {
 console.error('Allocation lane needs --expose-gc. Run: node --expose-gc suites/micro.js');
 process.exitCode = 1;
 return;
 }

 const path = require('path');
 const fs = require('fs');
 const { captureEnv } = require('../lib/env');
 const RESULTS_DIR = path.join(__dirname, '..', 'results');

 // Warm up each impl before measuring so JIT/hidden-class setup isn't charged
 // to the measured allocation.
 const makers = [
 ['native', (i) => Promise.resolve(i)],
 ['canc', (i) => CancelablePromise.resolve(i)],
 ['bluebird', (i) => Bluebird.resolve(i)],
 ];
 for (const [, make] of makers) {
 for (let i = 0; i < 2000; i++) make(i).then(() => {}, () => {});
 }
 await new Promise((r) => setTimeout(r, 50));

 const rows = [];
 for (const [label, make] of makers) {
 global.gc();
 await new Promise((r) => setTimeout(r, 20));
 rows.push(measureAllocation(label, make));
 await new Promise((r) => setTimeout(r, 20));
 }

 const result = { suite: 'micro-alloc', env: captureEnv(), allocation: rows };

 if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
 fs.writeFileSync(
 path.join(RESULTS_DIR, 'micro-alloc.json'),
 JSON.stringify(result, null, 2) + '\n'
 );

 const lines = [];
 lines.push('## Suite: micro-alloc (10k promises)');
 lines.push('');
 lines.push(
 `Node ${result.env.node} · ${result.env.platform}/${result.env.arch} · ${result.env.cpuModel} (${result.env.cpuCount} cores) · ${result.env.timestamp}`
 );
 lines.push('');
 lines.push('| Impl | count | heap delta (KB) | bytes/promise | GC during alloc |');
 lines.push('|------|------:|----------------:|--------------:|----------------:|');
 for (const r of rows) {
 lines.push(
 `| ${r.name} | ${r.count} | ${(r.heapDeltaBytes / 1024).toFixed(1)} | ${r.heapDeltaPerPromise} | ${r.gcDuringAlloc} |`
 );
 }
 lines.push('');
 const md = lines.join('\n');
 fs.writeFileSync(path.join(RESULTS_DIR, 'micro-alloc.md'), md + '\n');

 console.log(md);
 console.log('\nJSON: ' + path.join(RESULTS_DIR, 'micro-alloc.json'));
}

if (require.main === module) {
 runAllocationLane().catch((err) => {
 console.error(err);
 process.exitCode = 1;
 });
}
