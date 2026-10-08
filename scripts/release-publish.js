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
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

async function getPublishablePackages(mockVersion) {
  const planReleases = new Map();
  try {
    const plan = await getReleasePlan(ROOT);
    for (const r of plan.releases) {
      if (r.type !== 'none' && r.newVersion) {
        planReleases.set(r.name, r.newVersion);
      }
    }
  } catch {
    // Release plan absent; fallback to manifests
  }

  const pkgs = [];
  const rootPkgRaw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const rootPkg = JSON.parse(rootPkgRaw);
  for (const pattern of rootPkg.workspaces || []) {
    if (pattern.endsWith('/*')) {
      const parentDir = path.join(ROOT, pattern.slice(0, -2));
      if (!fs.existsSync(parentDir)) continue;
      for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(parentDir, entry.name);
        const manifestPath = path.join(dir, 'package.json');
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.private !== true && semver.valid(manifest.version)) {
          const planned = planReleases.get(manifest.name);
          pkgs.push({
            name: manifest.name,
            targetVersion: mockVersion || planned || manifest.version,
            dir,
          });
        }
      }
    } else {
      const dir = path.join(ROOT, pattern);
      const manifestPath = path.join(dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.private !== true && semver.valid(manifest.version)) {
        const planned = planReleases.get(manifest.name);
        pkgs.push({
          name: manifest.name,
          targetVersion: mockVersion || planned || manifest.version,
          dir,
        });
      }
    }
  }
  return pkgs;
}

async function determinePublishTag() {
  const mockRegistryRaw = getArg('--mock-registry');
  const mockRegistryTag = getArg('--mock-registry-version');
  const mockLatestRaw = getArg('--mock-latest') || mockRegistryTag;
  const mockVersion = getArg('--mock-version');

  const preJsonPath = path.join(ROOT, '.changeset/pre.json');
  const hasPreJson = fs.existsSync(preJsonPath);
  const preJsonText = hasPreJson ? fs.readFileSync(preJsonPath, 'utf8') : null;
  const preJson = preJsonText ? JSON.parse(preJsonText) : null;
  const inPre = Boolean(preJson && preJson.mode === 'pre');
  const isPreMode = !mockRegistryRaw && !mockLatestRaw && inPre;

  if (isPreMode) {
    const tag = preJson.tag || 'beta';
    return {
      tag,
      explicit: false,
      reason: `beta lane (pre.json tag: ${tag})`,
    };
  }

  const pkgs = await getPublishablePackages(mockVersion);

  let mockMap = null;
  let mockLatestString = null;
  if (mockRegistryRaw) {
    try {
      mockMap = JSON.parse(mockRegistryRaw);
    } catch {
      mockMap = null;
    }
  } else if (mockLatestRaw) {
    const trimmed = mockLatestRaw.trim();
    if (trimmed.startsWith('{')) {
      try {
        mockMap = JSON.parse(trimmed);
      } catch {
        mockMap = null;
      }
    } else {
      mockLatestString = trimmed;
    }
  }

  for (const pkg of pkgs) {
    let registryLatest;
    if (mockMap) {
      registryLatest = mockMap[pkg.name] || '0.0.0';
    } else if (mockLatestString) {
      registryLatest = mockLatestString;
    } else {
      try {
        registryLatest = execSync(`npm view ${pkg.name} dist-tags.latest`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        registryLatest = '0.0.0';
      }
    }

    const { targetVersion } = pkg;
    const isTargetValid = semver.valid(targetVersion);
    const isRegistryValid = semver.valid(registryLatest);
    const isValid = isTargetValid && isRegistryValid;
    const isOutdated = isValid && semver.lt(targetVersion, registryLatest);
    if (isOutdated) {
      const maj = semver.major(targetVersion);
      const min = semver.minor(targetVersion);
      const tag = `v${maj}.${min}`;
      const reasonLead = `maintenance line: ${pkg.name}`;
      const cmp = `< registry latest ${registryLatest}`;
      const reasonVer = `version ${targetVersion} ${cmp}`;
      const reason = `${reasonLead} ${reasonVer}`;
      return { tag, explicit: true, reason };
    }
  }

  return {
    tag: 'latest',
    explicit: true,
    reason: 'stable release: all package versions >= registry latest',
  };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const { tag, explicit, reason } = await determinePublishTag();
  const args = [require.resolve('@changesets/cli/bin.js'), 'publish'];
  if (explicit) args.push('--tag', tag);

  console.log(`[release-publish] Tag decision: "${tag}" (${reason})`);

  if (isDryRun || process.argv.includes('--print-command')) {
    const cmdStr = args.slice(1).join(' ');
    console.log(`[release-publish] Command: changeset ${cmdStr}`);
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
