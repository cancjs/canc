#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageDir = path.join(repoRoot, 'packages/canc-promise');
const ownedRoot = path.join(os.tmpdir(), 'canc', 'p104d-type-formats');
const tarDir = path.join(ownedRoot, 'tar');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function invoke(command, args, cwd) {
  const shell = process.platform === 'win32' && command.endsWith('.cmd');
  const argv = shell ? args.map((arg) => (/[\s"]/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg)) : args;
  const result = spawnSync(command, argv, {
    cwd,
    shell,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  if (result.error) throw result.error;
  return result;
}

function checked(command, args, cwd, purpose) {
  const result = invoke(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(purpose + ' failed (exit ' + result.status + ')\n' + result.stdout + result.stderr);
  }
  return result.stdout;
}

const sample = [
  "import type { FailureOf, Unlisted } from '@cancjs/promise';",
  "import CP from '@cancjs/promise';",
  'type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
  'type Assert<T extends true> = T;',
  'class Foo extends Error { readonly foo = 1 as const; }',
  'declare const owned: CP<number, Foo>;',
  'declare const native: Promise<number>;',
  'const setResult = CP.all(new Set([owned]));',
  'type _set = Assert<Eq<FailureOf<typeof setResult>, Foo>>;',
  'function* generator(): Generator<CP<number, Foo>, void, unknown> { yield owned; }',
  'const generated = CP.all(generator());',
  'type _generator = Assert<Eq<FailureOf<typeof generated>, Foo>>;',
  'const nativeResult = CP.all(new Set([native]));',
  'type _native = Assert<Eq<FailureOf<typeof nativeResult>, Unlisted>>;',
  'const primitive = CP.all(new Set([1, 2]));',
  'type _primitive = Assert<Eq<FailureOf<typeof primitive>, never>>;',
  'const mixedSource = new Set<CP<number, Foo> | Promise<number>>([owned, native]);',
  'const mixed = CP.all(mixedSource);',
  'type _mixed = Assert<Eq<FailureOf<typeof mixed>, Foo | Unlisted>>;',
  'const explicit = CP.all<number>(new Set([Promise.resolve(7)]));',
  'type _explicit = Assert<Eq<typeof explicit, CP<number[], never>>>;',
  'export {};',
].join('\n');

function normalize(file) {
  return file.replace(/\\/g, '/').toLowerCase();
}

function checkInstalled(prefix) {
  const installed = path.join(prefix, 'node_modules', '@cancjs', 'promise');
  const actual = fs.realpathSync(installed);
  if (normalize(actual) !== normalize(installed)) {
    throw new Error('Installed promise is symlinked outside fixture: ' + actual);
  }
  if (!fs.existsSync(path.join(installed, 'package.json'))) {
    throw new Error('No physical promise package at ' + installed);
  }
}

function compile(prefix, pin, extension, trace = true) {
  const root = path.join(prefix, 'cases');
  fs.mkdirSync(root, { recursive: true });
  const name = 'sample.' + extension;
  fs.writeFileSync(path.join(root, name), sample);
  const isLegacy = pin === '4.2.4';
  const isNode16 = pin === '4.7.4';
  const config = {
    compilerOptions: {
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
      target: 'es2020',
      module:
        isLegacy ? 'commonjs'
        : isNode16 ? 'node16'
        : 'nodenext',
      moduleResolution:
        isLegacy ? 'node'
        : isNode16 ? 'node16'
        : 'nodenext',
      lib: isLegacy ? ['es2020', 'dom'] : ['es2022', 'dom'],
    },
    files: [name],
  };
  const configFile = path.join(root, 'tsconfig-' + extension + '.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  const compiler = path.join(prefix, 'node_modules/typescript/lib/tsc.js');
  if (!fs.existsSync(compiler)) throw new Error('TypeScript not installed at ' + compiler);
  const result = invoke(process.execPath, [compiler, '-p', configFile, ...(trace ? ['--traceResolution'] : [])], root);
  const output = result.stdout + result.stderr;
  const typeIndex = path.join(
    prefix,
    'node_modules/@cancjs/promise',
    isLegacy ? 'dist/types-ts4.2/index.d.ts'
    : extension === 'cts' ? 'dist/types/index.d.ts'
    : 'dist/types/index.d.mts',
  );
  if (trace && !normalize(output).includes(normalize(typeIndex))) {
    throw new Error('Compiler did not resolve exact installed ' + typeIndex + '\n' + output.slice(-5000));
  }
  return { status: result.status, output };
}

function redMutant(prefix, pin, extension) {
  const filename = path.join(
    prefix,
    'node_modules/@cancjs/promise',
    pin === '4.2.4' ? 'dist/types-ts4.2/cancelable-promise.d.ts'
    : extension === 'cts' ? 'dist/types/cancelable-promise.d.ts'
    : 'dist/types/cancelable-promise.d.mts',
  );
  const original = fs.readFileSync(filename, 'utf8');
  const line =
    / {4}static all<T>\(values: Iterable<T>, options\?: ICancelablePromiseOptions\): CancelablePromise<Awaited<T>\[\], FailureOf<T>>;\r?\n/;
  if (!line.test(original)) throw new Error('Raw overload not found for mutant: ' + filename);
  try {
    fs.writeFileSync(filename, original.replace(line, ''));
    const red = compile(prefix, pin, extension, false);
    if (red.status === 0 || !red.output.includes('TS2344')) {
      throw new Error('Expected TS2344 for removed overload in ' + extension + ': ' + red.output.slice(-2500));
    }
    console.log('PASS packed mutant ' + pin + ' ' + extension + ' TS2344');
  } finally {
    fs.writeFileSync(filename, original);
  }
  const clean = compile(prefix, pin, extension);
  if (clean.status !== 0) throw new Error('Mutation restore failed: ' + clean.output.slice(-2500));
}

function main() {
  fs.rmSync(ownedRoot, { recursive: true, force: true });
  fs.mkdirSync(tarDir, { recursive: true });
  const packedName = checked(npmCmd, ['pack', '--ignore-scripts', '--pack-destination', tarDir], packageDir, 'npm pack')
    .trim()
    .split(/\r?\n/)
    .pop();
  const tarball = path.join(tarDir, packedName);
  if (!fs.existsSync(tarball)) throw new Error('Candidate tarball missing: ' + tarball);

  const pins = ['4.2.4', '4.7.4', '5.9.3', '7.0.2'];
  for (const pin of pins) {
    const prefix = path.join(ownedRoot, 'ts-' + pin);
    fs.mkdirSync(prefix, { recursive: true });
    checked(
      npmCmd,
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
        'typescript@' + pin,
        tarball,
      ],
      prefix,
      'npm install TS ' + pin,
    );
    checkInstalled(prefix);
    const formats = pin === '4.2.4' ? ['ts'] : ['cts', 'mts'];
    for (const extension of formats) {
      const result = compile(prefix, pin, extension);
      if (result.status !== 0)
        throw new Error('TS ' + pin + ' ' + extension + ' failed:\n' + result.output.slice(-7000));
      if (pin === '4.2.4') console.log('PASS packed TS4.2 legacy');
      if (pin === '4.7.4') console.log('PASS packed TS4.7 ' + (extension === 'cts' ? 'CJS' : 'ESM'));
      if (pin === '5.9.3' && extension === 'mts') console.log('PASS packed TS5.9 CJS/ESM');
      if (pin === '7.0.2' && extension === 'mts') console.log('PASS packed TS7 CJS/ESM');
    }
    if (pin === '4.2.4') redMutant(prefix, pin, 'ts');
    if (pin === '4.7.4') redMutant(prefix, pin, 'cts');
    if (pin === '5.9.3') redMutant(prefix, pin, 'mts');
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
