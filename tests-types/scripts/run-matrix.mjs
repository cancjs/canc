#!/usr/bin/env node
/**
 * TS-version matrix runner.
 *
 * For every version in matrix.config.json this:
 * 1. packs each target package (`npm pack`) into tests-types/.tarballs/ so the
 * fixture type-checks against the BUILT, publishable dist instead of src.
 * 2. materialises an isolated fixture project under tests-types/fixtures/ts-<id>/
 * (its own package.json + tsconfig + its own copy of the shared common/*.ts),
 * clearing the previous generated files first so no stale config survives,
 * 3. installs that fixture's pinned `typescript` alias + the package tarballs, plus
 * `matrix.config.json`'s `peerDependencies` (framework peers a common fixture imports
 * directly, e.g. express/fastify for common/server-types.ts), into the fixture's OWN
 * node_modules (no workspace hoisting, allowing versions to diverge freely),
 * 4. runs the fixture-local `tsc --noEmit` and records pass/fail.
 *
 * Lanes with `typeAssertions` additionally compile the type-assertion suites
 * (common/type-assertions.ts + common/coroutine-types.ts). Lanes with `serverExpressTypes` /
 * `serverFastifyTypes` / `serverHonoTypes` / `serverKoaTypes` additionally compile
 * common/server-express-types.ts + common/server-node-types.ts / common/server-fastify-types.ts /
 * common/server-hono-types.ts / common/server-koa-types.ts (express/fastify/hono gated because
 * those frameworks' own shipped types hit real TypeScript version floors below 5.0 / 5.4, see
 * each file's header; koa has no such floor, so serverKoaTypes is set on every lane).
 *
 * Flags:
 * --setup-only pack + install fixtures, don't run tsc
 * --only <id,...> restrict to the given version id(s)
 * --no-install reuse existing fixture node_modules (fast re-run)
 * --keep-going run all lanes even after a failure (default: stop-on-red off,
 * we always run all and summarise)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsTypesDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsTypesDir, '..');
const fixturesDir = path.join(testsTypesDir, 'fixtures');
const commonDir = path.join(fixturesDir, 'common');
const tarballsDir = path.join(testsTypesDir, '.tarballs');
const config = JSON.parse(fs.readFileSync(path.join(testsTypesDir, 'matrix.config.json'), 'utf8'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const setupOnly = has('--setup-only');
const noInstall = has('--no-install');
const onlyList = (valOf('--only') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c('32', s);
const red = (s) => c('31', s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function run(cmd, args, opts = {}) {
  const shell = isWin && /\.cmd$/i.test(cmd);
  const finalArgs = shell ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
  return execFileSync(cmd, finalArgs, { encoding: 'utf8', stdio: 'pipe', shell, ...opts });
}

function packPackages() {
  fs.rmSync(tarballsDir, { recursive: true, force: true });
  fs.mkdirSync(tarballsDir, { recursive: true });
  const tarballs = {};
  for (const pkg of config.packages) {
    const pkgDir = path.join(repoRoot, 'packages', pkg);
    const distTypes = path.join(pkgDir, 'dist', 'types', 'index.d.ts');
    if (!fs.existsSync(distTypes)) {
      throw new Error(
        `Package "${pkg}" is not built (${distTypes} missing). Run \`npm run build --workspace=@cancjs/${pkg.replace('canc-', '')}\` first.`,
      );
    }
    const out = run(npmCmd, ['pack', '--pack-destination', tarballsDir], { cwd: pkgDir }).trim();
    const file = out.split(/\r?\n/).pop().trim();
    const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    tarballs[pkgJson.name] = path.join(tarballsDir, file);
    console.log(dim(` packed ${pkgJson.name} -> ${file}`));
  }
  return tarballs;
}

function resetFixtureDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function pruneStaleFixtures() {
  if (!fs.existsSync(fixturesDir)) return;
  const expected = new Set();
  for (const version of config.versions) {
    expected.add(`ts-${version.id}`);
    if (version.decoratorTypes) {
      for (const flavor of DECORATOR_FLAVORS) expected.add(`ts-${version.id}${flavor.suffix}`);
    }
  }
  for (const entry of fs.readdirSync(fixturesDir)) {
    if (!entry.startsWith('ts-') || expected.has(entry)) continue;
    fs.rmSync(path.join(fixturesDir, entry), { recursive: true, force: true });
    console.log(dim(` removed stale fixture ${entry}`));
  }
}

function copyCommonSources(dir) {
  const target = path.join(dir, 'common');
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(commonDir)) {
    if (entry.endsWith('.ts')) fs.copyFileSync(path.join(commonDir, entry), path.join(target, entry));
  }
}

const localSource = (p) => `./common/${path.basename(p)}`;

function writeFixture(version, tarballs) {
  const dir = path.join(fixturesDir, `ts-${version.id}`);
  resetFixtureDir(dir);
  fs.mkdirSync(dir, { recursive: true });

  const deps = { typescript: version.typescript, ...(config.peerDependencies || {}) };
  for (const [name, tarball] of Object.entries(tarballs)) {
    deps[name] = `file:${path.relative(dir, tarball).split(path.sep).join('/')}`;
  }

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `@cancjs/tests-types-ts-${version.id}`,
        version: '0.0.0',
        private: true,
        description: `Isolated TS ${version.id} fixture (generated by run-matrix.mjs, do not edit by hand).`,
        scripts: { check: 'tsc --noEmit' },
        dependencies: deps,
      },
      null,
      2,
    ) + '\n',
  );

  copyCommonSources(dir);

  const files = (config.commonFixtures || ['../common/api-smoke.ts']).map(localSource);
  if (version.typeAssertions) {
    files.push(localSource('type-assertions.ts'));
    files.push(localSource('coroutine-types.ts'));
  }
  if (version.serverExpressTypes) {
    files.push(localSource('server-express-types.ts'));
    files.push(localSource('server-node-types.ts'));
  }
  if (version.serverFastifyTypes) {
    files.push(localSource('server-fastify-types.ts'));
  }
  if (version.serverHonoTypes) {
    files.push(localSource('server-hono-types.ts'));
  }
  if (version.serverKoaTypes) {
    files.push(localSource('server-koa-types.ts'));
  }

  const tsconfig = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      target: 'es2019',
      module: version.moduleResolution === 'node' ? 'commonjs' : 'esnext',
      moduleResolution: version.moduleResolution,
      lib: version.lib || ['es2022', 'dom'],
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      types: [],
    },
    files,
  };
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  return dir;
}

const DECORATOR_FLAVORS = [
  {
    suffix: '-decorators',
    file: '../common/decorator-types.ts',
    experimentalDecorators: false,
    extraLib: ['decorators'],
  },
  { suffix: '-decorators-legacy', file: '../common/decorator-types-legacy-audit.ts', experimentalDecorators: true },
  {
    suffix: '-decorators-babel-legacy',
    file: '../common/decorator-types-babel-legacy-audit.ts',
    experimentalDecorators: false,
  },
];

function writeDecoratorFixture(version, tarballs, flavor) {
  const dir = path.join(fixturesDir, `ts-${version.id}${flavor.suffix}`);
  resetFixtureDir(dir);
  fs.mkdirSync(dir, { recursive: true });
  copyCommonSources(dir);

  const deps = { typescript: version.typescript };
  for (const [name, tarball] of Object.entries(tarballs)) {
    deps[name] = `file:${path.relative(dir, tarball).split(path.sep).join('/')}`;
  }

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `@cancjs/tests-types-ts-${version.id}${flavor.suffix}`,
        version: '0.0.0',
        private: true,
        description: `Isolated TS ${version.id} decorator${flavor.suffix} fixture (generated by run-matrix.mjs, do not edit by hand).`,
        scripts: { check: 'tsc --noEmit' },
        dependencies: deps,
      },
      null,
      2,
    ) + '\n',
  );

  const tsconfig = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      target: 'es2019',
      module: version.moduleResolution === 'node' ? 'commonjs' : 'esnext',
      moduleResolution: version.moduleResolution,
      lib: [...(version.lib || ['es2022', 'dom']), ...(flavor.extraLib || [])],
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      experimentalDecorators: flavor.experimentalDecorators,
      useDefineForClassFields: false,
      types: [],
    },
    files: [localSource(flavor.file)],
  };
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  return dir;
}

function installFixture(dir) {
  fs.rmSync(path.join(dir, 'node_modules', '@cancjs'), { recursive: true, force: true });
  fs.rmSync(path.join(dir, 'node_modules', '.package-lock.json'), { force: true });
  run(npmCmd, ['install', '--no-package-lock', '--no-audit', '--no-fund', '--silent'], { cwd: dir });
}

function tscFor(dir) {
  const bin = path.join(dir, 'node_modules', '.bin', isWin ? 'tsc.cmd' : 'tsc');
  try {
    run(bin, ['--noEmit'], { cwd: dir });
    return { ok: true, output: '' };
  } catch (e) {
    return { ok: false, output: `${e.stdout || ''}${e.stderr || ''}`.trim() };
  }
}

function versionOfTsc(dir) {
  const bin = path.join(dir, 'node_modules', '.bin', isWin ? 'tsc.cmd' : 'tsc');
  try {
    return run(bin, ['--version'])
      .trim()
      .replace(/^Version\s+/, '');
  } catch {
    return '?';
  }
}

function main() {
  const versions = config.versions.filter((v) => onlyList.length === 0 || onlyList.includes(v.id));
  if (versions.length === 0) {
    console.error(red(`No versions matched --only "${onlyList.join(',')}"`));
    process.exit(2);
  }

  pruneStaleFixtures();

  console.log(bold(`TS matrix: packing ${config.packages.length} package(s)...`));
  const tarballs = packPackages();

  const results = [];
  for (const version of versions) {
    console.log(
      bold(`\n[ts-${version.id}] (typescript@${version.typescript}, moduleResolution=${version.moduleResolution})`),
    );
    const dir = writeFixture(version, tarballs);
    if (!noInstall) {
      process.stdout.write(dim(' installing... '));
      installFixture(dir);
      console.log(dim('done'));
    }
    const resolved = versionOfTsc(dir);
    if (setupOnly) {
      console.log(dim(` tsc ${resolved} ready (setup-only)`));
      results.push({ id: version.id, tsc: resolved, ok: null });
    } else {
      const { ok, output } = tscFor(dir);
      if (ok) {
        console.log(green(` PASS tsc ${resolved} --noEmit clean`));
      } else {
        console.log(red(` FAIL tsc ${resolved} --noEmit reported errors:`));
        console.log(
          output
            .split(/\r?\n/)
            .map((l) => ' ' + l)
            .join('\n'),
        );
      }
      results.push({ id: version.id, tsc: resolved, ok, output });
    }

    if (version.decoratorTypes) {
      for (const flavor of DECORATOR_FLAVORS) {
        const label = `${version.id}${flavor.suffix}`;
        console.log(bold(` [ts-${label}] decorator fixture`));
        const dDir = writeDecoratorFixture(version, tarballs, flavor);
        if (!noInstall) {
          process.stdout.write(dim(' installing... '));
          installFixture(dDir);
          console.log(dim('done'));
        }
        if (setupOnly) {
          console.log(dim(` ready (setup-only)`));
          results.push({ id: label, tsc: resolved, ok: null });
          continue;
        }
        const { ok, output } = tscFor(dDir);
        if (ok) {
          console.log(green(` PASS tsc ${resolved} --noEmit clean`));
        } else {
          console.log(red(` FAIL tsc ${resolved} --noEmit reported errors:`));
          console.log(
            output
              .split(/\r?\n/)
              .map((l) => ' ' + l)
              .join('\n'),
          );
        }
        results.push({ id: label, tsc: resolved, ok, output });
      }
    }
  }

  if (setupOnly) {
    console.log(bold('\nSetup complete.'));
    return;
  }

  const failed = results.filter((r) => r.ok === false);
  console.log(bold('\n---- matrix summary ----'));
  for (const r of results) {
    const tag = r.ok ? green('PASS') : red('FAIL');
    console.log(` ${tag} ts-${r.id} (tsc ${r.tsc})`);
  }
  if (failed.length) {
    console.log(red(bold(`\n${failed.length}/${results.length} lane(s) failed.`)));
    process.exit(1);
  }
  console.log(green(bold(`\nAll ${results.length} lane(s) green.`)));
}

main();
