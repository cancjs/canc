// Checks changeset and changelog prose formatting, forbidden characters,
// frontmatter constraints, and release plan consistency.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const parseChangesetFile = require('@changesets/parse').default;
const readChangesets = require('@changesets/read').default;
const assembleReleasePlan = require('@changesets/assemble-release-plan').default;
const config = require('@changesets/config');
const pre = require('@changesets/pre');
const { getPackages } = require('@manypkg/get-packages');

const ROOT = path.resolve(__dirname, '..');

const BAD_CHARS = [
  ['\u2014', 'em dash'],
  ['\u2013', 'en dash'],
  ['\u2026', 'ellipsis'],
  ['\u2192', 'arrow'],
  ['\u2190', 'arrow'],
  ['\u2194', 'arrow'],
  ['\u21d2', 'arrow'],
  ['\u21d0', 'arrow'],
  ['\u21d4', 'arrow'],
  ['\u2500', 'box drawing'],
  ['\u00b7', 'middot'],
  ['\u00d7', 'multiplication sign'],
  ['\u2713', 'check mark'],
  ['\u2717', 'ballot x'],
  ['\u2718', 'ballot x'],
  ['\u2716', 'heavy multiplication x'],
  ['\u2264', 'less-or-equal'],
  ['\u2265', 'greater-or-equal'],
  ['\u00b1', 'plus-minus'],
  ['\u00a7', 'section sign'],
  ['\u26a0', 'warning sign'],
  ['\u2018', 'curly quote'],
  ['\u2019', 'curly quote'],
  ['\u201c', 'curly quote'],
  ['\u201d', 'curly quote'],
  ['\u00a0', 'non-breaking space'],
  ['\u200B', 'zero-width space'],
  ['\uFEFF', 'byte order mark'],
];

const EMOJI_RE = /[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}\u{2b00}-\u{2bff}]|\ufe0f|\p{Extended_Pictographic}/u;

function parseArgs(argv) {
  const args = {
    base: null,
    plan: false,
    changelogDiff: false,
    all: false,
    files: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base') {
      args.base = argv[++i];
    } else if (arg.startsWith('--base=')) {
      args.base = arg.slice('--base='.length);
    } else if (arg === '--plan') {
      args.plan = true;
    } else if (arg === '--changelog-diff') {
      args.changelogDiff = true;
    } else if (arg === '--all') {
      args.all = true;
    } else if (!arg.startsWith('--')) {
      args.files.push(arg);
    }
  }

  return args;
}

function refExists(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', ref], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function resolveBase(explicitBase) {
  const requested = explicitBase || process.env.GITHUB_BASE_REF;
  if (!requested) {
    if (refExists('origin/master')) return 'origin/master';
    if (refExists('master')) return 'master';
    if (refExists('HEAD')) return 'HEAD';
    throw new Error('FAIL base ref not found (tried origin/master, master, HEAD)');
  }

  for (const candidate of [requested, `origin/${requested}`]) {
    if (refExists(candidate)) return candidate;
  }

  throw new Error(`FAIL base ref not found: ${requested} (tried ${requested}, origin/${requested})`);
}

function getChangedFiles(baseRef) {
  const attempts = [
    ['diff', '--name-only', '--no-renames', `${baseRef}...HEAD`],
    ['diff', '--name-only', '--no-renames', baseRef, 'HEAD'],
  ];
  for (const args of attempts) {
    try {
      const out = execFileSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
      });
      return out
        .trim()
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter(Boolean);
    } catch {
      continue;
    }
  }
  return [];
}

function validateChangesetFile(filePath) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);
  const errors = [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    errors.push(`${relPath}: cannot read file: ${err.message}`);
    return errors;
  }

  if (!content.trim().startsWith('---')) {
    errors.push(`${relPath}: missing frontmatter delimiter`);
    return errors;
  }

  let parsed;
  try {
    parsed = parseChangesetFile(content);
  } catch (err) {
    errors.push(`${relPath}: invalid changeset frontmatter: ${err.message}`);
    return errors;
  }

  const isCurated = fileName.startsWith('release-');

  if (isCurated && parsed.releases.length !== 1) {
    const pkgList = parsed.releases.map((r) => r.name).join(', ') || 'none';
    errors.push(
      `${relPath}: curated release changeset must specify exactly one package in frontmatter (found ${parsed.releases.length}: ${pkgList})`,
    );
  } else if (!isCurated && parsed.releases.length === 0) {
    errors.push(`${relPath}: changeset must specify at least one package in frontmatter`);
  }

  if (!parsed.summary || parsed.summary.trim().length === 0) {
    errors.push(`${relPath}: changeset body is empty`);
  }

  const lines = content.split(/\r?\n/);
  let frontmatterEndIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      frontmatterEndIndex = i;
      break;
    }
  }

  let inCodeBlock = false;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    for (const [char, name] of BAD_CHARS) {
      if (line.includes(char)) {
        errors.push(`${relPath}:${lineNum}: non-keyboard character "${char}" (${name})`);
      }
    }
    if (EMOJI_RE.test(line)) {
      errors.push(`${relPath}:${lineNum}: emoji not allowed`);
    }

    if (idx > frontmatterEndIndex) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inCodeBlock = !inCodeBlock;
        return;
      }

      if (!inCodeBlock) {
        const scopeMatch = /^\s*(?:(?:[-*]|\d+\.)\s+)?\(([a-zA-Z0-9_-]+)\)(?:\s*[:\u2014\u2013-]\s*|\s+|$)/.exec(line);
        if (scopeMatch) {
          errors.push(`${relPath}:${lineNum}: changeset body opens with (scope) prefix "(${scopeMatch[1]})"`);
        }

        if (isCurated) {
          const betaMatch = /\b(beta[s]?|pre-?release[s]?)\b/i.exec(line);
          if (betaMatch) {
            errors.push(
              `${relPath}:${lineNum}: curated release changeset must not contain beta wording ("${betaMatch[1]}")`,
            );
          }
        }
      }
    }
  });

  return errors;
}

function getChangesetsAtRef(baseRef) {
  let output;
  try {
    output = execFileSync('git', ['ls-tree', '--name-only', `${baseRef}:.changeset`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch {
    return [];
  }

  const files = output
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const changesets = [];
  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    try {
      const fileContent = execFileSync('git', ['show', `${baseRef}:.changeset/${file}`], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      const parsed = parseChangesetFile(fileContent);
      const id = file.replace(/\.md$/, '');
      changesets.push({
        id,
        releases: parsed.releases,
        summary: parsed.summary,
      });
    } catch {
      // skip unreadable changesets at base
    }
  }

  return changesets;
}

async function checkReleasePlan(explicitBase) {
  const baseRef = resolveBase(explicitBase);
  const errors = [];

  const { packages, root } = await getPackages(ROOT);
  const readConfig = await config.read(root.dir, { packages, root });
  const preState = await pre.readPreState(root.dir);

  const baseChangesets = getChangesetsAtRef(baseRef);
  const basePlan = assembleReleasePlan(baseChangesets, { packages, root }, readConfig, preState);
  const baseMap = new Map(basePlan.releases.map((r) => [r.name, r]));

  const changesetDir = path.join(ROOT, '.changeset');
  const diskFiles = fs.existsSync(changesetDir) ? fs.readdirSync(changesetDir) : [];
  const curatedFiles = diskFiles.filter((f) => f.startsWith('release-') && f.endsWith('.md'));

  for (const cf of curatedFiles) {
    const fullPath = path.join(changesetDir, cf);
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    try {
      const parsed = parseChangesetFile(fileContent);
      for (const rel of parsed.releases) {
        const baseRel = baseMap.get(rel.name);
        if (!baseRel) {
          errors.push(`FAIL curated file ${cf}: package ${rel.name} is not in base release plan`);
        } else if (rel.type !== baseRel.type) {
          errors.push(`FAIL release plan mismatch for ${rel.name}: expected ${baseRel.type}, got ${rel.type}`);
        }
      }
    } catch {
      // parse errors reported in changeset validation
    }
  }

  const currentChangesets = await readChangesets(root.dir);
  const currentPlan = assembleReleasePlan(currentChangesets, { packages, root }, readConfig, preState);
  const currentMap = new Map(currentPlan.releases.map((r) => [r.name, r]));

  for (const [name, baseRel] of baseMap) {
    const curRel = currentMap.get(name);
    if (!curRel) {
      errors.push(`FAIL release plan mismatch for ${name}: package missing from release plan`);
    } else if (curRel.type !== baseRel.type) {
      const msg = `FAIL release plan mismatch for ${name}: expected ${baseRel.type}, got ${curRel.type}`;
      if (!errors.includes(msg)) {
        errors.push(msg);
      }
    } else if (curRel.newVersion !== baseRel.newVersion) {
      const msg = `FAIL release plan mismatch for ${name}: expected version ${baseRel.newVersion}, got ${curRel.newVersion}`;
      if (!errors.includes(msg)) {
        errors.push(msg);
      }
    }
  }

  for (const [name] of currentMap) {
    if (!baseMap.has(name)) {
      errors.push(`FAIL release plan mismatch: unexpected package ${name} in release plan`);
    }
  }

  if (errors.length > 0) {
    for (const err of errors) {
      console.error(err);
    }
    return false;
  }

  console.log(`PASS release plan matches base (${basePlan.releases.length} packages)`);
  return true;
}

function checkChangelogDiff(explicitBase) {
  const errors = [];
  let diff = '';
  const pathspecs = ['--', '**/CHANGELOG.md', 'CHANGELOG.md'];

  try {
    diff = execFileSync('git', ['diff', '--unified=0', 'HEAD', ...pathspecs], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch {
    /* ignore */
  }

  try {
    const baseRef = resolveBase(explicitBase);
    let branchDiff = '';
    for (const rangeArgs of [[`${baseRef}...HEAD`], [baseRef, 'HEAD']]) {
      try {
        branchDiff = execFileSync('git', ['diff', '--unified=0', ...rangeArgs, ...pathspecs], {
          cwd: ROOT,
          encoding: 'utf8',
        });
        break;
      } catch {
        continue;
      }
    }
    if (branchDiff) {
      diff = diff ? `${diff}\n${branchDiff}` : branchDiff;
    }
  } catch {
    /* ignore */
  }

  if (!diff.trim()) {
    console.log('PASS no CHANGELOG.md diff found');
    return true;
  }

  let currentFile = '';
  let preState;
  try {
    preState = JSON.parse(fs.readFileSync(path.join(ROOT, '.changeset', 'pre.json'), 'utf8'));
  } catch {
    preState = undefined;
  }
  const isStable = !preState || preState.mode === 'exit';

  const lines = diff.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    const addedText = line.slice(1);

    for (const [char, name] of BAD_CHARS) {
      if (addedText.includes(char)) {
        errors.push(`${currentFile}: non-keyboard character "${char}" (${name}) in changelog`);
      }
    }
    if (EMOJI_RE.test(addedText)) {
      errors.push(`${currentFile}: emoji not allowed in changelog`);
    }

    const scopeMatch = /^\s*(?:(?:[-*]|\d+\.)\s+)?\(([a-zA-Z0-9_-]+)\)(?:\s*[:\u2014\u2013-]\s*|\s+|$)/.exec(addedText);
    if (scopeMatch) {
      errors.push(`${currentFile}: changelog line opens with (scope) prefix: "${addedText.trim()}"`);
    }

    if (isStable) {
      if (/^##\s+.*-(?:beta|alpha|rc|pre|prerelease|canary|[a-zA-Z0-9.-]+)/i.test(addedText.trim())) {
        errors.push(`${currentFile}: changelog contains prerelease heading in stable mode: "${addedText.trim()}"`);
      } else {
        const betaMatch = /\b(beta[s]?|pre-?release[s]?)\b/i.exec(addedText);
        if (betaMatch) {
          errors.push(
            `${currentFile}: changelog contains prerelease wording in stable mode ("${betaMatch[1]}"): "${addedText.trim()}"`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    for (const err of errors) {
      console.error(`FAIL ${err}`);
    }
    return false;
  }

  console.log('PASS CHANGELOG.md diff is clean');
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let passed = true;

  if (args.changelogDiff) {
    const changelogOk = checkChangelogDiff(args.base);
    if (!changelogOk) passed = false;
  }

  if (args.plan) {
    const planOk = await checkReleasePlan(args.base);
    if (!planOk) passed = false;
  }

  if (!args.plan && !args.changelogDiff) {
    const isPR = Boolean(process.env.GITHUB_BASE_REF) && !args.all;
    let filesToCheck = [];

    if (args.files.length > 0) {
      filesToCheck = args.files;
    } else if (isPR) {
      const baseRef = resolveBase(args.base);
      const changed = getChangedFiles(baseRef);
      filesToCheck = changed.filter(
        (f) => f.startsWith('.changeset/') && f.endsWith('.md') && !f.endsWith('README.md'),
      );
      const changelogsChanged = changed.filter((f) => f.endsWith('CHANGELOG.md'));

      if (filesToCheck.length === 0 && changelogsChanged.length === 0) {
        console.log(
          `[check-release-notes] no changeset or changelog files changed against ${baseRef}; nothing to check`,
        );
        process.exit(0);
      }

      if (changelogsChanged.length > 0) {
        const changelogOk = checkChangelogDiff(args.base);
        if (!changelogOk) passed = false;
      }
    } else {
      const csDir = path.join(ROOT, '.changeset');
      if (fs.existsSync(csDir)) {
        filesToCheck = fs
          .readdirSync(csDir)
          .filter((f) => f.endsWith('.md') && f !== 'README.md')
          .map((f) => path.join('.changeset', f));
      }
    }

    const allErrors = [];
    let checkedCount = 0;

    for (const relFile of filesToCheck) {
      const fullPath = path.resolve(ROOT, relFile);
      if (!fs.existsSync(fullPath)) continue;
      checkedCount++;
      const fileErrors = validateChangesetFile(fullPath);
      allErrors.push(...fileErrors);
    }

    if (allErrors.length > 0) {
      for (const err of allErrors) {
        console.error(`FAIL ${err}`);
      }
      passed = false;
    } else if (checkedCount > 0) {
      console.log(`PASS ${checkedCount} changeset${checkedCount === 1 ? '' : 's'} checked`);
    }

    const csDir = path.join(ROOT, '.changeset');
    if (fs.existsSync(csDir)) {
      const hasCurated = fs.readdirSync(csDir).some((f) => f.startsWith('release-') && f.endsWith('.md'));
      if (hasCurated) {
        const planOk = await checkReleasePlan(args.base);
        if (!planOk) passed = false;
      }
    }
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL unexpected error: ${err.message}`);
  process.exit(1);
});
