// Validates that published and pending brand keys conform to registry.
// Published brand keys and _cancErrorBrand literals must never change.
// Every brand key must carry the prefix of the package that first ships it.
//
// Usage: node scripts/check-brand-keys.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');
const REGISTRY_PATH = path.join(__dirname, 'brand-keys.json');

const SYMBOL_BRAND_PATTERN = /Symbol(?:\.for|\['for'\]|\["for"\])\(\s*['"](@cancjs\/[^'"]+)['"]\s*\)/g;
const ERROR_BRAND_LITERAL_PATTERN = /_cancErrorBrand['"]?\s*[:=]\s*['"](@cancjs\/[^'"]+)['"]/g;

const HOME_PACKAGE_DIRS = {
  '@cancjs/coroutine': 'canc-coroutine',
  '@cancjs/promise': 'canc-promise',
  '@cancjs/toolbox': 'canc-toolbox',
  '@cancjs/node': 'canc-node',
  '@cancjs/server-node': path.join('canc-server', 'canc-server-node'),
};

const ALLOWED_SOURCE_DECLARATIONS = {
  '@cancjs/coroutine': [/^packages[\\/]canc-coroutine[\\/]/, /^packages[\\/]_util[\\/]/],
  '@cancjs/promise': [
    /^packages[\\/]canc-promise[\\/]/,
    /^packages[\\/]_util[\\/]/,
    /^packages[\\/]_toolbox[\\/]guards\.ts$/,
  ],
  '@cancjs/toolbox': [
    /^packages[\\/]canc-toolbox[\\/]/,
    /^packages[\\/]canc-toolbox-native[\\/]/,
    /^packages[\\/]_toolbox[\\/]/,
    /^packages[\\/]_util[\\/]/,
  ],
  '@cancjs/node': [/^packages[\\/]canc-node[\\/]/],
  '@cancjs/server-node': [/^packages[\\/]canc-server[\\/]canc-server-node[\\/]/, /^packages[\\/]_server[\\/]/],
};

function listPackages() {
  const names = [];
  for (const name of fs.readdirSync(PACKAGES_DIR)) {
    const dir = path.join(PACKAGES_DIR, name);
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      names.push(name);
      continue;
    }
    for (const childName of fs.readdirSync(dir)) {
      if (fs.existsSync(path.join(dir, childName, 'package.json'))) {
        names.push(path.join(name, childName));
      }
    }
  }
  return names.sort();
}

function listFilesRecursive(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function isDistTargetFile(filePath) {
  if (filePath.endsWith('.map')) return false;
  return /\.(cjs|mjs|js)$/.test(filePath) || /\.d\.(ts|mts|cts)$/.test(filePath);
}

function isSourceTargetFile(filePath) {
  if (
    filePath.includes(`${path.sep}dist${path.sep}`) ||
    filePath.includes(`${path.sep}node_modules${path.sep}`) ||
    filePath.includes('.spec.') ||
    filePath.includes('.test.') ||
    filePath.includes(`${path.sep}__tests__${path.sep}`) ||
    filePath.includes(`${path.sep}smoke${path.sep}`)
  ) {
    return false;
  }
  return /\.(ts|js|mjs)$/.test(filePath);
}

function extractKeysFromText(text) {
  const found = new Set();
  let match;

  SYMBOL_BRAND_PATTERN.lastIndex = 0;
  while ((match = SYMBOL_BRAND_PATTERN.exec(text)) !== null) {
    found.add(match[1]);
  }

  ERROR_BRAND_LITERAL_PATTERN.lastIndex = 0;
  while ((match = ERROR_BRAND_LITERAL_PATTERN.exec(text)) !== null) {
    found.add(match[1]);
  }

  return found;
}

function checkBrandKeys() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const publishedSet = new Set(registry.published || []);
  const pendingSet = new Set(registry.pending || []);
  const allExpectedKeys = new Set([...publishedSet, ...pendingSet]);

  const packageNames = listPackages();
  const collectedKeys = new Set();
  const keysByPackage = new Map();

  for (const pkgName of packageNames) {
    const distDir = path.join(PACKAGES_DIR, pkgName, 'dist');
    if (!fs.existsSync(distDir)) continue;

    const pkgKeys = new Set();
    const files = listFilesRecursive(distDir).filter(isDistTargetFile);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const key of extractKeysFromText(content)) {
        collectedKeys.add(key);
        pkgKeys.add(key);
      }
    }
    keysByPackage.set(pkgName, pkgKeys);
  }

  const problems = [];

  // 1. Every published key must be present in its home package and collected set
  for (const key of publishedSet) {
    const prefix = key.split(':')[0];
    const homeRelDir = HOME_PACKAGE_DIRS[prefix];
    const homeKeys = homeRelDir ? keysByPackage.get(homeRelDir) : null;
    if (!collectedKeys.has(key) || !homeKeys || !homeKeys.has(key)) {
      problems.push(`missing published brand key: ${key}`);
    }
  }

  // 2. Every collected key must be in either published or pending
  for (const key of collectedKeys) {
    if (!allExpectedKeys.has(key)) {
      problems.push(`unknown brand key: ${key}`);
    }
  }

  // 3. Key package prefix must match package that first ships it
  for (const key of collectedKeys) {
    const prefix = key.split(':')[0];
    const homeRelDir = HOME_PACKAGE_DIRS[prefix];
    if (!homeRelDir) {
      problems.push(`prefix mismatch: brand key "${key}" has unknown package prefix "${prefix}"`);
      continue;
    }

    const homeKeys = keysByPackage.get(homeRelDir);
    if (!homeKeys || !homeKeys.has(key)) {
      problems.push(
        `prefix mismatch: brand key "${key}" must be shipped in dist of its declaring package "${homeRelDir}"`,
      );
    }
  }

  // Check source declaration locations for prefix mismatches and unknown keys
  const allSourceFiles = listFilesRecursive(PACKAGES_DIR).filter(isSourceTargetFile);
  for (const file of allSourceFiles) {
    const relFromRoot = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    for (const key of extractKeysFromText(content)) {
      if (!allExpectedKeys.has(key)) {
        problems.push(`unknown brand key: ${key}`);
      }
      const prefix = key.split(':')[0];
      const allowedPatterns = ALLOWED_SOURCE_DECLARATIONS[prefix];
      if (!allowedPatterns) {
        problems.push(`prefix mismatch: brand key "${key}" declared in "${relFromRoot}" has unknown prefix`);
        continue;
      }
      const isAllowed = allowedPatterns.some((pattern) => pattern.test(relFromRoot));
      if (!isAllowed) {
        problems.push(`prefix mismatch: brand key "${key}" declared in mismatched location "${relFromRoot}"`);
      }
    }
  }

  const uniqueProblems = [...new Set(problems)];

  return {
    passed: uniqueProblems.length === 0,
    problems: uniqueProblems,
    keyCount: collectedKeys.size,
    publishedCount: publishedSet.size,
    pendingCount: pendingSet.size,
    collectedKeys: [...collectedKeys].sort(),
  };
}

function main() {
  const result = checkBrandKeys();
  if (result.passed) {
    console.log(
      `PASS brand keys: ${result.keyCount} keys verified (${result.publishedCount} published, ${result.pendingCount} pending)`,
    );
    process.exit(0);
  } else {
    console.error(`FAIL brand keys (${result.problems.length} problems):`);
    for (const problem of result.problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkBrandKeys };
