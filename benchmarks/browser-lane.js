#!/usr/bin/env node
'use strict';

/**
 * Browser lane. Loads the built UMD bundle (packages/canc-promise/dist/index.umd.js)
 * into a real chromium/firefox/webkit page via playwright and runs tinybench suites a-e
 * (mirrors micro suite shapes) *inside the page context* — proves numbers aren't a
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
const UMD_BUNDLE = path.join(__dirname, '..', 'packages', 'canc-promise', 'dist', 'index.umd.js');
// tinybench's package.json "exports" only maps the package root (not subpaths), so
// require.resolve('tinybench/dist/index.js') is blocked by ERR_PACKAGE_PATH_NOT_EXPORTED.
// Resolve the CJS main entry (dist/index.cjs) then derive the sibling ESM file (dist/index.js)
// by directory — that file is what actually has plain `export { Bench }` syntax we need.
const TINYBENCH_ESM = path.join(path.dirname(require.resolve('tinybench')), 'index.js');

// Per-browser tinybench config. Firefox and webkit clamp performance.now() to a
// coarse resolution (Spectre mitigation), so a single sub-microsecond fn() call
// reads as 0 or 1 clamped tick — tinybench's per-sample duration is dominated by
// timer quantization, not the work, and RME blows up to ±20-70% (useless).
//
// Fix = per-sample batching: each tinybench sample runs the case body `batch` times
// and awaits them all, so the measured interval sits well above the timer clamp. The
// per-op mean and margin are then recomputed in-page from the raw samples (see
// calibrate() and trimStats()) and scaled back by the batch. `batch` is the per-case
// upper bound; the actual batch is calibrated per case. Chromium's timer is fine, so
// it stays at batch 1 with the fast defaults.
//
// `time` is raised for the batched browsers so enough whole batches are sampled for
// the margin to converge; `iterations` is a low floor so genuinely heavy cases (which
// are slow per op and low-variance anyway) are not forced into long runs.
const BROWSERS = [
  {
    name: 'chromium',
    launcher: chromium,
    benchOptions: { time: 100, iterations: 10 },
    batch: 1,
  },
  {
    name: 'firefox',
    launcher: firefox,
    benchOptions: { time: 5000, iterations: 30 },
    batch: 1200,
  },
  {
    name: 'webkit',
    launcher: webkit,
    benchOptions: { time: 3000, iterations: 30 },
    batch: 1200,
  },
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
  {
    id: 'h-bubble-leaf',
    label: 'bubble path: depth-10 chain, cancel LEAF, bubble to root',
    cases: [
      {
        name: 'canc-bubble-leaf-10',
        body: `
 var CP = window.canc_promise.CancelablePromise;
 var root = new CP(function () {}, { bubble: true });
 var tail = root;
 for (var i = 0; i < 10; i++) { tail = tail.then(function (v) { return v + 1; }, undefined, { bubble: true }); }
 var settled = tail.catch(function () {});
 tail.cancel();
 return settled;
 `,
      },
    ],
  },
  {
    id: 'i-allsettled-any',
    label: 'allSettled / any width 100',
    cases: [
      {
        name: 'native-allSettled-100',
        body: `
 var arr = [];
 for (var i = 0; i < 100; i++) { arr.push(Promise.resolve(i)); }
 return Promise.allSettled(arr);
 `,
      },
      {
        name: 'canc-allSettled-100',
        body: `
 var CP = window.canc_promise.CancelablePromise;
 var arr = [];
 for (var i = 0; i < 100; i++) { arr.push(CP.resolve(i)); }
 return CP.allSettled(arr);
 `,
      },
      {
        name: 'native-any-100',
        body: `
 var arr = [];
 for (var i = 0; i < 100; i++) { arr.push(Promise.resolve(i)); }
 return Promise.any(arr);
 `,
      },
      {
        name: 'canc-any-100',
        body: `
 var CP = window.canc_promise.CancelablePromise;
 var arr = [];
 for (var i = 0; i < 100; i++) { arr.push(CP.resolve(i)); }
 return CP.any(arr);
 `,
      },
    ],
  },
  {
    id: 'j-signal-construct',
    label: 'signal-wired construct+settle (listener add/remove)',
    cases: [
      {
        name: 'native-construct-resolve',
        body: `return new Promise(function (resolve) { resolve(1); });`,
      },
      {
        name: 'canc-signal-construct',
        body: `
 var CP = window.canc_promise.CancelablePromise;
 if (!window.__cancSharedController) { window.__cancSharedController = new AbortController(); }
 return new CP(function (resolve) { resolve(1); }, { signal: window.__cancSharedController.signal });
 `,
      },
    ],
  },
  {
    id: 'k-then-settled',
    label: 'then() on already-settled promise (hot resubscription)',
    cases: [
      {
        name: 'native-then-settled',
        body: `
 if (!window.__nativeSettled) { window.__nativeSettled = Promise.resolve(1); }
 return window.__nativeSettled.then(function (v) { return v + 1; });
 `,
      },
      {
        name: 'canc-then-settled',
        body: `
 var CP = window.canc_promise.CancelablePromise;
 if (!window.__cancSettled) { window.__cancSettled = CP.resolve(1); }
 return window.__cancSettled.then(function (v) { return v + 1; });
 `,
      },
    ],
  },
  {
    id: 'l-handlecancel-register',
    label: 'executor handleCancel registration',
    cases: [
      {
        name: 'native-construct-resolve',
        body: `return new Promise(function (resolve) { resolve(1); });`,
      },
      {
        name: 'canc-handleCancel-register',
        body: `
 var CP = window.canc_promise.CancelablePromise;
 return new CP(function (resolve, reject, handleCancel) {
 handleCancel(function () {});
 resolve(1);
 });
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
async function runInPage(page, benchOptions, batch) {
  await page.addScriptTag({ path: UMD_BUNDLE });

  // tinybench ships ESM-only (dist/index.js has `export { x as Bench, ... }`, no
  // UMD/global build) — inject it as a module script and stash the export on
  // window so the plain (non-module) evaluate() below can reach it.
  // Rewrite the trailing `export { x as Bench, ... }` statement into a window assignment
  // instead of appending new code after it — the export renames internal minified bindings
  // (e.g. `x`) to `Bench`, so a bare `window.__Tinybench = { Bench }` appended afterwards
  // would hit a ReferenceError (no local `Bench` binding exists, only the rename target).
  const tinybenchSrc = fs.readFileSync(TINYBENCH_ESM, 'utf8').replace(/export\s*\{([^}]*)\};?\s*$/, (_m, names) => {
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

  return page.evaluate(
    async ({ suites, benchOptions, batch }) => {
      const Bench = window.__Tinybench.Bench;
      const results = [];

      // The time budget the bench spends per case (ms). Used to bound the batch so every
      // case still yields enough samples for a stable margin (see calibrate()).
      const timeBudgetMs = benchOptions.time || 100;
      // Floor on how many samples a case should collect. RME shrinks as 1/sqrt(samples).
      // Kept moderate rather than large: for allocation-heavy cases a bigger batch (so a
      // GC pause lands in every sample instead of randomly in a few) uniformizes the
      // distribution more effectively than piling up more samples of a bimodal one, and
      // the batch cap is what lets that happen. The batch is capped so
      // batch x perOp x MIN_SAMPLES stays within the time budget.
      const MIN_SAMPLES = 250;

      // Target per-sample duration (ms). ~10ms sits well above the coarsest
      // performance.now() clamp (~1ms, firefox Spectre mitigation) so timer quantization
      // never dominates, and is long enough that an allocation-heavy case's per-sample
      // batch is large enough for a GC pause to land in essentially every sample rather
      // than randomly in a few (which is what makes those cases' sample distribution
      // bimodal and their untrimmed margin explode). It is still short enough that the
      // `time` budget yields hundreds of samples per case. Heavy cases (all-1000...) are
      // already milliseconds per op, calibrate to batch 1, and clear the clamp on their own.
      const TARGET_SAMPLE_MS = 10;

      // Calibrate a per-case batch so each timed sample runs long enough. The per-op
      // estimate is the median of a few probe bursts so a single noisy probe (GC,
      // scheduler hiccup) doesn't pick a wildly wrong batch and leave the case
      // under-sampled. Returns the chosen batch (1 for already-heavy cases).
      async function calibrate(body, maxBatch) {
        if (maxBatch <= 1) return 1;
        const probe = 25;
        // Warm the case up first so JIT has tiered up before we measure — a cold probe
        // underestimates per-op cost, picks an oversized batch, and starves the case of
        // samples. Then take the median of a few warm bursts to reject residual hiccups.
        for (let warm = 0; warm < 4; warm++) {
          const acc = new Array(probe);
          for (let i = 0; i < probe; i++) acc[i] = body();
          await Promise.all(acc);
        }
        const perOpSamples = [];
        for (let round = 0; round < 3; round++) {
          const t0 = performance.now();
          const acc = new Array(probe);
          for (let i = 0; i < probe; i++) acc[i] = body();
          await Promise.all(acc);
          perOpSamples.push(Math.max((performance.now() - t0) / probe, 1e-4));
        }
        perOpSamples.sort((a, b) => a - b);
        const perOpMs = perOpSamples[1]; // median of 3
        const wanted = Math.ceil(TARGET_SAMPLE_MS / perOpMs);
        // Cap the batch so at least MIN_SAMPLES whole batches fit the time budget. Without
        // this, a case whose per-op cost the probe still underestimated gets an oversized
        // batch, collects only tens of samples, and its margin blows up. This bound
        // guarantees the sample count that keeps the margin tight.
        const sampleCap = Math.max(1, Math.floor(timeBudgetMs / (MIN_SAMPLES * perOpMs)));
        return Math.max(1, Math.min(maxBatch, wanted, sampleCap));
      }

      for (const suite of suites) {
        const bench = new Bench(benchOptions);
        const caseBatch = {};
        for (const c of suite.cases) {
          const body = new Function(c.body);
          const b = await calibrate(body, batch);
          caseBatch[c.name] = b;
          let fn;
          if (b > 1) {
            // Each tinybench sample runs the body `b` times so the measured interval is
            // well above the engine's coarse performance.now() clamp. Reported hz is
            // scaled back by `b` below (batches/sec x b = ops/sec).
            fn = function () {
              const inner = new Array(b);
              for (let i = 0; i < b; i++) inner[i] = body();
              return Promise.all(inner);
            };
          } else {
            fn = body;
          }
          bench.add(c.name, fn);
        }
        await bench.warmup();
        await bench.run();

        // Recompute the mean and relative margin of error from the raw per-sample times
        // after dropping the slowest/fastest 10% (a symmetric trimmed mean). Headless
        // firefox on Windows falls back to software rendering and injects occasional
        // GC-pause / JIT-retier outlier samples that inflate tinybench's untrimmed RME on
        // allocation-heavy cases even when the bulk of samples are tight. Trimming those
        // tails reports the margin of the stable body of the distribution, the
        // engine-comparison signal this lane exists to surface (absolute firefox numbers
        // are engine-dependent and out of scope; only the margin must be sane).
        const TRIM_FRACTION = 0.1;
        const statsOf = (arr) => {
          const n = arr.length;
          const mean = arr.reduce((s, v) => s + v, 0) / n;
          const variance = n > 1 ? arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1) : 0;
          const sem = Math.sqrt(variance) / Math.sqrt(n);
          // 95% CI half-width as a percentage of the mean (matches tinybench's rme meaning).
          const rme = mean > 0 ? ((sem * 1.96) / mean) * 100 : 0;
          return { mean, rme, n };
        };
        const trimStats = (samples) => {
          if (!samples || samples.length === 0) return { mean: null, rme: null, n: 0 };
          // Fast cases produce tens of thousands of already-tight samples; sorting them all
          // is wasteful (and slow in-page) and does not move the margin, so report them
          // untrimmed above a threshold. Trim only the smaller, outlier-prone sets.
          if (samples.length > 20000) return statsOf(samples);
          const sorted = samples.slice().sort((a, b) => a - b);
          const cut = Math.floor(sorted.length * TRIM_FRACTION);
          const kept = sorted.length - 2 * cut >= 4 ? sorted.slice(cut, sorted.length - cut) : sorted;
          return statsOf(kept);
        };

        for (const task of bench.tasks) {
          const r = task.result;
          const b = caseBatch[task.name] || 1;
          // r.samples are per-sample durations (ms) — trim outliers, then scale for batch.
          const t = r ? trimStats(r.samples) : { mean: null, rme: null, n: 0 };
          results.push({
            suite: suite.id,
            name: task.name,
            // trimmed mean is per-batch ms -> ops/sec = b / (mean/1000).
            opsPerSec: t.mean != null && t.mean > 0 ? (b * 1000) / t.mean : null,
            // trimmed relative margin of error (scale-invariant, batch does not change it).
            marginPct: t.rme,
            samples: t.n,
            // trimmed mean is per-batch ms -> divide by b for per-op mean.
            meanMs: t.mean != null ? t.mean / b : null,
          });
        }
      }

      return results;
    },
    { suites: suites_for_page(SUITES), benchOptions, batch },
  );
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
    console.error('Run `npm run build` in packages/canc-promise first.');
    process.exitCode = 1;
    return;
  }

  const browserResults = [];

  for (const { name, launcher, benchOptions, batch } of BROWSERS) {
    console.log(`Launching ${name}...`);
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage();
      page.on('console', (msg) => console.log(` [${name} console] ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', (err) => console.log(` [${name} pageerror] ${err}`));
      const version = browser.version();
      const tasks = await runInPage(page, benchOptions, batch || 1);
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
