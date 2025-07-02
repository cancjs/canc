#!/usr/bin/env node
'use strict';

/**
 * Generates docs/benchmarks.md from whatever's in benchmarks/results/*.json.
 *
 * Idempotency requirement (P3-5 accept): running this twice with the same
 * results/ contents must produce byte-identical output. That means NO
 * "generated at <now>" timestamps in the doc body — provenance comes from
 * each suite's own `env.timestamp` (captured once, at bench-run time, and
 * frozen into the result JSON). This script only ever READS results/, never
 * re-runs benches, so re-running it changes nothing.
 *
 * Handles all four result shapes currently produced under results/:
 * - tinybench-style suites (smoke, micro): { suite, env, tasks: [...] }
 * - allocation suite (micro-alloc): { suite, env, allocation: [...] }
 * - macro suite (macro-realworld): { suite, env, params, results: {...} }
 * - browser lane (browser-lane): { generatedAt, browsers: [...] }
 */
const fs = require('fs');
const path = require('path');

const BENCH_DIR = __dirname;
const RESULTS_DIR = path.join(BENCH_DIR, 'results');
const REPO_ROOT = path.join(BENCH_DIR, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const OUT_FILE = path.join(DOCS_DIR, 'benchmarks.md');

function readJson(file) {
 return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fmtEnvLine(env) {
 if (!env) return '(no env captured)';
 return `Node ${env.node} · ${env.platform}/${env.arch} · ${env.cpuModel} (${env.cpuCount} cores) · captured ${env.timestamp}`;
}

function num(n, digits) {
 return n == null ? 'n/a' : n.toFixed(digits);
}

// --- per-shape renderers -----------------------------------------------

function renderTinybenchSuite(result) {
 const { suite, env, tasks } = result;
 const lines = [];
 lines.push(`### ${suite}`);
 lines.push('');
 lines.push(fmtEnvLine(env));
 lines.push('');
 lines.push('| Case | ops/sec | margin | mean (ms) | samples |');
 lines.push('|------|--------:|-------:|----------:|--------:|');
 for (const task of tasks) {
 const ops = task.opsPerSec != null ? Math.round(task.opsPerSec) : 'n/a';
 const margin = task.marginPct != null ? `±${num(task.marginPct, 2)}%` : 'n/a';
 const mean = num(task.meanMs, 4);
 lines.push(`| ${task.name} | ${ops} | ${margin} | ${mean} | ${task.samples} |`);
 }
 lines.push('');
 return lines.join('\n');
}

function renderAllocSuite(result) {
 const { suite, env, allocation } = result;
 const lines = [];
 lines.push(`### ${suite}`);
 lines.push('');
 lines.push(fmtEnvLine(env));
 lines.push('');
 lines.push('| Impl | count | heap delta (KB) | bytes/promise | GC during alloc |');
 lines.push('|------|------:|----------------:|--------------:|----------------:|');
 for (const row of allocation) {
 const kb = (row.heapDeltaBytes / 1024).toFixed(1);
 lines.push(`| ${row.name} | ${row.count} | ${kb} | ${row.heapDeltaPerPromise} | ${row.gcDuringAlloc} |`);
 }
 lines.push('');
 return lines.join('\n');
}

function renderMacroSuite(result) {
 const { suite, env, params, results } = result;
 const lines = [];
 const impls = Object.keys(results);
 const nativeUs = results.native ? results.native.waterfall.usPerOp : null;

 lines.push(`### ${suite}`);
 lines.push('');
 lines.push(fmtEnvLine(env));
 lines.push('');
 lines.push(
 `Flows: waterfall (5 sequential + 3 parallel requests, ${Math.round(params.waterfallCancelRate * 100)}% ` +
 `canceled mid-flight) × ${params.waterfallRuns.toLocaleString('en-US')} · component-lifecycle (mount → ` +
 `${params.lifecycleRequests} requests → unmount-cancel) × ${params.lifecycleRuns.toLocaleString('en-US')}.`
 );
 lines.push('');

 lines.push('#### Waterfall — overhead per request operation');
 lines.push('');
 lines.push('| Impl | µs/op | vs native | µs/run | total ms |');
 lines.push('|------|------:|----------:|-------:|---------:|');
 for (const key of impls) {
 const r = results[key].waterfall;
 const vsNative = key === 'native' || nativeUs == null
 ? '—'
 : `${r.usPerOp >= nativeUs ? '+' : ''}${(((r.usPerOp - nativeUs) / nativeUs) * 100).toFixed(1)}%`;
 lines.push(`| ${results[key].name} | ${num(r.usPerOp, 3)} | ${vsNative} | ${num(r.usPerRun, 3)} | ${Math.round(r.totalMs)} |`);
 }
 lines.push('');

 lines.push('#### Component-lifecycle — overhead per request operation');
 lines.push('');
 lines.push('| Impl | µs/op | vs native | µs/run | total ms |');
 lines.push('|------|------:|----------:|-------:|---------:|');
 const nativeLifecycleUs = results.native ? results.native.lifecycle.usPerOp : null;
 let hasIncomparable = false;
 for (const key of impls) {
 const r = results[key].lifecycle;
 const comparable = results[key].lifecycleComparable !== false;
 let vsNative;
 let nameSuffix = '';
 if (key === 'native' || nativeLifecycleUs == null) {
 vsNative = '—';
 } else if (!comparable) {
 vsNative = 'n/c*';
 nameSuffix = '*';
 hasIncomparable = true;
 } else {
 vsNative = `${r.usPerOp >= nativeLifecycleUs ? '+' : ''}${(((r.usPerOp - nativeLifecycleUs) / nativeLifecycleUs) * 100).toFixed(1)}%`;
 }
 lines.push(`| ${results[key].name}${nameSuffix} | ${num(r.usPerOp, 3)} | ${vsNative} | ${num(r.usPerRun, 3)} | ${Math.round(r.totalMs)} |`);
 }
 lines.push('');
 if (hasIncomparable) {
 lines.push(
 '\\* Not comparable: a canceled bluebird promise never settles by design, so its lifecycle ' +
 'flow cannot be awaited to completion like native/canc — only the synchronous cancel work is timed.'
 );
 lines.push('');
 }

 lines.push('#### Memory — retained heap per 1000 in-flight requests');
 lines.push('');
 lines.push('| Impl | MB / 1k in-flight |');
 lines.push('|------|------------------:|');
 for (const key of impls) {
 const m = results[key].memory;
 lines.push(`| ${results[key].name} | ${m.supported ? (m.bytesPer1k / 1e6).toFixed(2) : 'n/a'} |`);
 }
 lines.push('');

 return lines.join('\n');
}

function renderBrowserLane(result) {
 const lines = [];
 lines.push('### browser-lane');
 lines.push('');
 lines.push('Playwright, UMD dist bundles loaded in-page (P3-4). Node-lane numbers above are NOT ' +
 'directly comparable to these (different engines, different harness overhead) — browser lane ' +
 'exists to catch cross-engine regressions, not to be read against Node numbers.');
 lines.push('');
 lines.push('| Browser | Suite | Case | ops/sec | margin | mean (ms) | samples |');
 lines.push('|---------|-------|------|--------:|-------:|----------:|--------:|');
 for (const b of result.browsers) {
 for (const task of b.tasks) {
 const ops = task.opsPerSec != null ? Math.round(task.opsPerSec) : 'n/a';
 const margin = task.marginPct != null ? `±${num(task.marginPct, 2)}%` : 'n/a';
 lines.push(`| ${b.browser} ${b.version} | ${task.suite} | ${task.name} | ${ops} | ${margin} | ${num(task.meanMs, 4)} | ${task.samples} |`);
 }
 }
 lines.push('');
 return lines.join('\n');
}

function renderSuiteFile(fileName, result) {
 if (Array.isArray(result.browsers)) return renderBrowserLane(result);
 if (Array.isArray(result.allocation)) return renderAllocSuite(result);
 if (result.results && result.params) return renderMacroSuite(result);
 if (Array.isArray(result.tasks)) return renderTinybenchSuite(result);
 return `### ${result.suite || fileName}\n\n(unrecognized result shape — see raw JSON in benchmarks/results/${fileName})\n`;
}

// --- summary table for README embed -------------------------------------

function buildSummaryTable(resultsByFile) {
 const lines = [];
 lines.push('| Suite | Headline comparison |');
 lines.push('|-------|----------------------|');

 const micro = resultsByFile['micro.json'];
 if (micro) {
 const chain10 = micro.tasks.filter((t) => t.name.startsWith('b/chain-10 '));
 const native = chain10.find((t) => t.name.endsWith('native'));
 const canc = chain10.find((t) => t.name.endsWith('canc'));
 const bb = chain10.find((t) => t.name.endsWith('bluebird'));
 if (native && canc && bb) {
 lines.push(
 `| micro: then-chain depth 10 | native ${Math.round(native.opsPerSec).toLocaleString('en-US')} ops/s ` +
 `· canc ${Math.round(canc.opsPerSec).toLocaleString('en-US')} ops/s ` +
 `· bluebird ${Math.round(bb.opsPerSec).toLocaleString('en-US')} ops/s |`
 );
 }
 }

 const alloc = resultsByFile['micro-alloc.json'];
 if (alloc) {
 const rows = alloc.allocation.map((r) => `${r.name} ${r.heapDeltaPerPromise}B/promise`).join(' · ');
 lines.push(`| micro-alloc: 10k promises | ${rows} |`);
 }

 const macro = resultsByFile['macro-realworld.json'];
 if (macro) {
 const native = macro.results.native.waterfall.usPerOp;
 const canc = macro.results.canc.waterfall.usPerOp;
 const bb = macro.results.bluebird.waterfall.usPerOp;
 const cancPct = (((canc - native) / native) * 100).toFixed(0);
 const bbPct = (((bb - native) / native) * 100).toFixed(0);
 lines.push(
 `| macro: waterfall (5+3 requests, 30% canceled) | canc +${cancPct}% vs native · ` +
 `bluebird +${bbPct}% vs native |`
 );
 }

 const browser = resultsByFile['browser-lane.json'];
 if (browser) {
 const names = browser.browsers.map((b) => `${b.browser} ${b.version}`).join(', ');
 lines.push(`| browser-lane | ran in ${names} |`);
 }

 return lines.join('\n');
}

// --- main ----------------------------------------------------------------

function main() {
 if (!fs.existsSync(RESULTS_DIR)) {
 console.error('No results/ dir yet — run `yarn bench <suite>` first.');
 process.exitCode = 1;
 return;
 }

 const files = fs
 .readdirSync(RESULTS_DIR)
 .filter((f) => f.endsWith('.json'))
 .sort();

 if (files.length === 0) {
 console.error('No result JSON files yet — run `yarn bench <suite>` first.');
 process.exitCode = 1;
 return;
 }

 const resultsByFile = {};
 const sections = [];
 for (const f of files) {
 const result = readJson(path.join(RESULTS_DIR, f));
 resultsByFile[f] = result;
 sections.push(renderSuiteFile(f, result));
 }

 const summaryTable = buildSummaryTable(resultsByFile);

 const doc = [
 '# canc benchmarks',
 '',
 '**Generated doc — do not hand-edit.** Regenerate with `yarn bench:report` after ' +
 '(re)running suites; source data lives in `benchmarks/results/*.json`, generator is ' +
 '`benchmarks/generate-report.js`.',
 '',
 '## Methodology',
 '',
 '**Hardware / environment.** Each suite captures its own `env` block at run time: Node ' +
 'version, OS platform/arch, CPU model + logical core count, ISO timestamp. See the per-suite ' +
 'headers below for the exact machine each number came from — numbers are NOT normalized ' +
 'across machines, so don\'t diff two results/*.json captured on different hardware and read ' +
 'the delta as signal.',
 '',
 '**Runs.** Node-lane suites use [tinybench](https://github.com/tinylibs/tinybench) ' +
 '(warmup pass + timed run, default `time: 100`/`iterations: 10` per case, overridable per ' +
 'suite) reporting ops/sec, relative margin of error (rme), mean, and sample count. The ' +
 'macro-realworld suite is self-timed (`process.hrtime`-style, no tinybench) because it ' +
 'measures whole simulated flows (waterfalls, component lifecycles) rather than isolated ' +
 'hot-loop cases; it also samples `process.memoryUsage().heapUsed` with `--expose-gc` for ' +
 'per-1k-in-flight memory figures. The browser lane (P3-4) runs the same tinybench cases ' +
 'inside real chromium/firefox/webkit pages via Playwright, loading the built UMD bundles — ' +
 'not the Node-lane source — so it also catches build/bundling regressions.',
 '',
 '**Baselines.** Only **native `Promise`** and **bluebird** (`cancellation: true`) are ' +
 'benchmarked as baselines — c-promise2/p-cancelable/alkemics were dropped from bench deps per ' +
 'decision D14 (`.claude/decisions.md`). bluebird is not always a like-for-like comparison: a ' +
 'canceled bluebird promise never settles by design, so any flow that awaits a canceled chain ' +
 'to completion (e.g. the lifecycle macro) marks bluebird `lifecycleComparable: false` and its ' +
 'number reflects only the synchronous cancel call, not equivalent work — see the footnote on ' +
 'that table.',
 '',
 '**"Microbenchmarks lie" disclaimer.** Numbers here measure isolated hot loops (construct, ' +
 'chain, fanout, all/race, cancel storm) run thousands to millions of times back-to-back — a ' +
 'regime real applications rarely hit. JIT warmup, inlining, and deopt behavior in a tight ' +
 'microbenchmark loop can differ substantially from a promise chain that runs once per user ' +
 'action alongside real I/O. Treat ops/sec columns as **relative** signal ("canc chain-10 is ' +
 'roughly Nx slower than native chain-10 on this machine, this Node version"), not as an ' +
 'absolute cost you can multiply into a production budget. The macro-realworld suite exists ' +
 'specifically to counter this — it simulates whole request flows instead of isolated ops — but ' +
 'even that is a simulation (setImmediate-based mock fetch, no real network/timer jitter), not ' +
 'a real app. Margin-of-error columns matter: wide margins (commonly seen in the browser lane, ' +
 'especially firefox/webkit under Playwright) mean the number is noisy, not necessarily wrong — ' +
 'don\'t over-read small deltas inside the margin.',
 '',
 '**Out of scope.** This phase () collects numbers only — no optimization work was ' +
 'performed based on these results. Unflattering numbers are expected and intentional; they ' +
 'feed later optimization-phase decisions, not this one.',
 '',
 '## Summary (README embed)',
 '',
 summaryTable,
 '',
 '## Full results',
 '',
 ...sections,
 ].join('\n');

 if (!fs.existsSync(DOCS_DIR)) {
 fs.mkdirSync(DOCS_DIR, { recursive: true });
 }
 fs.writeFileSync(OUT_FILE, doc);
 console.log(doc);
 console.log(`\nWritten: ${OUT_FILE}`);
}

main();
