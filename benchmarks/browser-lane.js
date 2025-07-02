#!/usr/bin/env node
'use strict';

/**
 * P3-4 browser lane. Loads the built UMD bundle (packages/canc-promise/dist/index.umd.js)
 * into a real chromium/firefox/webkit page via playwright and runs tinybench suites a-e
 * (mirrors P3-2 micro suite shapes) *inside the page context* — proves numbers aren't a
 * node-only artifact (JIT/engine differences across browsers matter for a browser-shipped
 * lib). Native Promise is always available in-page; CancelablePromise comes from the UMD
 * global `canc_promise` set by the bundle itself (invariant 1: native Promise captured
 * at module load, so loading order here — bundle first — matters, matches real usage).
 *
 * bluebird is NOT loaded in-page: no browser UMD build of bluebird is part of this repo's
 * dist output; browser lane compares
 * native vs canc only, which is the comparison that matters for "what does canc cost in a
 * browser".
 *
 * Suites a-e (construct+resolve, then-chain, fanout, all/race, cancel storm) run with
 * tinybench loaded into the page via addScriptTag so timing happens under the real
 * browser engine, not proxied over the CDP wire per-op.
 *
 * Usage: node benchmarks/browser-lane.js
 * Output: benchmarks/results/browser-lane.json + .md (one row per browser x case)
 */

const path = require('path');
const fs = require('fs');
const { chromium, firefox, webkit } = require('playwright');

const RESULTS_DIR = path.join(__dirname, 'results');
const UMD_BUNDLE = path.join(
 __dirname,
 '..',
 'packages',
 'canc-promise',
 'dist',
 'index.umd.js',
);
// tinybench's package.json "exports" only maps the package root (not subpaths), so
// require.resolve('tinybench/dist/index.js') is blocked by ERR_PACKAGE_PATH_NOT_EXPORTED.
// Resolve the CJS main entry (dist/index.cjs) then derive the sibling ESM file (dist/index.js)
// by directory — that file is what actually has plain `export { Bench }` syntax we need.
const TINYBENCH_ESM = path.join(path.dirname(require.resolve('tinybench')), 'index.js');

const BROWSERS = [
 { name: 'chromium', launcher: chromium },
 { name: 'firefox', launcher: firefox },
 { name: 'webkit', launcher: webkit },
];

/**
 * Suite case bodies are serialized as strings and reconstructed in-page (page.evaluate
 * can't close over node-side functions referencing page globals cleanly for tinybench's
 * async add() API), so cases are written as source strings evaluated with `new Function`
 * inside the page. Keep each case body self-contained (no outer closures).
 */
const SUITES = [
 {
 id: 'a-construct-resolve',
 label: 'construct+resolve (executor)',
 cases: [
 {
 name: 'native-construct-resolve',
 body: `return new Promise(function (resolve) { resolve(1); });`,
 },
 {
 name: 'canc-construct-resolve',
 body: `return new window.canc_promise.CancelablePromise(function (resolve) { resolve(1); });`,
 },
 ],
 },
 {
 id: 'b-then-chain',
 label: 'then-chain depth 10 build+settle',
 cases: [
 {
 name: 'native-then-chain-10',
 body: `
 var p = Promise.resolve(0);
 for (var i = 0; i < 10; i++) { p = p.then(function (v) { return v + 1; }); }
 return p;
 `,
 },
 {
 name: 'canc-then-chain-10',
 body: `
 var p = window.canc_promise.CancelablePromise.resolve(0);
 for (var i = 0; i < 10; i++) { p = p.then(function (v) { return v + 1; }); }
 return p;
 `,
 },
 ],
 },
 {
 id: 'c-fanout',
 label: 'fanout: 1 promise, 100 then children',
 cases: [
 {
 name: 'native-fanout-100',
 body: `
 var p = Promise.resolve(1);
 var children = [];
 for (var i = 0; i < 100; i++) { children.push(p.then(function (v) { return v; })); }
 return Promise.all(children);
 `,
 },
 {
 name: 'canc-fanout-100',
 body: `
 var CP = window.canc_promise.CancelablePromise;
 var p = CP.resolve(1);
 var children = [];
 for (var i = 0; i < 100; i++) { children.push(p.then(function (v) { return v; })); }
 return CP.all(children);
 `,
 },
 ],
 },
 {
 id: 'd-all-race-width',
 label: 'all/race width 10/1000',
 cases: [
 {
 name: 'native-all-width-10',
 body: `
 var arr = [];
 for (var i = 0; i < 10; i++) { arr.push(Promise.resolve(i)); }
 return Promise.all(arr);
 `,
 },
 {
 name: 'canc-all-width-10',
 body: `
 var CP = window.canc_promise.CancelablePromise;
 var arr = [];
 for (var i = 0; i < 10; i++) { arr.push(CP.resolve(i)); }
 return CP.all(arr);
 `,
 },
 {
 name: 'native-all-width-1000',
 body: `
 var arr = [];
 for (var i = 0; i < 1000; i++) { arr.push(Promise.resolve(i)); }
 return Promise.all(arr);
 `,
 },
 {
 name: 'canc-all-width-1000',
 body: `
 var CP = window.canc_promise.CancelablePromise;
 var arr = [];
 for (var i = 0; i < 1000; i++) { arr.push(CP.resolve(i)); }
 return CP.all(arr);
 `,
 },
 {
 name: 'native-race-width-10',
 body: `
 var arr = [];
 for (var i = 0; i < 10; i++) { arr.push(Promise.resolve(i)); }
 return Promise.race(arr);
 `,
 },
 {
 name: 'canc-race-width-10',
 body: `
 var CP = window.canc_promise.CancelablePromise;
 var arr = [];
 for (var i = 0; i < 10; i++) { arr.push(CP.resolve(i)); }
 return CP.race(arr);
 `,
 },
 ],
 },
 {
 id: 'e-cancel-storm',
 label: 'cancel storm: depth-50 chain, cancel root',
 cases: [
 {
 name: 'canc-cancel-storm-depth-50',
 body: `
 var CP = window.canc_promise.CancelablePromise;
 var root = new CP(function () {});
 var p = root;
 for (var i = 0; i < 50; i++) { p = p.then(function (v) { return v; }); }
 p.catch(function () {});
 root.cancel();
 return Promise.resolve();
 `,
 },
 ],
 },
];

/**
 * Runs all suites in-page using tinybench (loaded via the UMD bundle already available
 * as require.resolve'd file, injected with addScriptTag). Returns per-case tinybench
 * result summaries, same shape as lib/to-markdown.js expects (name/opsPerSec/marginPct/
 * meanMs/samples) so results stay consistent with the node lane.
 */
async function runInPage(page) {
 await page.addScriptTag({ path: UMD_BUNDLE });

 // tinybench ships ESM-only (dist/index.js has `export { x as Bench, ... }`, no
 // UMD/global build) — inject it as a module script and stash the export on
 // window so the plain (non-module) evaluate() below can reach it.
 // Rewrite the trailing `export { x as Bench, ... }` statement into a window assignment
 // instead of appending new code after it — the export renames internal minified bindings
 // (e.g. `x`) to `Bench`, so a bare `window.__Tinybench = { Bench }` appended afterwards
 // would hit a ReferenceError (no local `Bench` binding exists, only the rename target).
 const tinybenchSrc = fs
 .readFileSync(TINYBENCH_ESM, 'utf8')
 .replace(/export\s*\{([^}]*)\};?\s*$/, (_m, names) => {
 // `export { x as Bench, b as Task }` -> `{ Bench: x, Task: b }` (swap "local as
 // Exported" into valid "Exported: local" object-literal shorthand).
 const props = names
 .split(',')
 .map((s) => s.trim())
 .filter(Boolean)
 .map((entry) => {
 const asMatch = entry.match(/^(\S+)\s+as\s+(\S+)$/);
 return asMatch ? `${asMatch[2]}: ${asMatch[1]}` : `${entry}: ${entry}`;
 });
 return `window.__Tinybench = { ${props.join(', ')} };`;
 });
 if (!/__Tinybench/.test(tinybenchSrc)) {
 throw new Error('Failed to patch tinybench ESM export into window.__Tinybench');
 }
 await page.addScriptTag({ type: 'module', content: tinybenchSrc });
 await page.waitForFunction(() => !!window.__Tinybench);

 return page.evaluate(async (suites) => {
 const Bench = window.__Tinybench.Bench;
 const results = [];

 for (const suite of suites) {
 const bench = new Bench({ time: 100, iterations: 10 });
 for (const c of suite.cases) {
 // eslint-disable-next-line no-new-func
 const fn = new Function(c.body);
 bench.add(c.name, fn);
 }
 await bench.warmup();
 await bench.run();

 for (const task of bench.tasks) {
 results.push({
 suite: suite.id,
 name: task.name,
 opsPerSec: task.result ? task.result.hz : null,
 marginPct: task.result ? task.result.rme : null,
 samples: task.result ? task.result.samples.length : 0,
 meanMs: task.result ? task.result.mean : null,
 });
 }
 }

 return results;
 }, suites_for_page(SUITES));
}

// Strip functions/comments down to plain data before serializing across the CDP boundary.
function suites_for_page(suites) {
 return suites.map((s) => ({
 id: s.id,
 cases: s.cases.map((c) => ({ name: c.name, body: c.body })),
 }));
}

function toMarkdown(browserResults) {
 const lines = [];
 lines.push('## Browser lane');
 lines.push('');
 lines.push('| Browser | Suite | Case | ops/sec | margin | mean (ms) | samples |');
 lines.push('|---------|-------|------|--------:|-------:|----------:|--------:|');

 for (const { browser, version, tasks } of browserResults) {
 for (const task of tasks) {
 const ops = task.opsPerSec != null ? task.opsPerSec.toFixed(0) : 'n/a';
 const margin = task.marginPct != null ? `±${task.marginPct.toFixed(2)}%` : 'n/a';
 const mean = task.meanMs != null ? task.meanMs.toFixed(4) : 'n/a';
 lines.push(
 `| ${browser} ${version} | ${task.suite} | ${task.name} | ${ops} | ${margin} | ${mean} | ${task.samples} |`,
 );
 }
 }

 lines.push('');
 return lines.join('\n');
}

async function main() {
 if (!fs.existsSync(UMD_BUNDLE)) {
 console.error(`UMD bundle not found: ${UMD_BUNDLE}`);
 console.error('Run `yarn build` in packages/canc-promise first (see P0-5).');
 process.exitCode = 1;
 return;
 }

 const browserResults = [];

 for (const { name, launcher } of BROWSERS) {
 console.log(`Launching ${name}...`);
 const browser = await launcher.launch();
 try {
 const page = await browser.newPage();
 page.on('console', (msg) => console.log(` [${name} console] ${msg.type()}: ${msg.text()}`));
 page.on('pageerror', (err) => console.log(` [${name} pageerror] ${err}`));
 const version = browser.version();
 const tasks = await runInPage(page);
 browserResults.push({ browser: name, version, tasks });
 console.log(` ${name} ${version}: ${tasks.length} cases done`);
 } finally {
 await browser.close();
 }
 }

 if (!fs.existsSync(RESULTS_DIR)) {
 fs.mkdirSync(RESULTS_DIR, { recursive: true });
 }

 const outJson = path.join(RESULTS_DIR, 'browser-lane.json');
 const outMd = path.join(RESULTS_DIR, 'browser-lane.md');
 const jsonPayload = { generatedAt: new Date().toISOString(), browsers: browserResults };

 fs.writeFileSync(outJson, JSON.stringify(jsonPayload, null, 2) + '\n');
 const md = toMarkdown(browserResults);
 fs.writeFileSync(outMd, md + '\n');

 console.log('\n' + md);
 console.log(`JSON: ${outJson}`);
 console.log(`MD: ${outMd}`);
}

main().catch((err) => {
 console.error(err);
 process.exitCode = 1;
});
