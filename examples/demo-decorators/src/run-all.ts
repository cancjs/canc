// Runs every flavor that node/tsx can execute directly, one after another, so the output blocks
// line up for a side-by-side read. Each flavor runs in its own tsx process with its own tsconfig
// (stage-3 and TS-legacy need opposite `experimentalDecorators` settings). The babel-legacy flavor
// needs babel's transform and is covered by the smoke test instead.

import { spawnSync } from 'node:child_process';

interface Lane {
  flavor: string;
  args: string[];
}

const lanes: Lane[] = [
  { flavor: 'manual', args: ['src/main.ts', 'manual'] },
  { flavor: 'stage3', args: ['src/main.ts', 'stage3'] },
  { flavor: 'ts-legacy', args: ['--tsconfig', 'src/ts-legacy/tsconfig.json', 'src/main.ts', 'ts-legacy'] },
];

const tsx = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';

for (const lane of lanes) {
  const result = spawnSync(tsx, lane.args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`flavor ${lane.flavor} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
