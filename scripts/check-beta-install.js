// Asserts external consumers can install and load published tarballs

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function resolveNpmCli() {
  if (process.env.npm_execpath) return process.env.npm_execpath;
  try {
    return require.resolve('npm/bin/npm-cli.js');
  } catch {
    return path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  }
}
const npmCli = resolveNpmCli();

function spawnNpm(args, opts = {}) {
  return spawnSync(process.execPath, [npmCli, ...args], {
    ...opts,
    shell: false,
  });
}

function getPublishablePackages() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packages = [];

  for (const pattern of rootPkg.workspaces || []) {
    if (pattern.endsWith('/*')) {
      const parentDir = path.join(ROOT, pattern.slice(0, -2));
      if (!fs.existsSync(parentDir)) continue;
      for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(parentDir, entry.name);
        const manifestPath = path.join(dir, 'package.json');
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.private !== true) {
          const relDir = path.relative(ROOT, dir).split(path.sep).join('/');
          packages.push({ name: manifest.name, relDir });
        }
      }
    } else {
      const dir = path.join(ROOT, pattern);
      const manifestPath = path.join(dir, 'package.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.private !== true) {
          const relDir = path.relative(ROOT, dir).split(path.sep).join('/');
          packages.push({ name: manifest.name, relDir });
        }
      }
    }
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}

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

function ensureBuild(packages) {
  if (process.argv.includes('--no-build')) {
    console.log('[check-beta-install] Skipping build (--no-build specified).');
    const missingDist = packages.some((pkg) => !fs.existsSync(path.join(ROOT, pkg.relDir, 'dist')));
    if (missingDist) {
      throw new Error('Build artifacts missing for some packages but --no-build was passed');
    }
    return;
  }

  console.log('[check-beta-install] Running npm run build across workspace...');
  const buildRes = spawnNpm(['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (buildRes.status !== 0) {
    throw new Error(`npm run build failed with exit code ${buildRes.status}`);
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

function packPackages(packages, destDir) {
  const tgzPaths = [];
  let packedPromiseVersion = null;

  for (const pkg of packages) {
    const pkgDir = path.join(ROOT, pkg.relDir);
    const packRes = spawnNpm(['pack', '--json', '--pack-destination', destDir], {
      cwd: pkgDir,
      encoding: 'utf8',
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
  const lsRes = spawnNpm(['ls', '@cancjs/promise', '--json'], {
    cwd: tempDirectory,
    encoding: 'utf8',
  });

  if (lsRes.status !== 0) {
    throw new Error(`npm ls @cancjs/promise --json failed with exit code ${lsRes.status}: ${lsRes.stderr}`);
  }

  const tree = JSON.parse(lsRes.stdout);

  const rootPromise = tree.dependencies && tree.dependencies['@cancjs/promise'];
  if (!rootPromise) {
    throw new Error('Root project dependencies does not contain @cancjs/promise');
  }
  if (rootPromise.version !== expectedVersion) {
    throw new Error(
      `Root @cancjs/promise version is ${rootPromise.version}, expected packed version ${expectedVersion}`,
    );
  }

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

function verifyModuleLoading(packages, tempDirectory) {
  const verifyScriptPath = path.join(tempDirectory, 'verify-loader.mjs');
  const verifyScriptContent = `
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packages = ${JSON.stringify(packages.map((p) => p.name))};

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
  });

  if (runRes.status !== 0) {
    throw new Error(`Package loading verification failed with exit code ${runRes.status}`);
  }
}

function main() {
  try {
    const packages = getPublishablePackages();
    ensureBuild(packages);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canc-beta-consumer-'));
    console.log(`[check-beta-install] Created consumer directory: ${tempDir}`);

    const { tgzPaths, packedPromiseVersion } = packPackages(packages, tempDir);
    console.log(`[check-beta-install] Packed ${tgzPaths.length} tarballs (promise version ${packedPromiseVersion})`);

    const consumerManifest = {
      name: 'consumer',
      version: '1.0.0',
      type: 'module',
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(consumerManifest, null, 2), 'utf8');

    console.log(`[check-beta-install] Running npm install for all ${tgzPaths.length} tarballs...`);
    const installRes = spawnNpm(['install', ...tgzPaths], {
      cwd: tempDir,
      stdio: 'inherit',
    });

    if (installRes.status !== 0) {
      throw new Error(`npm install failed with exit code ${installRes.status}`);
    }

    verifyPromiseDeduped(tempDir, packedPromiseVersion);
    verifyModuleLoading(packages, tempDir);

    console.log('[check-beta-install] All checks passed successfully.');
  } catch (err) {
    console.error(`[check-beta-install] FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main();
