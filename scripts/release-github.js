// Creates one draft GitHub release and pushes tags per publish run

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

function parsePublishedPackages() {
  const raw = getArg('--published') || process.env.PUBLISHED_PACKAGES;
  if (!raw) {
    throw new Error("No published packages provided (use --published '<json>' or PUBLISHED_PACKAGES env var)");
  }
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function generateReleaseData(published) {
  if (!Array.isArray(published) || published.length === 0) {
    throw new Error('Published packages list is empty');
  }

  const isPrerelease = published.some((p) => p.version.includes('-'));
  const firstVersion = published[0].version;
  const isUniformVersion = published.every((p) => p.version === firstVersion);
  const isTrain = isUniformVersion && published.length > 1;

  let tag;
  let title;
  const isLatest = Boolean(isTrain && !isPrerelease);

  if (isTrain) {
    tag = `v${firstVersion}`;
    title = `canc ${firstVersion}`;
  } else if (published.length === 1) {
    tag = `${published[0].name}@${published[0].version}`;
    title = `${published[0].name}@${published[0].version}`;
  } else {
    tag = `v${firstVersion}`;
    title = published.map((p) => `${p.name}@${p.version}`).join(', ');
  }

  let body;
  if (isPrerelease) {
    body =
      `Prerelease of the ${firstVersion.split('-')[0]} line. APIs can still change between betas.\n\n` +
      `Install packages from the beta tag together:\n\n` +
      `    npm install ${published.map((p) => `${p.name}@beta`).join(' ')}\n\n` +
      `### Known issues\n\n- Server packages support HTTP/1.1 only.`;
  } else if (isTrain) {
    body =
      `canc ${firstVersion} brings cancelable server handlers, a Node.js standard library wrapper, ` +
      `and typed failures across the core packages. Ecosystem packages contain breaking changes in this minor, ` +
      `listed first in each section below. Pin ecosystem packages with a tilde range such as ~1.1.\n\n` +
      `New packages: @cancjs/node, @cancjs/server-node, @cancjs/server-express, @cancjs/server-fastify, ` +
      `@cancjs/server-hono, @cancjs/server-koa.\n\n`;

    for (const pkg of published) {
      body += `## ${pkg.name} ${pkg.version}\n\n`;
    }
  } else {
    body = `Release for ${title}.\n\n`;
    for (const pkg of published) {
      body += `## ${pkg.name} ${pkg.version}\n\n`;
    }
  }

  return { tag, title, isPrerelease, isLatest, body };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const published = parsePublishedPackages();
  const { tag, title, isPrerelease, isLatest, body } = generateReleaseData(published);

  const bodyHead = body.split('\n\n')[0].replace(/\n/g, ' ');

  console.log(`tag: ${tag}`);
  console.log(`title: ${title}`);
  console.log(`prerelease: ${isPrerelease}`);
  console.log(`latest: ${isLatest}`);
  console.log(`body head: ${bodyHead}`);

  if (isDryRun) {
    return;
  }

  // Push individual package tags
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

  // Push train tag if train release
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

  // Create GitHub draft release
  const prereleaseFlag = isPrerelease ? '--prerelease' : '';
  const latestFlag = isLatest ? '--latest' : '--latest=false';
  const tmpNotes = path.join(ROOT, '.release-notes.tmp');
  fs.writeFileSync(tmpNotes, body, 'utf8');

  try {
    execSync(
      `gh release create "${tag}" --draft --title "${title}" ${prereleaseFlag} ${latestFlag} --notes-file "${tmpNotes}"`,
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
