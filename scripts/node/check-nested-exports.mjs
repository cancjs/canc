// Runs by CI, cron, or hand.
// standalone reproduction of the guard baked into surface-docs.mjs
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertNestedExportsRendered } from './surface-docs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SURFACE_DIR = join(ROOT, 'packages', 'canc-node', 'surface');
const README_PATH = join(ROOT, 'packages', 'canc-node', 'README.md');

const entries = await readdir(SURFACE_DIR);
const manifestFiles = entries
  .filter((e) => e.endsWith('.json') && e !== 'schema.json' && e !== 'exclusions.json' && !e.endsWith('.lock.json'))
  .sort();

const manifests = [];
for (const file of manifestFiles) {
  const content = JSON.parse(await readFile(join(SURFACE_DIR, file), 'utf8'));
  manifests.push({ file, ...content });
}

const readmeContent = await readFile(README_PATH, 'utf8');

const violations = assertNestedExportsRendered(manifests, readmeContent);

if (violations.length > 0) {
  console.error('nested export rendered flat:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log('check-nested-exports: no parent-nested export is rendered flat');
process.exit(0);
