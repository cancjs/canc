// Generates the names-only / fields-only manifest views src/ actually imports at runtime.
// Run by hand (npm run surface:project -w @cancjs/node) after editing a surface/*.json manifest.
// Raw manifests carry internal-only fields a consumer never reads (cancelCategory, teardown, ...).
// json() inlines the whole imported object into dist, so each entry below picks only the fields
// its one runtime consumer reads.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CANC_SURFACE_ROOT || join(HERE, '..', '..');
const surfaceDir = join(ROOT, 'packages', 'canc-node', 'surface');
const outDir = join(surfaceDir, 'projected');

/** name + nodeSignal is all `timers`, `stream`, `stream.Readable`, `fs`, and the readline question entry read. */
function projectNodeSignalOnly(entry) {
  return {
    name: entry.name,
    nodeSignal: entry.nodeSignal,
  };
}

/**
 * `file-handle.ts` reads kind/wrapper/minMajor/gate/callPath for real routing decisions, plus
 * whether the member is adopted rather than wrapped. `cancelCategory` itself never crosses: it is
 * the internal class-1..4 taxonomy, and the only runtime use of it was a `=== 'D'` check, so that
 * check is done here instead and only the boolean result ships.
 */
function projectFileHandleMember(entry) {
  return {
    name: entry.name,
    kind: entry.kind,
    wrapper: entry.wrapper,
    adopted: entry.cancelCategory === 'D',
    minMajor: entry.minMajor ?? null,
    gate: entry.gate ?? null,
    callPath: entry.callPath ?? null,
    // signalWrapped() reads nodeSignal for the cancelify-signal / gated members
    nodeSignal: entry.nodeSignal,
  };
}

const PROJECTIONS = [
  { source: 'fs.json', project: projectNodeSignalOnly },
  { source: 'stream.json', project: projectNodeSignalOnly },
  { source: 'stream.Readable.json', project: projectNodeSignalOnly },
  { source: 'timers.json', project: projectNodeSignalOnly },
  { source: 'readline.readlinePromises.Interface.json', project: projectNodeSignalOnly },
  { source: 'fs.FileHandle.json', project: projectFileHandleMember },
];

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const { source, project } of PROJECTIONS) {
  const raw = JSON.parse(readFileSync(join(surfaceDir, source), 'utf8'));
  const projected = { exports: raw.exports.map(project) };
  writeFileSync(join(outDir, source), JSON.stringify(projected, null, 2) + '\n');
}

console.log(`wrote ${PROJECTIONS.length} projected manifest(s) to ${outDir}`);
