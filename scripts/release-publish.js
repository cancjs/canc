// Publishes packages via changesets with dist-tag selected by release lane

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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

function resolveNpmCli() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  try {
    return require.resolve('npm/bin/npm-cli.js');
  } catch {
    return path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  }
}
const npmCli = resolveNpmCli();

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
      installCheck: true,
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
        const out = execFileSync(process.execPath, [npmCli, 'view', pkg.name, 'dist-tags.latest', '--json'], {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const trimmed = (out || '').trim();
        if (!trimmed) {
          registryLatest = '0.0.0';
        } else {
          const parsed = JSON.parse(trimmed);
          registryLatest = typeof parsed === 'string' ? parsed.trim() : parsed || '0.0.0';
        }
      } catch (err) {
        const stderr = (err.stderr || '').toString();
        const stdout = (err.stdout || '').toString();
        const isE404 = stderr.includes('E404') || stderr.includes('404 Not Found') || stdout.includes('"E404"');
        if (isE404) {
          registryLatest = '0.0.0';
        } else {
          throw new Error(`npm view failed for ${pkg.name}: ${err.message || err}`, { cause: err });
        }
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
      const tag = `latest-${maj}.${min}`;
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
  const { tag, explicit, installCheck, reason } = await determinePublishTag();
  const args = [require.resolve('@changesets/cli/bin.js'), 'publish'];
  if (explicit) args.push('--tag', tag);

  console.log(`[release-publish] Tag decision: "${tag}" (${reason})`);

  if (isDryRun || process.argv.includes('--print-command')) {
    const cmdStr = args.slice(1).join(' ');
    console.log(`[release-publish] Command: changeset ${cmdStr}`);
    if (installCheck) {
      console.log('[release-publish] Would run install check: check-beta-install.js --no-build');
    }
  }

  if (isDryRun) {
    return;
  }

  if (installCheck) {
    // versioned tree only exists here, build already ran earlier in the job
    console.log('[release-publish] Running prerelease install check...');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'check-beta-install.js'), '--no-build'], {
        stdio: 'inherit',
        cwd: ROOT,
      });
    } catch {
      throw new Error('prerelease install check failed, nothing was published');
    }
  }

  // a logged-in dev machine would publish for real, only the Release workflow may
  if (process.env.GITHUB_ACTIONS !== 'true' && process.env.CANC_ALLOW_LOCAL_PUBLISH !== '1') {
    throw new Error('refusing to publish outside the Release workflow (set CANC_ALLOW_LOCAL_PUBLISH=1 to override)');
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
