// Validates a commit message against the repo's one-line subject format and staged file scope.
// Runs as a lefthook commit-msg command: node scripts/check-commit-msg.js <msg-file>
//
// Usage: node scripts/check-commit-msg.js <commit-msg-file>

const { execSync } = require('child_process');
const fs = require('fs');

const SUBJECT_RE = /^\([a-z][a-z-]*\) [A-Z].{0,68}$/;

const PACKAGE_TO_SCOPE = {
  'canc-promise': 'promise',
  'canc-coroutine': 'coroutine',
  'canc-decorators': 'decorators',
  'canc-fetch': 'fetch',
  'canc-axios': 'axios',
  'canc-toolbox': 'toolbox',
  'canc-toolbox-native': 'toolbox',
  'canc-server': 'server',
  'canc-node': 'node',
  'canc-unhandled-rejection': 'unhandled-rejection',
  _toolbox: 'toolbox',
  _util: 'util',
  _server: 'server',
};

const PACKAGE_SCOPES = new Set(Object.values(PACKAGE_TO_SCOPE));

const file = process.argv[2];

if (!file) {
  console.error('usage: node scripts/check-commit-msg.js <commit-msg-file>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');

// Git comment lines (only present with commit -v or a configured template) and the trailing
// newline don't count toward the line total.
const lines = raw.split('\n').filter((line) => !line.startsWith('#'));

while (lines.length > 0 && lines[lines.length - 1] === '') {
  lines.pop();
}

if (lines.length === 0) {
  console.error('commit message is empty');
  process.exit(1);
}

if (lines.length > 1) {
  console.error('commit message must be a single line, got:');
  console.error(raw);
  process.exit(1);
}

const [subject] = lines;

if (!SUBJECT_RE.test(subject)) {
  console.error(`commit subject does not match "(scope) Subject" format: ${subject}`);
  process.exit(1);
}

// Mirrors documented scopes and adding a package requires adding both entries
const ALLOWED_SCOPES = new Set([
  'promise',
  'coroutine',
  'fetch',
  'decorators',
  'axios',
  'toolbox',
  'lazy',
  'util',
  'server',
  'node',
  'unhandled-rejection',
  'build',
  'repo',
  'test',
  'bench',
  'types',
  'docs',
  'examples',
]);

const scopeMatch = subject.match(/^\(([a-z][a-z-]*)\)/);
const scope = scopeMatch ? scopeMatch[1] : '';

if (!ALLOWED_SCOPES.has(scope)) {
  console.error(`unknown commit scope "(${scope})". Allowed scopes: ${[...ALLOWED_SCOPES].join(', ')}`);
  process.exit(1);
}

function getStagedFiles() {
  try {
    const stdout = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return stdout
      .split('\n')
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getPackageForFile(filePath) {
  const match = filePath.match(/^packages\/([^/]+)/);
  if (!match) return null;
  return PACKAGE_TO_SCOPE[match[1]] || null;
}

const stagedFiles = getStagedFiles();

if (stagedFiles.length > 0) {
  const isExample = (f) => f.startsWith('examples/') || f === 'examples';
  const exampleFiles = stagedFiles.filter(isExample);
  const nonExampleFiles = stagedFiles.filter((f) => !isExample(f));

  if (exampleFiles.length === stagedFiles.length) {
    if (scope !== 'examples') {
      console.error(
        `Commit scope "(${scope})" is invalid for changes under examples/.\n` +
          `All staged files are under examples/:\n` +
          stagedFiles.map((f) => `  ${f}`).join('\n') +
          `\nUse "(examples)" scope instead.`,
      );
      process.exit(1);
    }
  } else if (exampleFiles.length > 0 && nonExampleFiles.length > 0) {
    console.error(
      `Commit touches files in examples/ and other directories.\n` +
        `Split the commit: changes under examples/ must be committed separately with "(examples)" scope.\n` +
        `Examples files:\n` +
        exampleFiles.map((f) => `  ${f}`).join('\n') +
        `\nOther files:\n` +
        nonExampleFiles.map((f) => `  ${f}`).join('\n'),
    );
    process.exit(1);
  }

  // Changesets ride with whatever they describe; the path set used for scope
  // checks must never be diluted by their presence.
  const nonChangesetFiles = stagedFiles.filter((f) => !f.startsWith('.changeset/'));
  const packageFiles = nonChangesetFiles.filter((f) => f.startsWith('packages/'));
  const nonPackageFiles = nonChangesetFiles.filter((f) => !f.startsWith('packages/'));
  const stagedPkgScopes = new Set(packageFiles.map(getPackageForFile).filter(Boolean));

  // Two or more package scopes together used to get no check at all.
  // The answer is always split the commit.
  if (stagedPkgScopes.size >= 2) {
    console.error(
      `Commit touches ${stagedPkgScopes.size} package scopes: ${[...stagedPkgScopes].join(', ')}.\n` +
        `Split the commit: each package's changes must be committed separately under its own scope.\n` +
        `Package files:\n` +
        packageFiles.map((f) => `  ${f}`).join('\n'),
    );
    process.exit(1);
  }

  // Cross-cutting scopes still allowed over a package-only commit. "docs" is
  // deliberately excluded: package docs take the package's own scope.
  const PKG_CROSS_CUTTING_SCOPES = new Set(['test', 'build', 'types', 'repo']);

  if (packageFiles.length > 0 && nonPackageFiles.length === 0) {
    const [expectedPkgScope] = [...stagedPkgScopes];
    if (expectedPkgScope && scope !== expectedPkgScope && !PKG_CROSS_CUTTING_SCOPES.has(scope)) {
      console.error(
        `Commit scope "(${scope})" does not match package scope "(${expectedPkgScope})".\n` +
          `Files are in package directory for "${expectedPkgScope}":\n` +
          nonChangesetFiles.map((f) => `  ${f}`).join('\n') +
          `\nUse "(${expectedPkgScope})" or a cross-cutting scope (test, build, types, repo).`,
      );
      process.exit(1);
    }
  } else if (packageFiles.length > 0 && nonPackageFiles.length > 0) {
    const [expectedPkgScope] = [...stagedPkgScopes];
    console.error(
      `Commit touches files in a package directory ("${expectedPkgScope}") and other directories.\n` +
        `Split the commit: package-owned changes must be committed separately under their own scope.\n` +
        `Package files:\n` +
        packageFiles.map((f) => `  ${f}`).join('\n') +
        `\nOther files:\n` +
        nonPackageFiles.map((f) => `  ${f}`).join('\n'),
    );
    process.exit(1);
  } else if (packageFiles.length === 0 && nonPackageFiles.length > 0) {
    // No package paths at all: validate the scope against the non-package
    // paths instead of skipping the check entirely.
    const classifyNonPackagePath = (f) => {
      if (f.startsWith('examples/') || f === 'examples') return 'examples';
      if (f.startsWith('scripts/')) return 'build';
      if (f.startsWith('tests-types/')) return 'types';
      if (f.startsWith('tests-dist/')) return 'test';
      if (f.startsWith('benchmarks/')) return 'bench';
      if (f.startsWith('.github/')) return 'repo';
      if (f.startsWith('docs/') || f === 'README.md') return 'docs';
      return null;
    };
    const expectedScopes = new Set(nonPackageFiles.map(classifyNonPackagePath).filter(Boolean));

    if (expectedScopes.size > 0 && !expectedScopes.has(scope)) {
      console.error(
        `Commit scope "(${scope})" does not match the staged paths.\n` +
          `Expected scope(s): ${[...expectedScopes].join(', ')}\n` +
          `Files:\n` +
          nonPackageFiles.map((f) => `  ${f}`).join('\n'),
      );
      process.exit(1);
    }

    if (expectedScopes.size === 0 && PACKAGE_SCOPES.has(scope)) {
      console.error(
        `Commit scope "(${scope})" is a package scope but no staged file is under that package's directory.\n` +
          `Files:\n` +
          nonPackageFiles.map((f) => `  ${f}`).join('\n'),
      );
      process.exit(1);
    }
  }
}

process.exit(0);
