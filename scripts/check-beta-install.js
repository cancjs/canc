// Consumer tarball install check:
// Verifies that a consumer outside the monorepo can install all 14 published workspace
// packages together without npm ERESOLVE conflicts and with exactly ONE deduplicated
// copy of @cancjs/promise at the expected packed version.
// Also verifies that each of the 14 packages can be loaded via both ESM import() and CJS require().
//
// Usage: node scripts/check-beta-install.js [--build]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const PACKAGES = [
  { name: '@cancjs/promise', relDir: 'packages/canc-promise' },
  { name: '@cancjs/toolbox', relDir: 'packages/canc-toolbox' },
  { name: '@cancjs/toolbox-native', relDir: 'packages/canc-toolbox-native' },
  { name: '@cancjs/coroutine', relDir: 'packages/canc-coroutine' },
  { name: '@cancjs/decorators', relDir: 'packages/canc-decorators' },
  { name: '@cancjs/fetch', relDir: 'packages/canc-fetch' },
  { name: '@cancjs/axios', relDir: 'packages/canc-axios' },
  { name: '@cancjs/node', relDir: 'packages/canc-node' },
  { name: '@cancjs/unhandled-rejection', relDir: 'packages/canc-unhandled-rejection' },
  { name: '@cancjs/server-node', relDir: 'packages/canc-server/canc-server-node' },
  { name: '@cancjs/server-express', relDir: 'packages/canc-server/canc-server-express' },
  { name: '@cancjs/server-fastify', relDir: 'packages/canc-server/canc-server-fastify' },
  { name: '@cancjs/server-hono', relDir: 'packages/canc-server/canc-server-hono' },
  { name: '@cancjs/server-koa', relDir: 'packages/canc-server/canc-server-koa' },
];

let tempDir = null;

function cleanup() {
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Best-effort cleanup on termination
    }
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(1);
});

function ensureBuild(forceBuild) {
  const missingDist = PACKAGES.some((pkg) => !fs.existsSync(path.join(ROOT, pkg.relDir, 'dist')));
  if (forceBuild || missingDist) {
    console.log('[check-beta-install] Running npm run build across workspace...');
    const buildRes = spawnSync('npm', ['run', 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (buildRes.status !== 0) {
      throw new Error(`npm run build failed with exit code ${buildRes.status}`);
    }
  } else {
    console.log('[check-beta-install] Build artifacts present for all packages.');
  }
}

function parsePackOutput(rawOutput) {
  const startArray = rawOutput.indexOf('[');
  const startObject = rawOutput.indexOf('{');
  let firstIdx;
  if (startArray !== -1 && startObject !== -1) {
    firstIdx = Math.min(startArray, startObject);
  } else if (startArray !== -1) {
    firstIdx = startArray;
  } else {
    firstIdx = startObject;
  }
  if (firstIdx === -1) {
    throw new Error(`No JSON found in npm pack output:\n${rawOutput}`);
  }
  const jsonStr = rawOutput.slice(firstIdx);
  const parsed = JSON.parse(jsonStr);
  return Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
}

function packPackages(destDir) {
  const tgzPaths = [];
  let packedPromiseVersion = null;

  for (const pkg of PACKAGES) {
    const pkgDir = path.join(ROOT, pkg.relDir);
    const packRes = spawnSync('npm', ['pack', '--json', '--pack-destination', destDir], {
      cwd: pkgDir,
      encoding: 'utf8',
      shell: true,
    });

    if (packRes.status !== 0) {
      throw new Error(`npm pack failed for ${pkg.name}: ${packRes.stderr || packRes.stdout}`);
    }

    const item = parsePackOutput(packRes.stdout);
    const tgzPath = path.join(destDir, item.filename);
    if (!fs.existsSync(tgzPath)) {
      throw new Error(`Expected packed tarball not found at ${tgzPath}`);
    }

    tgzPaths.push(tgzPath);
    if (pkg.name === '@cancjs/promise') {
      packedPromiseVersion = item.version;
    }
  }

  return { tgzPaths, packedPromiseVersion };
}

function verifyPromiseDeduped(tempDirectory, expectedVersion) {
  const lsRes = spawnSync('npm', ['ls', '@cancjs/promise', '--json'], {
    cwd: tempDirectory,
    encoding: 'utf8',
    shell: true,
  });

  if (lsRes.status !== 0) {
    throw new Error(`npm ls @cancjs/promise --json failed with exit code ${lsRes.status}: ${lsRes.stderr}`);
  }

  const tree = JSON.parse(lsRes.stdout);

  // 1. Root dependency must have @cancjs/promise at expected version
  const rootPromise = tree.dependencies && tree.dependencies['@cancjs/promise'];
  if (!rootPromise) {
    throw new Error('Root project dependencies does not contain @cancjs/promise');
  }
  if (rootPromise.version !== expectedVersion) {
    throw new Error(
      `Root @cancjs/promise version is ${rootPromise.version}, expected packed version ${expectedVersion}`,
    );
  }

  // 2. Walk entire dependency tree to assert no duplicate or un-deduped copies
  function checkNode(node, currentPath) {
    if (!node || typeof node !== 'object') return;
    if (node.dependencies) {
      for (const [name, depInfo] of Object.entries(node.dependencies)) {
        const nextPath = currentPath ? `${currentPath} > ${name}` : name;
        if (name === '@cancjs/promise') {
          if (depInfo.version !== expectedVersion) {
            throw new Error(
              `Duplicate copy of @cancjs/promise found at ${nextPath} with version ${depInfo.version} (expected ${expectedVersion})`,
            );
          }
          // If nested under another dependency, it must be deduped (no distinct resolved path)
          if (currentPath && depInfo.resolved && depInfo.resolved !== rootPromise.resolved) {
            throw new Error(
              `Non-deduped nested copy of @cancjs/promise found at ${nextPath} with resolved ${depInfo.resolved}`,
            );
          }
        }
        checkNode(depInfo, nextPath);
      }
    }
  }

  checkNode(tree, '');

  // 3. Physical filesystem check: find all @cancjs/promise directories in node_modules
  const promiseDirs = [];
  function findDirectories(dir) {
    const nm = path.join(dir, 'node_modules');
    if (!fs.existsSync(nm)) return;
    for (const entry of fs.readdirSync(nm)) {
      const full = path.join(nm, entry);
      if (entry === '@cancjs') {
        for (const sub of fs.readdirSync(full)) {
          if (sub === 'promise') {
            promiseDirs.push(path.join(full, sub));
          }
          findDirectories(path.join(full, sub));
        }
      } else {
        findDirectories(full);
      }
    }
  }

  findDirectories(tempDirectory);

  if (promiseDirs.length !== 1) {
    throw new Error(
      `Expected exactly 1 @cancjs/promise directory on disk, found ${promiseDirs.length}: ${promiseDirs.join(', ')}`,
    );
  }

  console.log(`[check-beta-install] PASS: Exactly one @cancjs/promise copy (${expectedVersion}) found and deduped.`);
}

function verifyModuleLoading(tempDirectory) {
  const verifyScriptPath = path.join(tempDirectory, 'verify-loader.mjs');
  const verifyScriptContent = `
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packages = ${JSON.stringify(PACKAGES.map((p) => p.name))};

console.log('[check-beta-install] Loading packages via ESM import() and CJS require():');

for (const pkgName of packages) {
  const esmModule = await import(pkgName);
  const esmKeys = Object.keys(esmModule);
  const esmCount = esmKeys.length;

  const cjsModule = require(pkgName);
  const cjsCount = cjsModule && (typeof cjsModule === 'object' || typeof cjsModule === 'function')
    ? Object.keys(cjsModule).length
    : 0;

  if (esmCount === 0) {
    throw new Error('Zero exports found in ESM module for ' + pkgName);
  }
  if (cjsCount === 0) {
    throw new Error('Zero exports found in CJS module for ' + pkgName);
  }

  console.log('  ' + pkgName + ': ESM (' + esmCount + ' exports), CJS (' + cjsCount + ' exports)');
}

console.log('[check-beta-install] All ' + packages.length + ' packages loaded successfully.');
`;

  fs.writeFileSync(verifyScriptPath, verifyScriptContent, 'utf8');

  const runRes = spawnSync('node', ['verify-loader.mjs'], {
    cwd: tempDirectory,
    stdio: 'inherit',
    shell: true,
  });

  if (runRes.status !== 0) {
    throw new Error(`Package loading verification failed with exit code ${runRes.status}`);
  }
}

function main() {
  const forceBuild = process.argv.includes('--build') || process.argv.includes('--rebuild');

  try {
    ensureBuild(forceBuild);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canc-beta-consumer-'));
    console.log(`[check-beta-install] Created consumer directory: ${tempDir}`);

    const { tgzPaths, packedPromiseVersion } = packPackages(tempDir);
    console.log(`[check-beta-install] Packed ${tgzPaths.length} tarballs (promise version ${packedPromiseVersion})`);

    const consumerManifest = {
      name: 'consumer',
      version: '1.0.0',
      type: 'module',
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(consumerManifest, null, 2), 'utf8');

    console.log(`[check-beta-install] Running npm install for all 14 tarballs...`);
    const installRes = spawnSync('npm', ['install', ...tgzPaths], {
      cwd: tempDir,
      stdio: 'inherit',
      shell: true,
    });

    if (installRes.status !== 0) {
      throw new Error(`npm install failed with exit code ${installRes.status}`);
    }

    verifyPromiseDeduped(tempDir, packedPromiseVersion);
    verifyModuleLoading(tempDir);

    console.log('[check-beta-install] All checks passed successfully.');
    process.exit(0);
  } catch (err) {
    console.error(`[check-beta-install] FAIL: ${err.message}`);
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
