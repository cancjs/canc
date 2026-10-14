// Creates one draft GitHub release and pushes tags per publish run

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');
const parseChangesetFile = require('@changesets/parse').default;

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

function extractChangelogSection(pkgName, version, customContent) {
  let content = customContent;
  if (content === undefined) {
    const dir = findPackageDir(pkgName);
    if (!dir) return `<!-- Owner: no CHANGELOG section for ${pkgName} ${version} -->`;
    const changelogPath = path.join(dir, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) return `<!-- Owner: no CHANGELOG section for ${pkgName} ${version} -->`;
    content = fs.readFileSync(changelogPath, 'utf8');
  }

  const headingRegex = new RegExp(`^##\\s+${version.replace(/\./g, '\\.')}\\s*$`, 'm');
  const match = content.match(headingRegex);
  if (!match) return `<!-- Owner: no CHANGELOG section for ${pkgName} ${version} -->`;

  const afterHeading = content.slice(match.index + match[0].length);
  const lines = [];
  for (const line of afterHeading.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      break;
    }
    if (lines.length === 0 && line.trim() === '') {
      continue;
    }
    lines.push(line);
  }

  const result = lines.join('\n').trim();
  return result.length > 0 ? result : `<!-- Owner: no CHANGELOG section for ${pkgName} ${version} -->`;
}

function getCurrentLatestMinor(options = {}) {
  if (options.currentLatestMinor) {
    return semver.coerce(options.currentLatestMinor);
  }
  const flag = getArg('--current-latest-minor');
  if (flag) {
    return semver.coerce(flag);
  }
  try {
    const out = execSync('gh release view --json tagName', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    const tag = parsed.tagName || '';
    const m = tag.match(/(\d+\.\d+\.\d+)/);
    if (m) {
      const v = semver.parse(m[1]);
      if (v) return v;
    }
  } catch {
    // gh release view unavailable
  }
  return semver.parse('1.0.0');
}

function getPreviousBetaTag(currentVersion) {
  const currentParsed = semver.parse(currentVersion);
  if (!currentParsed) return null;
  try {
    const out = execSync('git tag --list "v*-beta*"', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const tags = out
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    const candidates = [];
    for (const t of tags) {
      const vStr = t.startsWith('v') ? t.slice(1) : t;
      const v = semver.parse(vStr);
      if (
        v &&
        v.prerelease.length > 0 &&
        v.major === currentParsed.major &&
        v.minor === currentParsed.minor &&
        semver.lt(v, currentParsed)
      ) {
        candidates.push({ tag: t, ver: v });
      }
    }
    candidates.sort((a, b) => semver.rcompare(a.ver, b.ver));
    return candidates.length > 0 ? candidates[0].tag : null;
  } catch {
    // git tag query unavailable
  }
  return null;
}

function getNewChangesetSummaries(currentVersion, options = {}) {
  if (options.newChangesetSummaries) {
    return options.newChangesetSummaries;
  }

  let currentPre = null;
  if (options.preJson) {
    currentPre = options.preJson;
  } else {
    const prePath = path.join(ROOT, '.changeset/pre.json');
    if (fs.existsSync(prePath)) {
      try {
        currentPre = JSON.parse(fs.readFileSync(prePath, 'utf8'));
      } catch {
        currentPre = null;
      }
    }
  }

  if (!currentPre || !Array.isArray(currentPre.changesets)) {
    return [];
  }

  const prevTag = options.previousBetaTag !== undefined ? options.previousBetaTag : getPreviousBetaTag(currentVersion);
  let previousChangesetIds = new Set();

  if (prevTag) {
    try {
      const prevOut = execSync(`git show "${prevTag}:.changeset/pre.json"`, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const parsed = JSON.parse(prevOut);
      previousChangesetIds = new Set(parsed.changesets || []);
    } catch {
      // tag pre.json unreadable
    }
  } else if (!currentVersion.endsWith('-beta.0') && !currentVersion.endsWith('.0')) {
    try {
      const prevOut = execSync('git show "HEAD^:.changeset/pre.json"', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const parsed = JSON.parse(prevOut);
      previousChangesetIds = new Set(parsed.changesets || []);
    } catch {
      // parent commit pre.json unreadable
    }
  } else {
    return [];
  }

  const newIds = currentPre.changesets.filter((id) => !previousChangesetIds.has(id));
  const summaries = [];
  const csDir = options.changesetDir || path.join(ROOT, '.changeset');

  for (const id of newIds) {
    let content;
    const fileOnDisk = path.join(csDir, `${id}.md`);
    if (fs.existsSync(fileOnDisk)) {
      content = fs.readFileSync(fileOnDisk, 'utf8');
    } else {
      try {
        content = execSync(`git show "HEAD:.changeset/${id}.md"`, {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        content = null;
      }
    }

    if (!content) continue;

    let parsed;
    try {
      parsed = parseChangesetFile(content);
    } catch {
      continue;
    }

    const firstLine = (parsed.summary || '').trim().split(/\r?\n/)[0].trim();
    if (!firstLine) continue;

    const cleanLine = firstLine.replace(/^\([a-z0-9_-]+\)\s*/, '');
    const scopes = (parsed.releases || []).map((r) => r.name.replace(/^@cancjs\//, '')).filter(Boolean);
    const scopeSuffix = scopes.length > 0 ? ` (${scopes.join(', ')})` : '';
    const formatted = `- ${cleanLine}${cleanLine.endsWith(scopeSuffix) ? '' : scopeSuffix}`;
    summaries.push(formatted);
  }

  return summaries;
}

function generateReleaseData(published, options = {}) {
  if (!Array.isArray(published) || published.length === 0) {
    throw new Error('Published packages list is empty');
  }

  const isPrerelease = published.some((p) => p.version.includes('-'));
  const firstVersion = published[0].version;
  const isUniformVersion = published.every((p) => p.version === firstVersion);

  const currentLatest = getCurrentLatestMinor(options);
  let minorTrainVersion = null;
  let highestMinor = null;
  if (!isPrerelease) {
    for (const p of published) {
      const v = semver.parse(p.version);
      if (v && v.prerelease.length === 0 && v.patch === 0) {
        const isNewer =
          !currentLatest ||
          v.major > currentLatest.major ||
          (v.major === currentLatest.major && v.minor > currentLatest.minor);
        if (isNewer && (!highestMinor || semver.gt(v, highestMinor))) {
          highestMinor = v;
          minorTrainVersion = p.version;
        }
      }
    }
  }
  const isMinorTrain = !isPrerelease && Boolean(minorTrainVersion);

  let tag;
  let title;
  let isLatest;

  if (isMinorTrain) {
    tag = `v${minorTrainVersion}`;
    title = `canc ${minorTrainVersion}`;
    isLatest = true;
  } else if (isPrerelease && isUniformVersion && published.length > 1) {
    tag = `v${firstVersion}`;
    title = `canc ${firstVersion}`;
    isLatest = false;
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
    let betaBody =
      `Prerelease of the ${firstVersion.split('-')[0]} line. ` +
      `APIs can still change between betas.\n\n` +
      `Install packages from the beta tag together:\n\n` +
      `    npm install ${betaPkgs}\n\n`;

    const changes = getNewChangesetSummaries(firstVersion, options);
    if (changes.length > 0) {
      betaBody += `Changes since the previous beta:\n\n${changes.join('\n')}\n\n`;
    }

    betaBody += `### Known issues\n\n- Server packages support HTTP/1.1 only.`;
    body = betaBody;
  } else if (isMinorTrain) {
    const summaryHint = 'replace with 2-4 sentence release summary';
    const placeholder = `<!-- Owner: ${summaryHint} -->`;
    body = `## Highlights\n\n${placeholder}\n\n`;
    for (const pkg of published) {
      const custom = options.changelogContents ? options.changelogContents[pkg.name] : undefined;
      const section = extractChangelogSection(pkg.name, pkg.version, custom);
      body += `## ${pkg.name} ${pkg.version}\n\n${section}\n\n`;
    }
  } else {
    body = '';
    for (const pkg of published) {
      const custom = options.changelogContents ? options.changelogContents[pkg.name] : undefined;
      const section = extractChangelogSection(pkg.name, pkg.version, custom);
      body += `## ${pkg.name} ${pkg.version}\n\n${section}\n\n`;
    }
  }

  return { tag, title, isPrerelease, isLatest, body };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const published = parsePublishedPackages();
  const options = {};
  const clm = getArg('--current-latest-minor');
  if (clm) options.currentLatestMinor = clm;
  const pbt = getArg('--previous-beta-tag');
  if (pbt) options.previousBetaTag = pbt;
  const pj = getArg('--pre-json');
  if (pj) {
    try {
      options.preJson = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : JSON.parse(pj);
    } catch {
      // ignore bad JSON
    }
  }

  const data = generateReleaseData(published, options);
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

module.exports = { generateReleaseData, extractChangelogSection };
