// Creates one draft GitHub release and pushes tags per publish run

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

const ROOT = path.resolve(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function parsePublishedPackages() {
  const raw = getArg('--published') || process.env.PUBLISHED_PACKAGES;
  if (!raw) {
    const hint = "use --published '<json>' or PUBLISHED_PACKAGES env var";
    throw new Error(`No published packages provided (${hint})`);
  }
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function findPackageDir(pkgName) {
  const pkgJsonPath = path.join(ROOT, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
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
          if (manifest.name === pkgName) return dir;
        }
      }
    } else {
      const dir = path.join(ROOT, pattern);
      const manifestPath = path.join(dir, 'package.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.name === pkgName) return dir;
      }
    }
  }
  return null;
}

function extractChangelogSection(pkgName, version) {
  const dir = findPackageDir(pkgName);
  if (!dir) return '- Maintenance update.';
  const changelogPath = path.join(dir, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) return '- Maintenance update.';

  const content = fs.readFileSync(changelogPath, 'utf8');
  const heading = `## ${version}`;
  const idx = content.indexOf(heading);
  if (idx === -1) return '- Maintenance update.';

  const afterHeading = content.slice(idx + heading.length);
  const lines = [];
  for (const line of afterHeading.split('\n')) {
    if (line.startsWith('## ')) {
      break;
    }
    if (lines.length === 0 && line.trim() === '') {
      continue;
    }
    lines.push(line);
  }

  const result = lines.join('\n').trim();
  return result.length > 0 ? result : '- Maintenance update.';
}

function generateReleaseData(published) {
  if (!Array.isArray(published) || published.length === 0) {
    throw new Error('Published packages list is empty');
  }

  const isPrerelease = published.some((p) => p.version.includes('-'));
  const firstVersion = published[0].version;
  const isUniformVersion = published.every((p) => p.version === firstVersion);
  const parsedFirst = semver.parse(firstVersion);
  const isZeroPatch = Boolean(parsedFirst && parsedFirst.patch === 0);
  const isMinorOrPre = isPrerelease || isZeroPatch;
  const isMinorTrain = isUniformVersion && published.length > 1 && isMinorOrPre;

  let tag;
  let title;
  let isLatest;

  if (isMinorTrain) {
    tag = `v${firstVersion}`;
    title = `canc ${firstVersion}`;
    isLatest = !isPrerelease;
  } else if (published.length === 1) {
    tag = `${published[0].name}@${published[0].version}`;
    title = `${published[0].name}@${published[0].version}`;
    isLatest = false;
  } else {
    tag = `${published[0].name}@${published[0].version}`;
    title = published.map((p) => `${p.name}@${p.version}`).join(', ');
    isLatest = false;
  }

  let body;
  if (isPrerelease) {
    const betaPkgs = published.map((p) => `${p.name}@beta`).join(' ');
    body =
      `Prerelease of the ${firstVersion.split('-')[0]} line. ` +
      `APIs can still change between betas.\n\n` +
      `Install packages from the beta tag together:\n\n` +
      `    npm install ${betaPkgs}\n\n` +
      `### Known issues\n\n- Server packages support HTTP/1.1 only.`;
  } else if (isMinorTrain) {
    const summaryHint = 'replace with 2-4 sentence release summary';
    const placeholder = `<!-- Owner: ${summaryHint} -->`;
    body = `## Highlights\n\n${placeholder}\n\n`;
    for (const pkg of published) {
      const section = extractChangelogSection(pkg.name, pkg.version);
      body += `## ${pkg.name} ${pkg.version}\n\n${section}\n\n`;
    }
  } else {
    body = '';
    for (const pkg of published) {
      const section = extractChangelogSection(pkg.name, pkg.version);
      body += `## ${pkg.name} ${pkg.version}\n\n${section}\n\n`;
    }
  }

  return { tag, title, isPrerelease, isLatest, body };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const published = parsePublishedPackages();
  const data = generateReleaseData(published);
  const { tag, title, isPrerelease, isLatest, body } = data;

  const bodyHead = body.split('\n\n')[0].replace(/\n/g, ' ');

  console.log(`tag: ${tag}`);
  console.log(`title: ${title}`);
  console.log(`prerelease: ${isPrerelease}`);
  console.log(`latest: ${isLatest}`);
  console.log(`body head: ${bodyHead}`);

  if (isDryRun) {
    return;
  }

  const tagsToPush = [];
  for (const pkg of published) {
    const pkgTag = `${pkg.name}@${pkg.version}`;
    try {
      execSync(`git tag "${pkgTag}"`, { cwd: ROOT, stdio: 'ignore' });
    } catch {
      // Tag may already exist locally
    }
    tagsToPush.push(pkgTag);
  }

  if (tag.startsWith('v')) {
    try {
      execSync(`git tag "${tag}"`, { cwd: ROOT, stdio: 'ignore' });
    } catch {
      // Tag may already exist locally
    }
    tagsToPush.push(tag);
  }

  if (tagsToPush.length > 0) {
    const tagArgs = tagsToPush.map((t) => `"${t}"`).join(' ');
    execSync(`git push origin ${tagArgs}`, { cwd: ROOT, stdio: 'inherit' });
  }

  try {
    execSync(`gh release view "${tag}"`, { cwd: ROOT, stdio: 'ignore' });
    const pfx = `[release-github] Release "${tag}" already exists`;
    console.log(`${pfx}, skipping creation`);
    return;
  } catch {
    // Release does not exist yet; proceed with creation
  }

  const prereleaseFlag = isPrerelease ? '--prerelease' : '';
  const latestFlag = isLatest ? '--latest' : '--latest=false';
  const tmpNotes = path.join(ROOT, '.release-notes.tmp');
  fs.writeFileSync(tmpNotes, body, 'utf8');

  try {
    execSync(
      `gh release create "${tag}" --draft --title "${title}" ` +
        `${prereleaseFlag} ${latestFlag} --notes-file "${tmpNotes}"`,
      {
        cwd: ROOT,
        stdio: 'inherit',
      },
    );
  } finally {
    if (fs.existsSync(tmpNotes)) {
      fs.rmSync(tmpNotes, { force: true });
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[release-github] FAIL: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { generateReleaseData };
