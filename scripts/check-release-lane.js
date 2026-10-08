// Verifies planned changeset versions match the intended release lane

'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');
const getReleasePlan = require('@changesets/get-release-plan').default;
const { getPackages } = require('@manypkg/get-packages');

const ROOT = path.resolve(__dirname, '..');

async function checkReleaseLane() {
  const preJsonPath = path.join(ROOT, '.changeset/pre.json');
  let lane;
  let preTag = null;

  if (fs.existsSync(preJsonPath)) {
    const preJson = JSON.parse(fs.readFileSync(preJsonPath, 'utf8'));
    if (preJson.mode === 'pre') {
      lane = 'beta';
      preTag = preJson.tag || 'beta';
    } else if (preJson.mode === 'exit') {
      lane = 'stable minor';
    } else {
      throw new Error(`Unexpected mode "${preJson.mode}" in .changeset/pre.json`);
    }
  } else {
    lane = 'patch';
  }

  const plan = await getReleasePlan(ROOT);
  if (!plan.workspacePackages) {
    const pkgs = await getPackages(ROOT);
    plan.workspacePackages = pkgs.packages.map((p) => ({
      name: p.packageJson.name,
      packageJson: p.packageJson,
      dir: p.dir,
    }));
  }
  const releases = plan.releases.filter((r) => {
    if (r.type === 'none') return false;
    const pkg = plan.workspacePackages.find((wp) => wp.name === r.name);
    return !pkg || !pkg.packageJson.private;
  });
  const allowMajor = process.env.CANC_RELEASE_ALLOW_MAJOR === 'true';
  const allowMinor = process.env.CANC_RELEASE_ALLOW_MINOR === 'true';

  const problems = [];

  for (const rel of releases) {
    if (rel.type === 'major' && !allowMajor) {
      problems.push(
        `Major bump planned for ${rel.name} (${rel.newVersion}), not allowed in "${lane}" lane (set CANC_RELEASE_ALLOW_MAJOR=true to override)`,
      );
    }

    const parsed = semver.parse(rel.newVersion);
    const isPrerelease = Boolean(parsed && parsed.prerelease && parsed.prerelease.length > 0);

    if (lane === 'beta') {
      if (!isPrerelease || parsed.prerelease[0] !== preTag) {
        problems.push(`Planned version ${rel.newVersion} for ${rel.name} is not a "${preTag}" prerelease in beta lane`);
      }
    } else if (lane === 'stable minor') {
      if (isPrerelease) {
        problems.push(
          `Planned version ${rel.newVersion} for ${rel.name} is a prerelease, expected stable in "${lane}" lane`,
        );
      }
      if (rel.type !== 'minor' && rel.type !== 'patch' && !(rel.type === 'major' && allowMajor)) {
        problems.push(
          `${rel.type} bump planned for ${rel.name} (${rel.newVersion}), only minor and patch allowed in "${lane}" lane`,
        );
      }
    } else if (lane === 'patch') {
      if (isPrerelease) {
        problems.push(
          `Planned version ${rel.newVersion} for ${rel.name} is a prerelease, expected stable in "${lane}" lane`,
        );
      }
      if (rel.type !== 'patch') {
        if (rel.type === 'minor' && allowMinor) {
          // Explicitly allowed by environment variable
        } else if (rel.type === 'major' && allowMajor) {
          // Explicitly allowed by environment variable
        } else {
          problems.push(
            `${rel.type} bump planned for ${rel.name} (${rel.newVersion}), only patch allowed in patch lane (set CANC_RELEASE_ALLOW_MINOR=true to override)`,
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    console.error(`[check-release-lane] FAIL in "${lane}" lane:`);
    for (const p of problems) {
      console.error(`  - ${p}`);
    }
    return false;
  }

  console.log(`[check-release-lane] PASS: all ${releases.length} planned releases valid for "${lane}" lane.`);
  return true;
}

if (require.main === module) {
  checkReleaseLane()
    .then((ok) => {
      if (!ok) process.exit(1);
    })
    .catch((err) => {
      console.error(`[check-release-lane] FAIL: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { checkReleaseLane };
