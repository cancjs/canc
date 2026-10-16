// Generates draft release notes per package from changesets and git history

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getPackages } = require('@manypkg/get-packages');
const assembleReleasePlan = require('@changesets/assemble-release-plan').default;
const readChangesets = require('@changesets/read').default;
const config = require('@changesets/config');
const pre = require('@changesets/pre');
const semver = require('semver');

const ROOT = path.resolve(__dirname, '..');
const SHARED_IMPORT_RE =
  /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectSourceFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.includes('~~')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      collectSourceFiles(full, acc);
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.d.mts') &&
      !entry.name.endsWith('.d.cts') &&
      !/\.(spec|test)\.ts$/.test(entry.name)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function detectImportedSharedDirs(srcFiles) {
  const shared = new Set();
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    SHARED_IMPORT_RE.lastIndex = 0;
    while ((match = SHARED_IMPORT_RE.exec(content)) !== null) {
      const spec = (match[1] || match[2]).replace(/\\/g, '/');
      const found = /(?:^|\/)(_util|_toolbox|_server)(?:$|\/)/.exec(spec);
      if (found) shared.add(found[1]);
    }
  }
  if (shared.has('_toolbox') || shared.has('_server')) {
    shared.add('_util');
  }
  return [...shared].map((d) => path.join('packages', d).replace(/\\/g, '/'));
}

function findLastStableTag(pkgName, allTags) {
  const prefix = `${pkgName}@`;
  const matching = [];
  for (const t of allTags) {
    if (t.startsWith(prefix)) {
      const ver = t.slice(prefix.length);
      if (semver.valid(ver)) {
        const parsed = semver.parse(ver);
        if (!parsed.prerelease || parsed.prerelease.length === 0) {
          matching.push({ tag: t, ver });
        }
      }
    }
  }
  if (matching.length > 0) {
    matching.sort((a, b) => semver.rcompare(a.ver, b.ver));
    return matching[0].tag;
  }
  if (allTags.includes('@cancjs/promise@1.0.0')) {
    return '@cancjs/promise@1.0.0';
  }
  for (const t of allTags) {
    const at = t.lastIndexOf('@');
    const ver = at >= 0 ? t.slice(at + 1) : t.replace(/^v/, '');
    if (semver.valid(ver)) {
      const parsed = semver.parse(ver);
      if (!parsed.prerelease || parsed.prerelease.length === 0) {
        return t;
      }
    }
  }
  return null;
}

function getGitSubjects(baseTag, watchPaths) {
  const range = baseTag ? `${baseTag}..HEAD` : 'HEAD';
  const args = ['log', '--format=%s', range, '--', ...watchPaths];
  try {
    const out = execFileSync('git', args, { encoding: 'utf8', cwd: ROOT });
    return out
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractItems(summary) {
  const blocks = summary.trim().split(/\n\s*\n/);
  const items = [];
  for (const block of blocks) {
    const rawLines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let current = '';
    for (const line of rawLines) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (current) items.push(current);
        current = line.slice(2).trim();
      } else if (current && (!/[.!?]['"`)]?$/.test(current) || !/^[A-Z`*]/.test(line))) {
        current += ' ' + line;
      } else {
        if (current) items.push(current);
        current = line;
      }
    }
    if (current) items.push(current);
  }
  return items;
}

function detectNoise(item, changesetId) {
  const flags = [];
  if (
    changesetId.includes('peer-prerelease') ||
    changesetId.includes('peer-restore') ||
    changesetId.includes('release-peers') ||
    /prerelease versions in.*peer ranges/i.test(item) ||
    /restore stable peer ranges/i.test(item) ||
    /accept prerelease versions in the peer ranges/i.test(item)
  ) {
    flags.push('noise: peer-prerelease');
  }

  if (changesetId.includes('wire-prototype') || /re-export.*from shared/i.test(item) || /wireprototype/i.test(item)) {
    flags.push('noise: internal re-export');
  }

  if (
    changesetId.includes('server-shutdown-rename') ||
    /never been published/i.test(item) ||
    /never-published/i.test(item)
  ) {
    flags.push('noise: never-published rename');
  }

  if (/^\([a-z0-9_-]+\)\s*/i.test(item)) {
    flags.push('noise: scope prefix');
  }

  return flags.length > 0 ? flags.join(', ') : null;
}

function categorize(item, bumpType) {
  const clean = item
    .replace(/^\[noise:[^\]]+\]\s*/i, '')
    .replace(/^\([a-z0-9_-]+\)\s*/i, '')
    .replace(/^[*_\s-]+/, '')
    .trim();

  if (
    clean.includes('**Breaking:**') ||
    clean.includes('**BREAKING:**') ||
    /^breaking:/i.test(clean) ||
    /^breaking\b/i.test(clean) ||
    bumpType === 'major'
  ) {
    return 'Breaking';
  }

  if (/^(add|added|introduce|introduced|implement|implemented|support|supported|new)\b/i.test(clean)) {
    return 'Added';
  }

  if (
    /^(fix|fixed|correct|corrected|repair|repaired|avoid|avoided|prevent|prevented|handle|handled|stop|stopped)\b/i.test(
      clean,
    )
  ) {
    return 'Fixed';
  }

  return 'Changed';
}

async function generateReleaseNotesDraft(options = {}) {
  const isStable = options.stable !== false;
  const outDir = options.outDir || path.join(ROOT, 'release-notes-draft');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const { packages, root } = await getPackages(ROOT);
  const publicPackages = packages
    .filter((p) => !p.packageJson.private)
    .sort((a, b) => a.packageJson.name.localeCompare(b.packageJson.name));

  const readConfig = await config.read(root.dir, { packages, root });
  const allChangesets = await readChangesets(root.dir);
  const preState = isStable ? undefined : await pre.readPreState(root.dir);
  const plan = assembleReleasePlan(allChangesets, { packages, root }, readConfig, preState);
  const plannedReleases = new Map(plan.releases.map((r) => [r.name, r]));

  const allTags = execFileSync('git', ['tag', '-l'], { encoding: 'utf8', cwd: ROOT })
    .trim()
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  const writtenFiles = [];

  for (const pkg of publicPackages) {
    const pkgName = pkg.packageJson.name;
    const shortName = pkgName.replace(/^@[^/]+\//, '');
    const outFileName = `${shortName}.md`;
    const outFilePath = path.join(outDir, outFileName);

    const rel = plannedReleases.get(pkgName);
    const bumpType = rel ? rel.type : 'none';
    const newVersion = rel ? rel.newVersion : pkg.packageJson.version;

    // Changesets touching this package
    const touchingChangesets = allChangesets
      .filter((cs) => cs.releases.some((r) => r.name === pkgName))
      .sort((a, b) => a.id.localeCompare(b.id));

    // Git cross-check
    const relPkgDir = path.relative(ROOT, pkg.dir).replace(/\\/g, '/');
    const srcFiles = collectSourceFiles(path.join(pkg.dir, 'src'));
    const sharedDirs = detectImportedSharedDirs(srcFiles);
    const watchPaths = [relPkgDir, ...sharedDirs];
    const baseTag = findLastStableTag(pkgName, allTags);
    const gitSubjects = getGitSubjects(baseTag, watchPaths);

    // Group items
    const groups = {
      Breaking: [],
      Added: [],
      Changed: [],
      Fixed: [],
    };

    for (const cs of touchingChangesets) {
      const releaseInfo = cs.releases.find((r) => r.name === pkgName);
      const csBump = releaseInfo ? releaseInfo.type : 'none';
      const items = extractItems(cs.summary);

      for (const item of items) {
        const noise = detectNoise(item, cs.id);
        const prefix = noise ? `[${noise}] ` : '';
        const group = categorize(item, csBump);
        groups[group].push(`- ${prefix}${item} (${cs.id}.md)`);
      }
    }

    const lines = [];
    lines.push(`# ${pkgName}`);
    lines.push('');
    lines.push(`Planned bump: ${bumpType} (${newVersion})`);
    lines.push(`Changeset count: ${touchingChangesets.length}`);
    if (pkg.packageJson.description) {
      lines.push(`Description: ${pkg.packageJson.description}`);
    }
    lines.push('');

    lines.push('## Heuristic Groups');
    lines.push('');
    for (const groupName of ['Breaking', 'Added', 'Changed', 'Fixed']) {
      lines.push(`### ${groupName}`);
      if (groups[groupName].length === 0) {
        lines.push('(none)');
      } else {
        for (const itemLine of groups[groupName]) {
          lines.push(itemLine);
        }
      }
      lines.push('');
    }

    lines.push(`## Changesets (${touchingChangesets.length})`);
    lines.push('');
    if (touchingChangesets.length === 0) {
      lines.push('(none)');
    } else {
      for (const cs of touchingChangesets) {
        const releaseInfo = cs.releases.find((r) => r.name === pkgName);
        const csBump = releaseInfo ? releaseInfo.type : 'none';
        const items = extractItems(cs.summary);
        const firstItem = items[0] || cs.summary.trim();
        const noise = detectNoise(firstItem, cs.id);
        const noisePrefix = noise ? `[${noise}] ` : '';
        lines.push(`- ${cs.id}.md (${csBump}): ${noisePrefix}${firstItem}`);
      }
    }
    lines.push('');

    const baseTagLabel = baseTag ? `since ${baseTag}` : 'all commits';
    lines.push(`## Git Commits Cross-Check (${gitSubjects.length} commits ${baseTagLabel})`);
    lines.push('');
    if (gitSubjects.length === 0) {
      lines.push('(none)');
    } else {
      for (const subj of gitSubjects) {
        lines.push(`- ${subj}`);
      }
    }
    lines.push('');

    fs.writeFileSync(outFilePath, lines.join('\n'), 'utf8');
    writtenFiles.push(outFileName);
  }

  console.log(`[release-notes-draft] Wrote ${writtenFiles.length} draft files to ${path.relative(ROOT, outDir)}/`);
  return writtenFiles;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isStable = args.includes('--stable') || !args.includes('--beta');
  let outDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out-dir' || args[i] === '--outDir' || args[i] === '--dir') {
      outDir = args[i + 1];
    } else if (args[i].startsWith('--out-dir=')) {
      outDir = args[i].slice('--out-dir='.length);
    } else if (args[i].startsWith('--outDir=')) {
      outDir = args[i].slice('--outDir='.length);
    }
  }
  generateReleaseNotesDraft({ stable: isStable, outDir })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[release-notes-draft] FAIL: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { generateReleaseNotesDraft };
