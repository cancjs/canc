// Guards the inlinable shared dirs under packages/ (currently packages/_util,
// packages/_toolbox, packages/_server; any future packages/_* dir with no
// package.json is picked up automatically).
// Those dirs have no package.json, so changesets cannot see them, yet their bytes are bundled
// per-package into every importer's published output.
// A change there must ship a changeset for every package whose published bundle inlines the
// changed bytes, including transitively (package -> shared dir -> another shared dir).
//
// Importers are derived from the source (relative import/require/export-from graph), never from a
// hardcoded list, so a new consumer is covered automatically.
//
// Usage: node scripts/check-shared-dir-changesets.js [--base <ref>]
//   --base <ref>   diff base (defaults to origin/$GITHUB_BASE_REF in a PR run, else origin/master)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

const CODE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIR_RE = /^(dist|node_modules|coverage)$/;
const SPEC_RE = /\.(spec|test)\.[jt]sx?$/;
const TESTS_DIR_RE = /(^|\/)__tests__\//;
const IMPORT_RE = /(?:from|require\()\s*['"]([^'"]+)['"]/g;

function parseArgs(argv) {
  const args = { base: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
  }
  return args;
}

function listPackageDirs() {
  return fs.readdirSync(PACKAGES_DIR).filter((name) => fs.statSync(path.join(PACKAGES_DIR, name)).isDirectory());
}

// Splits packages/* into "shared" (no package.json anywhere under it -> invisible to
// changesets, bytes get inlined) and "real" (has its own package.json, or is a family
// container whose children each have one -> published, changeset-visible packages).
function discoverDirs() {
  const shared = [];
  const real = new Map(); // dir name (possibly nested) -> published package name
  for (const name of listPackageDirs()) {
    const dir = path.join(PACKAGES_DIR, name);
    const manifestPath = path.join(dir, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      real.set(name, manifest.name);
      continue;
    }

    const childNames = fs
      .readdirSync(dir)
      .filter((childName) => fs.existsSync(path.join(dir, childName, 'package.json')));
    if (childNames.length === 0) {
      // No manifest here and no child has one either: a real inlinable shared dir.
      shared.push(name);
      continue;
    }
    // A child has a manifest: this is a family container, not a shared dir.
    // Its children are real packages, registered under their nested path so downstream file
    // walks still work.
    for (const childName of childNames) {
      const childManifestPath = path.join(dir, childName, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(childManifestPath, 'utf8'));
      real.set(path.join(name, childName), manifest.name);
    }
  }
  return { shared, real };
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_RE.test(entry.name)) continue;
      out.push(...walkFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && CODE_EXT_RE.test(entry.name) && !SPEC_RE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null; // only relative imports can reach a sibling dir
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    base,
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

// Transitive closure of every source file reachable from entryFiles via relative imports,
// including files that live outside the starting package (i.e. inside a shared dir, or a shared
// dir another shared dir pulls in).
function transitiveFiles(entryFiles) {
  const visited = new Set();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const content = fs.readFileSync(file, 'utf8');
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(content))) {
      const resolved = resolveImport(file, match[1]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

function findImporters(sharedDirName, real) {
  const sharedAbs = path.join(PACKAGES_DIR, sharedDirName) + path.sep;
  const importers = [];
  for (const [dirName, pkgName] of real) {
    const closure = transitiveFiles(walkFiles(path.join(PACKAGES_DIR, dirName)));
    for (const file of closure) {
      if (file.startsWith(sharedAbs)) {
        importers.push(pkgName);
        break;
      }
    }
  }
  return importers;
}

function changedFiles(base, { filter = '', pathspec = '' } = {}) {
  const filterArg = filter ? ` --diff-filter=${filter}` : '';
  const pathArg = pathspec ? ` -- ${pathspec}` : '';
  for (const range of [`${base}...HEAD`, `${base} HEAD`]) {
    try {
      const out = execSync(`git diff --name-only${filterArg} ${range}${pathArg}`, { cwd: ROOT, encoding: 'utf8' });
      return out.split('\n').filter(Boolean);
    } catch {
      continue;
    }
  }
  throw new Error(`could not diff against base "${base}"`);
}

function resolveBase(explicitBase) {
  if (explicitBase) return explicitBase;
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    for (const candidate of [`origin/${baseRef}`, baseRef]) {
      try {
        execSync(`git rev-parse --verify ${candidate}`, { cwd: ROOT, stdio: 'ignore' });
        return candidate;
      } catch {
        continue;
      }
    }
  }
  return 'origin/master';
}

function isSpecOnlyPath(file) {
  return SPEC_RE.test(file) || TESTS_DIR_RE.test(file);
}

function changedSharedDirs(files, shared) {
  const touched = new Set();
  for (const file of files) {
    if (isSpecOnlyPath(file)) continue;
    for (const dirName of shared) {
      if (file.startsWith(`packages/${dirName}/`)) touched.add(dirName);
    }
  }
  return [...touched];
}

// only changesets added or modified on this branch count, not ones already at the base
function changesetCoveredPackages(base) {
  const covered = new Set();
  for (const rel of changedFiles(base, { filter: 'AM', pathspec: '.changeset/' })) {
    const name = path.basename(rel);
    if (path.dirname(rel) !== '.changeset' || !name.endsWith('.md') || name === 'README.md') continue;
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) continue;
    for (const line of frontmatter[1].split('\n')) {
      const m = line.match(/^\s*['"]([^'"]+)['"]\s*:\s*\S+/);
      if (m) covered.add(m[1]);
    }
  }
  return covered;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = resolveBase(args.base);
  const { shared, real } = discoverDirs();
  const files = changedFiles(base);
  const touchedDirs = changedSharedDirs(files, shared);

  console.log(`diff base: ${base}`);
  console.log(`shared dirs watched: ${shared.join(', ')}`);

  if (touchedDirs.length === 0) {
    console.log('no changes under inlinable shared dirs; nothing to check');
    process.exit(0);
  }

  const covered = changesetCoveredPackages(base);
  let missingAny = false;

  for (const dirName of touchedDirs) {
    const importers = findImporters(dirName, real);
    const missing = importers.filter((pkg) => !covered.has(pkg));
    console.log(`packages/${dirName} changed, importers: ${importers.join(', ') || '(none)'}`);
    if (missing.length > 0) {
      missingAny = true;
      console.log(`  missing changeset for: ${missing.join(', ')}`);
    } else {
      console.log('  changeset coverage OK');
    }
  }

  if (missingAny) {
    console.error(
      '\nFAIL: this PR touches a shared dir with no package.json (packages/_util, packages/_toolbox, packages/_server, ' +
        "or similar). Those bytes are inlined into every importing package's published output but " +
        'invisible to changesets. Add a changeset covering every importer package listed above.',
    );
    process.exit(1);
  }

  console.log('\nPASS: every importer of the changed shared dir(s) has a changeset.');
  process.exit(0);
}

main();
