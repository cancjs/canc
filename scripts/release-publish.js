// Publishes packages via changesets with dist-tag selected by release lane

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const semver = require('semver');
const getReleasePlan = require('@changesets/get-release-plan').default;

const ROOT = path.resolve(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

function getWorkspacePublishVersion() {
  let maxVer = '0.0.0';
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const pattern of rootPkg.workspaces || []) {
    if (pattern.endsWith('/*')) {
      const parentDir = path.join(ROOT, pattern.slice(0, -2));
      if (!fs.existsSync(parentDir)) continue;
      for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(parentDir, entry.name, 'package.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (manifest.private !== true && semver.valid(manifest.version)) {
            if (semver.gt(manifest.version, maxVer)) {
              maxVer = manifest.version;
            }
          }
        }
      }
    } else {
      const manifestPath = path.join(ROOT, pattern, 'package.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.private !== true && semver.valid(manifest.version)) {
          if (semver.gt(manifest.version, maxVer)) {
            maxVer = manifest.version;
          }
        }
      }
    }
  }
  return maxVer !== '0.0.0' ? maxVer : '1.0.0';
}

async function determinePublishTag() {
  const mockLatest = getArg('--mock-latest') || getArg('--mock-registry-version');
  const mockVersion = getArg('--mock-version');

  // If mocking version and latest, evaluate registry comparison directly
  if (mockVersion && mockLatest) {
    if (semver.valid(mockVersion) && semver.valid(mockLatest) && semver.lt(mockVersion, mockLatest)) {
      const maintenanceTag = `v${semver.major(mockVersion)}.${semver.minor(mockVersion)}`;
      return {
        tag: maintenanceTag,
        explicit: true,
        reason: `maintenance line: version ${mockVersion} < registry latest ${mockLatest}`,
      };
    }
    return {
      tag: 'latest',
      explicit: true,
      reason: `stable release: version ${mockVersion} >= registry latest ${mockLatest}`,
    };
  }

  const preJsonPath = path.join(ROOT, '.changeset/pre.json');
  if (fs.existsSync(preJsonPath)) {
    const preJson = JSON.parse(fs.readFileSync(preJsonPath, 'utf8'));
    if (preJson.mode === 'pre') {
      const tag = preJson.tag || 'beta';
      // changesets refuses an explicit tag in pre mode and applies pre.json's own
      return { tag, explicit: false, reason: `beta lane (pre.json tag: ${tag})` };
    }
  }

  let version = mockVersion;
  if (!version) {
    const plan = await getReleasePlan(ROOT);
    const firstRel = plan.releases.find((r) => r.type !== 'none');
    version = firstRel ? firstRel.newVersion : getWorkspacePublishVersion();
  }

  let registryLatest = mockLatest;
  if (!registryLatest) {
    try {
      registryLatest = execSync('npm view @cancjs/promise dist-tags.latest', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      registryLatest = '0.0.0';
    }
  }

  if (semver.valid(version) && semver.valid(registryLatest) && semver.lt(version, registryLatest)) {
    const maintenanceTag = `v${semver.major(version)}.${semver.minor(version)}`;
    return {
      tag: maintenanceTag,
      explicit: true,
      reason: `maintenance line: version ${version} < registry latest ${registryLatest}`,
    };
  }

  return {
    tag: 'latest',
    explicit: true,
    reason: `stable release: version ${version} >= registry latest ${registryLatest}`,
  };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const { tag, explicit, reason } = await determinePublishTag();
  const args = [require.resolve('@changesets/cli/bin.js'), 'publish'];
  if (explicit) args.push('--tag', tag);

  console.log(`[release-publish] Tag decision: "${tag}" (${reason})`);

  if (isDryRun || process.argv.includes('--print-command')) {
    console.log(`[release-publish] Command: changeset ${args.slice(1).join(' ')}`);
  }

  if (isDryRun) {
    return;
  }

  console.log(`[release-publish] Publishing with tag "${tag}"...`);
  execFileSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[release-publish] FAIL: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { determinePublishTag };
