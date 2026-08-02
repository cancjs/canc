// Packaging gate: asserts every path a package's manifest promises (main, module, types,
// unpkg, jsdelivr, and every condition inside "exports", including nested import/require and
// versioned "types@<range>" conditions) actually lands in the tarball `npm pack` would publish.
// Runs against the PACKED file list (via `npm pack --json --dry-run`), not the source tree, so it
// catches a path that only exists in dist/ locally but got excluded by "files" or never built.
//
// High-value here specifically because the published surface is dual CJS/ESM + UMD + the
// `types@<4.7` condition + downlevel-dts output: any of those four being wrong silently ships a
// package that resolves for some consumers and not others.
//
// Assumes `npm run build` already ran (dist/ populated) for every package under packages/*.
//
// Usage: node scripts/check-package-validation.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

function listPackages() {
  return fs
    .readdirSync(PACKAGES_DIR)
    .filter((name) => fs.existsSync(path.join(PACKAGES_DIR, name, 'package.json')))
    .sort();
}

function packFileList(pkgDir) {
  const out = execSync('npm pack --json --dry-run', {
    cwd: pkgDir,
    encoding: 'utf8',
  });
  const [result] = JSON.parse(out);
  return new Set(result.files.map((f) => f.path.split(path.sep).join('/')));
}

// Every string value reachable inside package.json "exports", flattened, regardless of nesting
// depth (".", "./sub", condition objects, nested import/require branches, versioned "types@..").
function collectExportsPaths(exportsField) {
  const found = [];
  const walk = (node) => {
    if (typeof node === 'string') {
      found.push(node);
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(exportsField);
  return found;
}

function normalize(p) {
  return p.startsWith('./') ? p.slice(2) : p;
}

function checkPackage(pkgName) {
  const pkgDir = path.join(PACKAGES_DIR, pkgName);
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const packedFiles = packFileList(pkgDir);

  const referenced = new Set();
  for (const field of ['main', 'module', 'types', 'unpkg', 'jsdelivr']) {
    if (typeof manifest[field] === 'string') referenced.add(normalize(manifest[field]));
  }
  if (manifest.exports) {
    for (const p of collectExportsPaths(manifest.exports)) referenced.add(normalize(p));
  }

  const missing = [...referenced].filter((p) => !packedFiles.has(p));

  const hasCjs = [...packedFiles].some((f) => f.endsWith('.cjs'));
  const hasMjs = [...packedFiles].some((f) => f.endsWith('.mjs') && !f.endsWith('.d.mts'));
  const hasUmd = [...packedFiles].some((f) => /\.umd\.js$/.test(f));
  const hasUmdMin = [...packedFiles].some((f) => /\.umd\.min\.js$/.test(f));

  const exportsText = JSON.stringify(manifest.exports || {});
  const declaresLegacyTypesCondition = /types@</.test(exportsText);
  const hasDownlevelDts = [...packedFiles].some((f) => f.startsWith('dist/types-ts'));

  const problems = [];
  if (missing.length > 0) {
    problems.push(`manifest references paths not present in the tarball: ${missing.join(', ')}`);
  }
  if (!hasCjs || !hasMjs) {
    problems.push(`missing dual CJS/ESM output (cjs present: ${hasCjs}, mjs present: ${hasMjs})`);
  }
  if (!hasUmd || !hasUmdMin) {
    problems.push(`missing UMD output (umd present: ${hasUmd}, umd.min present: ${hasUmdMin})`);
  }
  if (declaresLegacyTypesCondition && !hasDownlevelDts) {
    problems.push('exports declares a "types@<range>" condition but no dist/types-ts* output is packed');
  }

  try {
    const publintOutput = execSync(`npx publint "${pkgDir}"`, { encoding: 'utf8' });
    if (publintOutput.includes('Error')) {
      problems.push(`publint reported errors:\n${publintOutput}`);
    }
  } catch (err) {
    problems.push(`publint execution failed:\n${err.stdout || err.message}`);
  }

  try {
    const attwOutput = execSync(`npx attw --pack "${pkgDir}"`, { encoding: 'utf8' });
    if (attwOutput.includes('Problem') || attwOutput.includes('error')) {
      problems.push(`attw reported problems:\n${attwOutput}`);
    }
  } catch (err) {
    problems.push(`attw execution failed:\n${err.stdout || err.message}`);
  }

  return { pkgName: manifest.name, problems, fileCount: packedFiles.size };
}

function main() {
  const packages = listPackages();
  let failed = false;

  for (const pkgName of packages) {
    const { pkgName: name, problems, fileCount } = checkPackage(pkgName);
    if (problems.length === 0) {
      console.log(`PASS ${name} (${fileCount} files packed)`);
    } else {
      failed = true;
      console.error(`FAIL ${name}`);
      for (const problem of problems) console.error(`  - ${problem}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

main();
