// Updates and checks peerDependency ranges across package manifests for prerelease and stable lanes

'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

function listPackageManifests() {
  const manifests = [];
  for (const name of fs.readdirSync(PACKAGES_DIR)) {
    if (name.includes('~~') || name.startsWith('_')) continue;
    const dir = path.join(PACKAGES_DIR, name);
    const pPath = path.join(dir, 'package.json');
    if (fs.existsSync(pPath)) {
      manifests.push(pPath);
      continue;
    }
    if (fs.statSync(dir).isDirectory()) {
      for (const child of fs.readdirSync(dir)) {
        if (child.includes('~~')) continue;
        const childPath = path.join(dir, child, 'package.json');
        if (fs.existsSync(childPath)) {
          manifests.push(childPath);
        }
      }
    }
  }
  return manifests.sort();
}

function parseFloor(range) {
  const clauses = range.split('||').map((c) => c.trim());
  const bases = [];
  for (const clause of clauses) {
    const match = /^>=\s*(\S+)$/.exec(clause);
    if (!match || !semver.valid(match[1])) {
      return null;
    }
    const parsed = semver.parse(match[1]);
    bases.push(`${parsed.major}.${parsed.minor}.${parsed.patch}`);
  }
  if (bases.length === 0) return null;
  bases.sort(semver.compare);
  return bases[0];
}

function normalizeTargetVersion(v) {
  if (!v) return null;
  const cleaned = String(v).replace(/^v/, '');
  if (/^\d+\.\d+$/.test(cleaned)) {
    return `${cleaned}.0`;
  }
  if (/^\d+\.\d+\.\d+$/.test(cleaned)) {
    return cleaned;
  }
  const parsed = semver.valid(cleaned);
  if (parsed) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }
  return null;
}

function computeTargetRange(floor, mode, targetVersion) {
  if (mode === 'stable') {
    return `>=${floor}`;
  }
  if (mode === 'beta') {
    if (semver.lt(floor, targetVersion)) {
      return `>=${floor} || >=${targetVersion}-0`;
    }
    if (semver.eq(floor, targetVersion)) {
      return `>=${targetVersion}-0`;
    }
    return `>=${floor}`;
  }
  throw new Error(`unknown mode: ${mode}`);
}

function updateManifestPeerDependencies(fileContent, updates) {
  const peerDepMatch = /"peerDependencies"\s*:\s*\{/.exec(fileContent);
  if (!peerDepMatch) return fileContent;

  const startIndex = peerDepMatch.index + peerDepMatch[0].length;
  let depth = 1;
  let endIndex = startIndex;
  while (depth > 0 && endIndex < fileContent.length) {
    const ch = fileContent[endIndex];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    endIndex++;
  }
  let peerBlock = fileContent.slice(startIndex, endIndex - 1);
  for (const [peerName, newRange] of Object.entries(updates)) {
    const escaped = peerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`("${escaped}"\\s*:\\s*)"[^"]*"`, 'g');
    peerBlock = peerBlock.replace(re, `$1"${newRange}"`);
  }

  return fileContent.slice(0, startIndex) + peerBlock + fileContent.slice(endIndex - 1);
}

function run(argv) {
  let isCheck = false;
  let mode = null;
  let rawVersion = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/release-peers.js [--check] (--stable | --beta <version>)');
      process.exit(0);
    } else if (arg === '--check') {
      isCheck = true;
    } else if (arg === '--stable' || arg === 'stable') {
      mode = 'stable';
    } else if (arg === '--beta' || arg === 'beta') {
      mode = 'beta';
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        rawVersion = argv[++i];
      }
    } else if (arg.startsWith('--beta=')) {
      mode = 'beta';
      rawVersion = arg.slice('--beta='.length);
    } else if (arg.startsWith('beta=')) {
      mode = 'beta';
      rawVersion = arg.slice('beta='.length);
    }
  }

  if (!mode) {
    console.error('FAIL: specify --stable or --beta <version>');
    process.exit(1);
  }

  let normalizedVersion = null;
  if (mode === 'beta') {
    if (!rawVersion) {
      console.error('FAIL: --beta requires a target version (e.g. --beta 1.2)');
      process.exit(1);
    }
    normalizedVersion = normalizeTargetVersion(rawVersion);
    if (!normalizedVersion) {
      console.error(`FAIL: invalid beta version "${rawVersion}"`);
      process.exit(1);
    }
  }

  const manifests = listPackageManifests();
  const invalidRanges = [];
  const checkMismatches = [];
  const plannedUpdates = [];

  for (const manifestPath of manifests) {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    if (!manifest.peerDependencies) continue;

    const updates = {};
    for (const [peer, currentRange] of Object.entries(manifest.peerDependencies)) {
      if (!peer.startsWith('@cancjs/')) continue;
      const floor = parseFloor(currentRange);
      if (!floor) {
        invalidRanges.push(`${manifest.name}: invalid peer range for ${peer}: "${currentRange}"`);
        continue;
      }
      const targetRange = computeTargetRange(floor, mode, normalizedVersion);
      if (currentRange !== targetRange) {
        if (isCheck) {
          checkMismatches.push(`${manifest.name}: peer ${peer} is "${currentRange}", expected "${targetRange}"`);
        } else {
          updates[peer] = targetRange;
        }
      }
    }

    if (!isCheck && Object.keys(updates).length > 0) {
      plannedUpdates.push({ manifestPath, manifestName: manifest.name, content, updates });
    }
  }

  if (invalidRanges.length > 0) {
    for (const prob of invalidRanges) {
      console.error(`FAIL ${prob}`);
    }
    process.exit(1);
  }

  if (isCheck) {
    if (checkMismatches.length > 0) {
      for (const prob of checkMismatches) {
        console.error(`FAIL ${prob}`);
      }
      process.exit(1);
    }
    const label = mode === 'beta' ? `beta ${rawVersion}` : 'stable';
    console.log(`PASS: all peer ranges match ${label}`);
    process.exit(0);
  }

  if (plannedUpdates.length === 0) {
    console.log('[release-peers] peer ranges already up to date');
    return;
  }

  for (const { manifestPath, manifestName, content, updates } of plannedUpdates) {
    const updatedContent = updateManifestPeerDependencies(content, updates);
    JSON.parse(updatedContent);
    fs.writeFileSync(manifestPath, updatedContent, 'utf8');
    for (const [peer, newRange] of Object.entries(updates)) {
      console.log(`[release-peers] ${manifestName}: ${peer} -> ${newRange}`);
    }
  }

  console.log(`[release-peers] updated ${plannedUpdates.length} manifest${plannedUpdates.length === 1 ? '' : 's'}`);
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = {
  listPackageManifests,
  parseFloor,
  normalizeTargetVersion,
  computeTargetRange,
  updateManifestPeerDependencies,
  run,
};
