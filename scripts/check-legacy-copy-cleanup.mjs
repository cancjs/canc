#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owned = path.join(os.tmpdir(), 'canc', 'p104d-legacy-copy');
const cwdPackage = path.join(repo, 'packages/canc-promise');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function docsCheck() {
  const readme = fs.readFileSync(path.join(cwdPackage, 'README.md'), 'utf8');
  const source = fs.readFileSync(path.join(cwdPackage, 'src/cancelable-promise.ts'), 'utf8');
  const qualifiers = [
    /participating CancelablePromise copies implement the current cancellation protocol/i,
    /distinct legacy 1\.0 runtime copies/i,
    /upgrade or deduplicate/i,
  ];
  for (const [label, text] of [
    ['README', readme],
    ['JSDoc', source],
  ]) {
    if (qualifiers.some((expression) => !expression.test(text))) {
      throw new Error('missing legacy cleanup qualifier in ' + label);
    }
  }
  console.log('PASS legacy cleanup disclaimer');
}

function command(args, cwd) {
  const shell = process.platform === 'win32';
  const escaped = shell ? args.map((arg) => (/[\s"]/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg)) : args;
  const run = spawnSync(npm, escaped, {
    cwd,
    encoding: 'utf8',
    shell,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_userconfig: path.join(owned, 'empty-npmrc') },
  });
  if (run.error || run.status !== 0) {
    throw new Error('npm ' + args.join(' ') + ': ' + String(run.error || run.status) + '\n' + run.stdout + run.stderr);
  }
  return run.stdout;
}

function install(prefix, artifact) {
  fs.mkdirSync(prefix, { recursive: true });
  command(
    [
      'install',
      '--prefix',
      prefix,
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--legacy-peer-deps',
      artifact,
    ],
    prefix,
  );
  const dir = path.join(prefix, 'node_modules/@cancjs/promise');
  const actual = fs.realpathSync(dir);
  if (path.normalize(actual).toLowerCase() !== path.normalize(dir).toLowerCase()) {
    throw new Error('fixture not physically installed: ' + dir + ' -> ' + actual);
  }
  return dir;
}

async function imports(dir, label) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const cjs = requireAbsolute(path.join(dir, 'dist/index.cjs'));
  const esm = await import(pathToFileURL(path.join(dir, 'dist/index.mjs')).href);
  const pick = (module) => module.default || module.CancelablePromise || module;
  const result = { cjs: pick(cjs), esm: pick(esm) };
  if (typeof result.cjs !== 'function' || typeof result.esm !== 'function') {
    throw new Error('cannot resolve CJS/ESM constructor for ' + label);
  }
  console.log('installed ' + label + ': ' + manifest.version + ' ' + dir);
  return { ...result, version: manifest.version, dir };
}

function requireAbsolute(filename) {
  return requireFromRoot(filename);
}

const requireFromRoot = createRequire(import.meta.url);

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
async function turns(count = 7) {
  for (let n = 0; n < count; n++) await nextTurn();
}

async function probe(label, Source, Wrapper, earlyExpected) {
  let gateRelease;
  const gate = new Promise((resolve) => {
    gateRelease = resolve;
  });
  let started = 0;
  let finished = 0;
  const source = new Source((_resolve, _reject, ctx) => {
    ctx.handleCancel(async () => {
      started++;
      await gate;
      finished++;
    });
  });
  const wrapper = new Wrapper((resolve) => resolve(source));
  const canceled = wrapper.cancel();
  if (!canceled || typeof canceled.then !== 'function') {
    throw new Error('cancel did not produce awaitable result: ' + label);
  }
  let done = false;
  let failed;
  const tracked = Promise.resolve(canceled).then(
    () => {
      done = true;
    },
    (error) => {
      failed = error;
      done = true;
    },
  );
  await turns();
  assert.equal(source.isCanceled, true, label + ' source not canceled');
  assert.equal(started, 1, label + ' handler invocation count');
  assert.equal(finished, 0, label + ' handler finished before gate opened');
  assert.equal(done, earlyExpected, label + ' cleanup barrier mismatch');
  assert.equal(failed, undefined, label + ' cancel promise rejected before gate');
  console.log('pre-gate ' + label + ': started=' + started + ', finished=' + finished + ', done=' + done);
  gateRelease();
  await tracked;
  await turns(2);
  assert.equal(finished, 1, label + ' cleanup did not finish');
  assert.equal(started, 1, label + ' cleanup invoked more than once');
  assert.equal(failed, undefined, label + ' cancel promise rejection');
  console.log('post-gate ' + label + ': started=' + started + ', finished=' + finished + ', done=' + done);
}

async function main() {
  if (process.argv.includes('--check-docs')) return docsCheck();
  docsCheck();
  fs.rmSync(owned, { recursive: true, force: true });
  fs.mkdirSync(owned, { recursive: true });
  fs.writeFileSync(path.join(owned, 'empty-npmrc'), '');
  const tar = path.join(owned, 'tar');
  fs.mkdirSync(tar, { recursive: true });
  const tarballName = command(['pack', '--pack-destination', tar, '--ignore-scripts'], cwdPackage)
    .trim()
    .split(/\r?\n/)
    .pop();
  const tarball = path.join(tar, tarballName);
  assert.ok(fs.existsSync(tarball), 'tarball was not produced');
  const currentA = await imports(install(path.join(owned, 'currentA'), tarball), 'currentA');
  const currentB = await imports(install(path.join(owned, 'currentB'), tarball), 'currentB');
  const old = await imports(install(path.join(owned, 'old'), '@cancjs/promise@1.0.0'), 'old');
  assert.equal(currentA.version, '1.1.0-beta.2');
  assert.equal(currentB.version, currentA.version);
  assert.equal(old.version, '1.0.0');
  assert.notEqual(currentA.dir, currentB.dir);
  assert.notEqual(currentA.dir, old.dir);
  assert.notEqual(currentA.cjs, currentA.esm);
  assert.notEqual(currentA.cjs, currentB.cjs);
  const pairs = [
    ['currentA CJS -> same', currentA.cjs, currentA.cjs, false],
    ['currentA CJS -> currentA ESM', currentA.cjs, currentA.esm, false],
    ['currentA CJS -> currentB CJS', currentA.cjs, currentB.cjs, false],
    ['currentA ESM -> currentB ESM', currentA.esm, currentB.esm, false],
    ['currentB CJS -> currentA ESM', currentB.cjs, currentA.esm, false],
    ['old CJS -> same', old.cjs, old.cjs, false],
    ['old CJS -> old ESM', old.cjs, old.esm, true],
    ['old CJS -> currentA CJS', old.cjs, currentA.cjs, true],
    ['old ESM -> currentA ESM', old.esm, currentA.esm, true],
    ['currentA CJS -> old CJS', currentA.cjs, old.cjs, true],
    ['currentA ESM -> old ESM', currentA.esm, old.esm, true],
  ];
  for (const [name, Source, Wrapper, early] of pairs) await probe(name, Source, Wrapper, early);
  console.log('PASS current copy awaits cleanup');
  console.log('PASS legacy distinct copy may finish early');
  console.log('PASS eventual cleanup once');
  console.log('PASS 11/11 physical cleanup barriers');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
