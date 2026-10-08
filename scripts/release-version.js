// Versions packages via changesets while keeping manifests formatted and lockfile refreshed.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function run(cmd) {
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

const preJsonPath = path.join(ROOT, '.changeset/pre.json');
const isPreMode = fs.existsSync(preJsonPath) && JSON.parse(fs.readFileSync(preJsonPath, 'utf8')).mode === 'pre';

const changelogsBefore = new Set(findChangelogs());

run('node scripts/check-release-lane.js');
run('npx changeset version');

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
run('npx prettier --write "packages/*/package.json" "packages/canc-server/*/package.json" package.json');
