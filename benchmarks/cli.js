#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { runSuite, RESULTS_DIR } = require('./lib/run-suite');
const { resultToMarkdown } = require('./lib/to-markdown');

const SUITES_DIR = path.join(__dirname, 'suites');

function listSuites() {
 return fs
 .readdirSync(SUITES_DIR)
 .filter((f) => f.endsWith('.js'))
 .map((f) => f.replace(/\.js$/, ''));
}

async function main() {
 const suiteName = process.argv[2];

 if (!suiteName) {
 console.error('Usage: yarn bench <suite>');
 console.error(`Available suites: ${listSuites().join(', ') || '(none)'}`);
 process.exitCode = 1;
 return;
 }

 const suiteFile = path.join(SUITES_DIR, `${suiteName}.js`);
 if (!fs.existsSync(suiteFile)) {
 console.error(`Unknown suite: ${suiteName}`);
 console.error(`Available suites: ${listSuites().join(', ') || '(none)'}`);
 process.exitCode = 1;
 return;
 }

 const suiteModule = require(suiteFile);
 const { result, outFile } = await runSuite(suiteModule);
 const md = resultToMarkdown(result);

 const mdFile = path.join(RESULTS_DIR, `${suiteName}.md`);
 fs.writeFileSync(mdFile, md + '\n');

 console.log(md);
 console.log(`\nJSON: ${outFile}`);
 console.log(`MD: ${mdFile}`);
}

main().catch((err) => {
 console.error(err);
 process.exitCode = 1;
});
