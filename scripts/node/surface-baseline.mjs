import { run } from '../surface-baseline.mjs';

const isCheck = process.argv.includes('--check');

run({ check: isCheck, pkg: '@cancjs/node' })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
