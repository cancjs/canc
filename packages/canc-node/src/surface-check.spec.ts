import { spawnSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Regression fixture for the surface check's signal-map fallback (Check C).
// A prior bug fell back to `mentry.nodeSignal.sinceByMajor` with no `|| {}`, so a
// post-floor export with sinceByMajor === null skipped Check C entirely instead of
// failing "missing major". This spec drives the real script against a mutated copy
// of the manifest to prove that regression stays caught.

interface NodeSignal {
  since: string | null;
  sinceByMajor: Record<string, string> | null;
}

interface ManifestExport {
  name: string;
  nodeSignal?: NodeSignal;
}

interface Manifest {
  exports: ManifestExport[];
}

const repoRoot = join(__dirname, '..', '..', '..');
const scriptPath = join(repoRoot, 'scripts', 'node', 'surface-check.mjs');
const realSurfaceDir = join(repoRoot, 'packages', 'canc-node', 'surface');

function buildFixture(breakSinceByMajor: boolean): string {
  const tempRoot = mkdtempSync(join(tmpdir(), 'surface-check-'));
  const destSurfaceDir = join(tempRoot, 'packages', 'canc-node', 'surface');
  cpSync(realSurfaceDir, destSurfaceDir, { recursive: true });

  const fsManifestPath = join(destSurfaceDir, 'fs.json');
  const manifest = JSON.parse(readFileSync(fsManifestPath, 'utf8')) as Manifest;
  const lstatExport = manifest.exports.find((exp) => exp.name === 'lstat');
  if (!lstatExport?.nodeSignal?.sinceByMajor) {
    throw new Error('fixture setup: expected fs.json lstat export with a populated sinceByMajor map');
  }

  if (breakSinceByMajor) {
    lstatExport.nodeSignal.sinceByMajor = null;
  }
  writeFileSync(fsManifestPath, JSON.stringify(manifest, null, 2));

  return tempRoot;
}

function runCheck(tempRoot: string) {
  return spawnSync('node', [scriptPath], {
    cwd: tempRoot,
    encoding: 'utf8',
    // the script resolves from its own location, so point it at the fixture tree explicitly
    env: { ...process.env, CANC_SURFACE_ROOT: tempRoot },
  });
}

describe('surface-check signal-map fallback', () => {
  it('fails Check C when a post-floor manifest entry has no sinceByMajor map', () => {
    const tempRoot = buildFixture(true);
    try {
      const result = runCheck(tempRoot);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Check C failed: fs promises_api\.lstat manifest is missing major 26/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('passes on an unmutated copy of the fixture (sanity baseline)', () => {
    const tempRoot = buildFixture(false);
    try {
      const result = runCheck(tempRoot);
      expect(result.status).toBe(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
