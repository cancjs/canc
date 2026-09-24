// Runs the four node surface steps unconditionally and reports each by name.
// The surface-docs --check call here duplicates Check G inside surface-check.mjs on purpose --
// Check G's result is folded into surface-check's own exit code, so this call is what lets a
// docs-staleness failure be attributed to its own named step instead of hiding behind whichever
// other check made surface-check exit nonzero.
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CANC_SURFACE_ROOT || join(HERE, '..', '..');

const steps = [
  { name: 'surface-validate', file: join(HERE, 'surface-validate.mjs'), args: [] },
  { name: 'surface-check', file: join(HERE, 'surface-check.mjs'), args: [] },
  { name: 'surface-docs --check', file: join(HERE, 'surface-docs.mjs'), args: ['--check'] },
  { name: 'error-thrown-check', file: join(HERE, 'error-thrown-check.mjs'), args: [] },
];

let anyFailed = false;
const results = [];

for (const step of steps) {
  const res = spawnSync(process.execPath, [step.file, ...step.args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const passed = res.status === 0;
  if (!passed) anyFailed = true;
  results.push({ name: step.name, passed, status: res.status });
}

console.log('\nnode surface check summary:');
for (const r of results) {
  console.log(`  ${r.passed ? 'PASS' : 'FAIL'} ${r.name}`);
}

process.exit(anyFailed ? 1 : 0);
