'use strict';

/**
 * P3-5 stub: full docs/benchmarks.md generator (methodology, all suites,
 * README embed table) lands in P3-5. For now this scaffold just concatenates
 * whatever *.json result files exist in results/ into one markdown doc, so
 * `yarn bench:report` is runnable immediately after P3-1's smoke suite.
 */
const fs = require('fs');
const path = require('path');
const { resultToMarkdown } = require('./to-markdown');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const OUT_FILE = path.join(RESULTS_DIR, 'report.md');

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

 const sections = files.map((f) => {
 const result = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
 return resultToMarkdown(result);
 });

 const doc = ['# Benchmark results (scaffold)', '', ...sections].join('\n');
 fs.writeFileSync(OUT_FILE, doc);
 console.log(doc);
 console.log(`\nWritten: ${OUT_FILE}`);
}

main();
