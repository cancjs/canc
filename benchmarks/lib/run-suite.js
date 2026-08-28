'use strict';

const path = require('path');
const fs = require('fs');
const { Bench } = require('tinybench');
const { captureEnv } = require('./env');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

/**
 * Runs a suite module (see suites/smoke.js for shape) through tinybench, writes
 * JSON to benchmarks/results/<suite>.json, returns { env, suite, tasks }.
 *
 * Suite module shape:
 * module.exports = {
 * name: 'smoke',
 * cases: [ { name: 'native-resolve', fn() { ... } }, ... ],
 * options: {}, // optional tinybench Bench options override
 * };
 */
async function runSuite(suiteModule) {
  const bench = new Bench({ time: 100, iterations: 10, ...(suiteModule.options || {}) });

  for (const { name, fn } of suiteModule.cases) {
    bench.add(name, fn);
  }

  await bench.warmup();
  await bench.run();

  const tasks = bench.tasks.map((task) => {
    const error = (task.result && task.result.error) || task.error || null;
    if (error) {
      console.error(`Case "${task.name}" failed: ${error.stack || error.message || error}`);
    }
    return {
      name: task.name,
      opsPerSec: task.result && task.result.hz != null ? task.result.hz : null,
      marginPct: task.result && task.result.rme != null ? task.result.rme : null,
      samples: task.result && task.result.samples ? task.result.samples.length : 0,
      meanMs: task.result && task.result.mean != null ? task.result.mean : null,
      error: error ? error.message || String(error) : null,
    };
  });

  const result = {
    suite: suiteModule.name,
    env: captureEnv(),
    tasks,
  };

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  const outFile = path.join(RESULTS_DIR, `${suiteModule.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');

  return { result, outFile };
}

module.exports = { runSuite, RESULTS_DIR };
