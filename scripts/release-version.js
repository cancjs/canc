// Versions packages via changesets while keeping manifests formatted and lockfile refreshed.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function run(cmd) {
  console.log(`[release-version] ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function findChangelogs() {
  const changelogs = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) {
        if (f.name !== 'node_modules' && f.name !== '.git' && f.name !== '.nx') {
          walk(full);
        }
      } else if (f.isFile() && f.name === 'CHANGELOG.md') {
        changelogs.push(full);
      }
    }
  }
  walk(ROOT);
  return changelogs;
}

function getPrivateWorkspaces() {
  const privates = [];
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const pattern of rootPkg.workspaces || []) {
    if (pattern.endsWith('/*')) {
      const parentDir = path.join(ROOT, pattern.slice(0, -2));
      if (!fs.existsSync(parentDir)) continue;
      for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(parentDir, entry.name);
        const manifestPath = path.join(dir, 'package.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (manifest.private === true) {
            privates.push({
              dir,
              manifestPath,
              originalText: fs.readFileSync(manifestPath, 'utf8'),
            });
          }
        }
      }
    } else {
      const dir = path.join(ROOT, pattern);
      const manifestPath = path.join(dir, 'package.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.private === true) {
          privates.push({
            dir,
            manifestPath,
            originalText: fs.readFileSync(manifestPath, 'utf8'),
          });
        }
      }
    }
  }
  return privates;
}

const preJsonPath = path.join(ROOT, '.changeset/pre.json');
const isPreMode = fs.existsSync(preJsonPath) && JSON.parse(fs.readFileSync(preJsonPath, 'utf8')).mode === 'pre';

const changelogsBefore = new Set(findChangelogs());

run('node scripts/check-release-lane.js');
const privates = getPrivateWorkspaces();
run('npx changeset version');

for (const entry of privates) {
  if (fs.readFileSync(entry.manifestPath, 'utf8') !== entry.originalText) {
    fs.writeFileSync(entry.manifestPath, entry.originalText, 'utf8');
  }
  const changelogPath = path.join(entry.dir, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    fs.rmSync(changelogPath, { force: true });
  }
}

if (isPreMode) {
  run('git checkout -- "*CHANGELOG.md"');
  const changelogsAfter = findChangelogs();
  for (const f of changelogsAfter) {
    if (!changelogsBefore.has(f) && fs.existsSync(f)) {
      fs.rmSync(f, { force: true });
    }
  }
} else {
  const changelogsAfter = findChangelogs();
  for (const f of changelogsAfter) {
    const content = fs.readFileSync(f, 'utf8');
    const match = content.match(/^##\s+[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.-]+/m);
    if (match) {
      throw new Error(`Prerelease heading "${match[0]}" found in ${f} during stable versioning`);
    }
  }
}

run('npm install --package-lock-only');
// the repo eslint parses manifests differently from the prettier CLI
const MANIFESTS = '"packages/*/package.json" "packages/canc-server/*/package.json" package.json';
run(`npx eslint --fix ${MANIFESTS}`);
run(`npx eslint ${MANIFESTS}`);
run('npm run lint:root');
run('node scripts/check-package-validation.js');
