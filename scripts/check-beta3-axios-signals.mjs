// Run after building the three Canc packages
// Packs real files into isolated consumers
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const allLanes = ['old-cjs', 'old-esm', 'modern-cjs', 'modern-esm'];
let packageRoot = root;
let mutant = 'none';
let selectedLane;
const args = process.argv.slice(2);
while (args.length) {
  const arg = args.shift();
  if (arg === '--package-root') {
    assert.ok(args[0] && !args[0].startsWith('--'), 'missing --package-root value');
    packageRoot = path.resolve(args.shift());
  } else if (arg.startsWith('--mutant=')) {
    mutant = arg.slice('--mutant='.length);
    assert.ok(['no-ingress', 'no-close'].includes(mutant), 'unknown mutant: ' + mutant);
  } else if (arg.startsWith('--lane=')) {
    selectedLane = arg.slice('--lane='.length);
    assert.ok(allLanes.includes(selectedLane), 'unknown lane: ' + selectedLane);
  } else {
    throw new Error('unknown argument: ' + arg);
  }
}

function resolveNpmCli() {
  const bin = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (found) return found;
  return require.resolve('npm/bin/npm-cli.js');
}

const npmCli = resolveNpmCli();
const run = (command, cwd, timeout) => {
  const result = spawnSync(process.execPath, command, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 4_000_000,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    throw new Error(
      command.join(' ') + ' exit ' + result.status + ' signal ' + result.signal + ' ' + String(result.error || ''),
    );
  }
  return result.stdout;
};

const base = path.join(os.tmpdir(), 'canc', 'axios-signal-check');
fs.mkdirSync(base, { recursive: true });
const owned = fs.mkdtempSync(path.join(base, 'run-'));
console.log('OWNED ' + owned);
console.log('PACKAGE ROOT ' + packageRoot);

function pack(name, dir, expectedVersion, native = false) {
  // Native Axios is an installed distribution, not its source checkout.
  // Do not rerun its repository prepare scripts when repacking it.
  const stdout = run(
    [npmCli, 'pack', dir, '--json', '--pack-destination', owned, ...(native ? ['--ignore-scripts'] : [])],
    root,
    60_000,
  );
  const [item] = JSON.parse(stdout);
  assert.equal(item.name, name, 'packed package name');
  if (expectedVersion) assert.equal(item.version, expectedVersion, 'packed package version');
  const file = path.join(owned, item.filename);
  assert.ok(fs.statSync(file).isFile(), 'missing tarball ' + file);
  console.log('PACK ' + item.name + '@' + item.version + ' ' + file);
  return file;
}

try {
  const cancPacks = ['promise', 'toolbox', 'axios'].map((name) => {
    const dir = path.join(packageRoot, 'packages', 'canc-' + name);
    for (const file of ['index.cjs', 'index.mjs']) {
      assert.ok(fs.statSync(path.join(dir, 'dist', file)).isFile(), 'build package first: ' + dir);
    }
    return pack('@cancjs/' + name, dir);
  });
  const nativePacks = {
    old: pack('axios', path.dirname(require.resolve('axios-legacy/package.json')), '0.22.0', true),
    modern: pack('axios', path.dirname(require.resolve('axios/package.json')), '1.16.0', true),
  };
  const lanes = selectedLane ? [selectedLane] : allLanes;
  let cases = 0;
  for (const lane of lanes) {
    const [version, format] = lane.split('-');
    const expectedVersion = version === 'old' ? '0.22.0' : '1.16.0';
    const prefix = path.join(owned, lane);
    fs.mkdirSync(prefix);
    fs.writeFileSync(
      path.join(prefix, 'package.json'),
      JSON.stringify({ name: 'axios-signal-consumer-' + lane, private: true, type: 'module' }),
    );
    const installOutput = run(
      [npmCli, 'install', '--no-package-lock', '--no-audit', '--no-fund', ...cancPacks, nativePacks[version]],
      prefix,
      60_000,
    );
    process.stdout.write(installOutput);
    fs.copyFileSync(
      path.join(root, 'scripts', 'fixtures', 'axios-signal-consumer.mjs'),
      path.join(prefix, 'probe.mjs'),
    );
    console.log('LANE ' + lane + ' ' + prefix);
    const stdout = run(['probe.mjs', format, expectedVersion, mutant], prefix, 20_000);
    process.stdout.write(stdout);
    const summary = 'PHYSICAL PASS 12/12 cases ' + format + ' axios ' + expectedVersion;
    assert.equal(stdout.split(/\r?\n/).filter((line) => line === summary).length, 1, 'missing lane summary');
    assert.equal(stdout.split(/\r?\n/).filter((line) => line.startsWith('PASS ')).length, 12, 'case count');
    cases += 12;
    console.log('LANE EXIT 0 ' + lane);
  }
  if (selectedLane) {
    console.log('AXIOS SIGNALS LANE PASS ' + cases + '/12 ' + selectedLane);
  } else {
    assert.equal(cases, 48);
    console.log('AXIOS SIGNALS PASS 48/48, 4 isolated consumers');
  }
} finally {
  fs.rmSync(owned, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  console.log('CLEANED ' + owned);
}
