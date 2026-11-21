// Asserts external consumers can install and load published tarballs

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// npm sits beside node: bin/node_modules on windows, lib/node_modules on unix
function resolveNpmCli(env = process.env, execPath = process.execPath, exists = fs.existsSync) {
  if (env.npm_execpath) {
    return env.npm_execpath;
  }

  const bin = path.dirname(execPath);
  const candidates = [
    path.join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find((candidate) => exists(candidate));

  if (found) {
    return found;
  }

  try {
    return require.resolve('npm/bin/npm-cli.js');
  } catch {
    throw new Error('npm-cli.js not found, run the script through npm or put npm beside node');
  }
}

let npmCli = null;

function spawnNpm(args, opts = {}) {
  if (npmCli === null) {
    npmCli = resolveNpmCli();
  }
  return spawnSync(process.execPath, [npmCli, ...args], opts);
}

function describePackage(manifest, relDir) {
  const meta = manifest.peerDependenciesMeta || {};

  return {
    name: manifest.name,
    relDir,
    version: manifest.version,
    exports: manifest.exports || {},
    optionalPeers: Object.entries(manifest.peerDependencies || {})
      .filter(([name]) => meta[name] && meta[name].optional)
      .map(([name, range]) => `${name}@${range}`),
  };
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
          packages.push(describePackage(manifest, relDir));
        }
      }
    } else {
      const dir = path.join(ROOT, pattern);
      const manifestPath = path.join(dir, 'package.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.private !== true) {
          const relDir = path.relative(ROOT, dir).split(path.sep).join('/');
          packages.push(describePackage(manifest, relDir));
        }
      }
    }
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}

let tempDir = null;

function cleanup() {
  if (process.argv.includes('--keep-temp') || process.env.CANC_KEEP_TEMP === '1') {
    return;
  }
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
    throw new Error(`Root @cancjs/promise version is ${rootPromise.version}, expected version ${expectedVersion}`);
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

const PACKAGE_JSON_KEY = './package.json';

// loads fine and exports nothing, runs only for its side effect
const EMPTY_ENTRY_POINTS = ['@cancjs/node/fs/register-graceful', '@cancjs/unhandled-rejection/register'];

// package -> [class, guard], each build's guard must accept the other's instance
const BRAND_CROSSINGS = {
  '@cancjs/promise': ['CancelError', 'isCancelError'],
  '@cancjs/coroutine': ['BreakError', 'isBreakError'],
  '@cancjs/toolbox': ['SupersededError', 'isSupersededError'],
  '@cancjs/node': ['JsonParseError', 'isJsonParseError'],
};

// brand owners whose keys mark shared state instead of public error classes
const BRAND_EXEMPT = {
  '@cancjs/server-node': 'brands mark shared shutdown and request state, no public error class',
  '@cancjs/server-fastify': 'brands mark shared shutdown state, no public error class',
  '@cancjs/unhandled-rejection': 'brand marks the shared process handler, no public error class',
};

// every entry point a package publishes, read from its exports map
function enumerateEntryPoints(packages) {
  const entries = [];

  for (const pkg of packages) {
    for (const key of Object.keys(pkg.exports)) {
      if (!key.startsWith('.')) {
        throw new Error(`${pkg.name} exports key "${key}" is not a subpath`);
      }
      if (key === PACKAGE_JSON_KEY) continue;
      entries.push({ pkg: pkg.name, key, specifier: key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}` });
    }
  }

  return entries;
}

// packages that own a brand key, read from the brand registry
function brandOwners() {
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'brand-keys.json'), 'utf8'));
  const owners = new Set();

  for (const key of [...registry.published, ...registry.pending]) {
    owners.add(key.slice(0, key.indexOf(':')));
  }

  return [...owners].sort();
}

function verifyBrandCoverage(packages) {
  const names = new Set(packages.map((pkg) => pkg.name));
  const problems = [];

  for (const owner of brandOwners()) {
    if (!names.has(owner)) {
      problems.push(`${owner} owns a brand key but is not a publishable package`);
    } else if (!BRAND_CROSSINGS[owner] && !BRAND_EXEMPT[owner]) {
      problems.push(`${owner} owns a brand key but has neither a crossing nor an exemption`);
    }
  }

  if (problems.length > 0) {
    throw new Error(problems.join('; '));
  }
}

function verifyModuleLoading(packages, entries, tempDirectory) {
  const verifyScriptPath = path.join(tempDirectory, 'verify-loader.mjs');
  const verifyScriptContent = `
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const entries = ${JSON.stringify(entries)};
const packages = ${JSON.stringify(packages.map((p) => ({ name: p.name, version: p.version })))};
const emptyEntryPoints = ${JSON.stringify(EMPTY_ENTRY_POINTS)};
const crossings = ${JSON.stringify(BRAND_CROSSINGS)};
const failures = [];
const firstLine = (error) => String(error && error.message).split('\\n')[0];

console.log('[check-beta-install] Loading every entry point via ESM import() and CJS require():');

for (const entry of entries) {
  let esm = null;
  let cjs = null;
  let cjsLoaded = false;

  try {
    esm = await import(entry.specifier);
  } catch (error) {
    failures.push('import() ' + entry.specifier + ': ' + firstLine(error));
  }
  try {
    cjs = require(entry.specifier);
    cjsLoaded = true;
  } catch (error) {
    failures.push('require() ' + entry.specifier + ': ' + firstLine(error));
  }
  if (esm === null || !cjsLoaded) continue;
  if (cjs === null || (typeof cjs !== 'object' && typeof cjs !== 'function')) {
    failures.push('exports ' + entry.specifier + ': CJS module.exports must be an object or function');
    continue;
  }

  const esmNames = Object.keys(esm).filter((name) => name !== 'default');
  const cjsNames = Object.keys(cjs);

  if (!emptyEntryPoints.includes(entry.specifier) && (esmNames.length === 0 || cjsNames.length === 0)) {
    failures.push('exports ' + entry.specifier + ': ESM has ' + esmNames.length + ' names, CJS has ' + cjsNames.length);
  }
  for (const name of esmNames) {
    if (!(name in cjs)) {
      failures.push('parity ' + entry.specifier + ': ESM export ' + name + ' is missing from require()');
    } else if (typeof cjs[name] !== typeof esm[name]) {
      failures.push('parity ' + entry.specifier + ': ' + name + ' is ' + typeof esm[name] + ' in ESM and ' + typeof cjs[name] + ' in CJS');
    }
  }
  console.log('  ' + entry.specifier + ': ESM (' + esmNames.length + ' exports), CJS (' + cjsNames.length + ' exports)');
}

for (const pkg of packages) {
  try {
    const manifest = require(pkg.name + '/package.json');

    if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
      failures.push('manifest ' + pkg.name + '/package.json reads ' + manifest.name + '@' + manifest.version);
    }
  } catch (error) {
    failures.push('require() ' + pkg.name + '/package.json: ' + firstLine(error));
  }
}

for (const [name, [className, guardName]] of Object.entries(crossings)) {
  try {
    const esm = await import(name);
    const cjs = require(name);
    const fromEsm = new esm[className]();
    const fromCjs = new cjs[className]();

    if (esm[guardName](fromCjs) !== true) {
      failures.push('brand ' + name + ': ESM ' + guardName + ' rejects a ' + className + ' made by the CJS build');
    }
    if (cjs[guardName](fromEsm) !== true) {
      failures.push('brand ' + name + ': CJS ' + guardName + ' rejects a ' + className + ' made by the ESM build');
    }
    if (esm[guardName](new Error('plain')) !== false) {
      failures.push('brand ' + name + ': ' + guardName + ' accepts a plain Error');
    }
  } catch (error) {
    failures.push('brand ' + name + ': ' + firstLine(error));
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error('FAIL ' + failure);
  process.exit(1);
}

console.log('[check-beta-install] Entry points: ' + entries.length + ' loaded by import() and require(), ESM exports present on require() with equal types.');
console.log('[check-beta-install] Manifests: ' + packages.length + ' package.json files resolve through exports.');
console.log('[check-beta-install] Brand crossings: ' + Object.keys(crossings).length + ' packages, ' + Object.keys(crossings).join(', ') + '.');
`;

  fs.writeFileSync(verifyScriptPath, verifyScriptContent, 'utf8');

  const runRes = spawnSync(process.execPath, [verifyScriptPath], {
    cwd: tempDirectory,
    stdio: 'inherit',
  });

  if (runRes.status !== 0) {
    throw new Error(`Package loading verification failed with exit code ${runRes.status}`);
  }
}

// the compiler resolves each entry point the way a consumer's editor would
function verifyTypeResolution(entries, tempDirectory) {
  const tsc = require.resolve('typescript/lib/tsc.js');
  const imports = `${entries.map((entry) => `import type {} from '${entry.specifier}';`).join('\n')}\nexport {};\n`;
  const modes = [
    { id: 'node16-esm', file: 'resolve-esm.mts', options: { module: 'node16', moduleResolution: 'node16' } },
    { id: 'node16-cjs', file: 'resolve-cjs.cts', options: { module: 'node16', moduleResolution: 'node16' } },
    { id: 'bundler', file: 'resolve-bundler.ts', options: { module: 'esnext', moduleResolution: 'bundler' } },
  ];

  for (const mode of modes) {
    fs.writeFileSync(path.join(tempDirectory, mode.file), imports, 'utf8');
    fs.writeFileSync(
      path.join(tempDirectory, `tsconfig.${mode.id}.json`),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          target: 'es2022',
          lib: ['es2022', 'dom'],
          types: [],
          ...mode.options,
        },
        files: [mode.file],
      }),
      'utf8',
    );

    const res = spawnSync(process.execPath, [tsc, '-p', `tsconfig.${mode.id}.json`], {
      cwd: tempDirectory,
      encoding: 'utf8',
    });

    if (res.status !== 0) {
      throw new Error(`Type resolution failed under ${mode.id}:\n${res.stdout}${res.stderr}`);
    }
  }

  console.log(
    `[check-beta-install] Type resolution: ${entries.length} entry points resolve under ${modes.map((mode) => mode.id).join(', ')}.`,
  );
}

function queryRegistryVersion(pkg) {
  const spec = `${pkg.name}@${pkg.version}`;
  const res = spawnNpm(['view', spec, 'version', '--json'], {
    timeout: 60000,
    encoding: 'utf8',
  });

  if (res.error) {
    const reason = res.error.message || String(res.error);
    console.error(`FAIL registry lookup for ${pkg.name}: ${reason}`);
    cleanup();
    process.exit(1);
  }

  const stdout = (res.stdout || '').toString();
  const stderr = (res.stderr || '').toString();

  if (res.status !== 0) {
    let isE404 = false;
    try {
      const parsed = JSON.parse(stdout);
      if (parsed && parsed.error && parsed.error.code === 'E404') {
        isE404 = true;
      }
    } catch {
      // stdout not JSON
    }
    if (!isE404) {
      isE404 = stderr.includes('E404') || stderr.includes('404 Not Found') || stdout.includes('"E404"');
    }

    if (isE404) {
      return null;
    }

    const reason = (stderr || stdout || `exit code ${res.status}`).trim();
    console.error(`FAIL registry lookup for ${pkg.name}: ${reason}`);
    cleanup();
    process.exit(1);
  }

  let version;
  try {
    version = JSON.parse(stdout.trim());
  } catch (err) {
    console.error(`FAIL registry lookup for ${pkg.name}: non-JSON output (${err.message})`);
    cleanup();
    process.exit(1);
  }

  if (typeof version !== 'string' || !version) {
    console.error(`FAIL registry lookup for ${pkg.name}: invalid version in output`);
    cleanup();
    process.exit(1);
  }

  if (version !== pkg.version) {
    console.error(`FAIL registry lookup for ${pkg.name}: version mismatch (expected ${pkg.version}, got ${version})`);
    cleanup();
    process.exit(1);
  }

  return version;
}

function main() {
  try {
    const packages = getPublishablePackages();
    verifyBrandCoverage(packages);
    const entries = enumerateEntryPoints(packages);
    console.log(
      `[check-beta-install] Entry points from exports: ${entries.length} across ${packages.length} packages (plus ${packages.length} package.json)`,
    );
    const useRegistryRest = process.argv.includes('--registry-rest');

    let localPackages = packages;
    const registryPackages = [];

    if (useRegistryRest) {
      localPackages = [];
      for (const pkg of packages) {
        const regVersion = queryRegistryVersion(pkg);
        if (regVersion === null) {
          localPackages.push(pkg);
        } else {
          registryPackages.push(pkg);
        }
      }

      const localNames = localPackages.map((p) => p.name).join(', ');
      const localPart = localPackages.length > 0 ? `${localPackages.length} (${localNames})` : '0';
      console.log(`[check-beta-install] local: ${localPart}, registry: ${registryPackages.length}`);
    }

    ensureBuild(localPackages);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canc-beta-consumer-'));
    console.log(`[check-beta-install] Created consumer directory: ${tempDir}`);

    const { tgzPaths, packedPromiseVersion } = packPackages(localPackages, tempDir);
    if (!useRegistryRest) {
      console.log(`[check-beta-install] Packed ${tgzPaths.length} tarballs (promise version ${packedPromiseVersion})`);
    } else if (localPackages.length > 0) {
      console.log(`[check-beta-install] Packed ${tgzPaths.length} tarballs`);
    }

    const consumerManifest = {
      name: 'consumer',
      version: '1.0.0',
      type: 'module',
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(consumerManifest, null, 2), 'utf8');

    let installTargets;
    if (!useRegistryRest) {
      installTargets = tgzPaths;
      console.log(`[check-beta-install] Running npm install for all ${tgzPaths.length} tarballs...`);
    } else {
      const registrySpecs = registryPackages.map((pkg) => `${pkg.name}@${pkg.version}`);
      installTargets = [...tgzPaths, ...registrySpecs];
      console.log(
        `[check-beta-install] Running npm install for ${installTargets.length} packages (${tgzPaths.length} local, ${registrySpecs.length} registry)...`,
      );
    }

    // an optional peer is not installed alone, an entry point may need it
    const optionalPeers = [...new Set(packages.flatMap((pkg) => pkg.optionalPeers))];
    console.log(`[check-beta-install] Optional peers installed beside them: ${optionalPeers.join(', ') || 'none'}`);

    const installRes = spawnNpm(['install', ...installTargets, ...optionalPeers], {
      cwd: tempDir,
      stdio: 'inherit',
    });

    if (installRes.status !== 0) {
      throw new Error(`npm install failed with exit code ${installRes.status}`);
    }

    const promisePkg = packages.find((p) => p.name === '@cancjs/promise');
    const expectedPromiseVersion = packedPromiseVersion || (promisePkg ? promisePkg.version : null);

    verifyPromiseDeduped(tempDir, expectedPromiseVersion);
    verifyModuleLoading(packages, entries, tempDir);
    verifyTypeResolution(entries, tempDir);

    console.log('[check-beta-install] All checks passed successfully.');
  } catch (err) {
    console.error(`[check-beta-install] FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

if (require.main === module) {
  main();
}

module.exports = { resolveNpmCli, enumerateEntryPoints };
