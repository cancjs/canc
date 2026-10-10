// Fails when a public name or member disappears from a surface baseline
// A regenerated baseline passes the baseline check, so compare against the base ref instead
// Base side comes from git, the other from disk, so an uncommitted regenerate counts too
// No build needed, only baseline files are read
//
// removed  name or member in a base ref baseline that is gone on disk
// floor    name from surface-1.0.0-names.json missing on disk, catches removals merged earlier
//          (internal block counts: a few underscore names live only there)
// scripts/surface-removals.json waives an entry, each with a written reason
//
// Limits: type changes and removed overloads are left to review
// A name moved from the public part to the internal block counts as removed
//
// Usage: node scripts/check-surface-removals.mjs [--base <ref>]
//   default base: origin/$GITHUB_BASE_REF in a PR run, else origin/master
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_RE = /\/surface\/baseline\/[^/]+\.api\.md$/;
const HEADER_RE = /^# Public surface: (\S+) (\S+)\s*$/;
const HEADING_RE = /^## `([^`]+)` \(\w+\)\s*$/;
const INTERNAL_HEADING = '# Internal (not public)';
const MEMBER_RE = /^(?:static\s+)?(?:readonly\s+)?([A-Za-z_$][\w$]*|"[^"]+"|\[[^\]]+\])\??(?::|\()/;

function fail(message) {
  console.log(`FAIL ${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe' });
}

function resolveBase(argv) {
  const flag = argv.indexOf('--base');
  let ref = 'origin/master';
  if (flag !== -1) ref = argv[flag + 1] || '';
  else if (process.env.GITHUB_BASE_REF) ref = `origin/${process.env.GITHUB_BASE_REF}`;
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    fail(`base ref not found: ${ref}`);
  }
  return ref;
}

// public names, generics stripped, each mapped to its member names
function parseBaseline(text, label) {
  const lines = text.split(/\r?\n/);
  const header = HEADER_RE.exec(lines[0]);
  if (!header) fail(`unreadable baseline header: ${label}`);
  const names = new Map();
  const internal = new Set();
  let inInternal = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === INTERNAL_HEADING) inInternal = true;
    const heading = HEADING_RE.exec(lines[i]);
    if (!heading) continue;
    const name = heading[1].replace(/<[\s\S]*$/, '');
    if (inInternal) {
      internal.add(name);
      continue;
    }
    const members = new Set();
    names.set(name, members);
    if (!lines[i + 2] || !lines[i + 2].startsWith('```')) continue;
    for (let j = i + 3; j < lines.length && !lines[j].startsWith('```'); j++) {
      const member = MEMBER_RE.exec(lines[j]);
      if (member) members.add(member[1]);
    }
  }
  return { pkg: header[1], entry: header[2], names, internal };
}

function findDiskBaselines(dir, out) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === 'dist') continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) findDiskBaselines(full, out);
    else if (BASELINE_RE.test(full.replace(/\\/g, '/'))) out.push(full);
  }
  return out;
}

function loadRemovals() {
  const file = join(ROOT, 'scripts', 'surface-removals.json');
  const removals = JSON.parse(readFileSync(file, 'utf8')).removals;
  if (!Array.isArray(removals)) fail('surface-removals.json needs a removals array');
  removals.forEach((entry, index) => {
    for (const key of ['package', 'entry', 'name', 'reason']) {
      if (typeof entry[key] !== 'string' || entry[key] === '') {
        fail(`surface-removals.json entry ${index} needs a string ${key}`);
      }
    }
    if (entry.name === '*') fail(`surface-removals.json entry ${index} cannot use a wildcard name`);
    if (entry.member !== undefined && typeof entry.member !== 'string') {
      fail(`surface-removals.json entry ${index} member must be a string`);
    }
    if (entry.reason.length < 10) fail(`surface-removals.json entry ${index} reason is too short`);
  });
  return removals;
}

const argv = process.argv.slice(2);
const base = resolveBase(argv);
const removals = loadRemovals();
const usedRemovals = new Set();

// A name entry also covers that name's members
function isListed(pkg, entry, name, member) {
  let listed = false;
  removals.forEach((item, index) => {
    if (item.package !== pkg || item.entry !== entry || item.name !== name) return;
    if (item.member !== undefined && item.member !== member) return;
    usedRemovals.add(index);
    listed = true;
  });
  return listed;
}

const disk = new Map();
for (const file of findDiskBaselines(join(ROOT, 'packages'), [])) {
  const parsed = parseBaseline(readFileSync(file, 'utf8'), file);
  disk.set(`${parsed.pkg} ${parsed.entry}`, parsed);
}

const failures = [];
const packages = new Set();
let compared = 0;
const baseFiles = git(['ls-tree', '-r', '--name-only', base, '--', 'packages'])
  .split('\n')
  .filter((path) => BASELINE_RE.test(path));
for (const path of baseFiles) {
  const before = parseBaseline(git(['show', `${base}:${path}`]), `${base}:${path}`);
  packages.add(before.pkg);
  const after = disk.get(`${before.pkg} ${before.entry}`);
  for (const [name, members] of before.names) {
    compared++;
    const now = after && after.names.get(name);
    if (!now) {
      if (!isListed(before.pkg, before.entry, name)) failures.push(`removed: ${before.pkg} ${before.entry} ${name}`);
      continue;
    }
    for (const member of members) {
      if (now.has(member) || isListed(before.pkg, before.entry, name, member)) continue;
      failures.push(`removed: ${before.pkg} ${before.entry} ${name}.${member}`);
    }
  }
}

const floor = JSON.parse(readFileSync(join(ROOT, 'scripts', 'surface-1.0.0-names.json'), 'utf8'));
let floorNames = 0;
for (const [key, names] of Object.entries(floor)) {
  const [pkg, entry] = key.split(' ');
  const now = disk.get(key);
  for (const name of names) {
    floorNames++;
    if (now && (now.names.has(name) || now.internal.has(name))) continue;
    if (!isListed(pkg, entry, name)) failures.push(`floor: ${pkg} ${entry} ${name}`);
  }
}

if (failures.length > 0) {
  for (const failure of new Set(failures)) console.log(`FAIL ${failure}`);
  process.exit(1);
}
console.log(
  `PASS surface removals: ${packages.size} packages, ${compared} names compared, ${usedRemovals.size} listed, floor ${floorNames} names`,
);
