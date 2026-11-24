import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = path.join(os.tmpdir(), 'canc', 'p114c-report');
const npm =
  process.env.npm_execpath ??
  (process.platform === 'win32' ?
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : undefined);
const node18 =
  process.env.CANC_NODE18_BINARY ??
  (process.platform === 'win32' ?
    path.join(os.tmpdir(), 'canc/p114c-node18/node_modules/node-win-x64/bin/node.exe')
  : '');
const node24 = process.env.CANC_NODE24_BINARY ?? (process.platform === 'win32' ? process.execPath : '');
const lanes = ['18-cjs', '18-mjs', '24-cjs', '24-mjs'];
const chosen = process.argv.find((arg) => arg.startsWith('--lane='))?.slice(7);
assert.ok(!chosen || lanes.includes(chosen), 'unknown lane');
const mutants = process.argv.includes('--mutants');
const installFlags = [
  '--no-save',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--no-package-lock',
  '--legacy-peer-deps',
];

function run(exe, args, cwd, env = {}) {
  const result = spawnSync(exe, args, {
    cwd,
    env: { ...process.env, NODE_OPTIONS: '', ...env },
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.ok(result.signal === null, String(result.signal));
  return result;
}
function checked(exe, args, cwd) {
  const result = run(exe, args, cwd);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}
function npmRun(args, cwd) {
  return npm ? checked(process.execPath, [npm, ...args], cwd) : checked('npm', args, cwd);
}
assert.ok(path.isAbsolute(node18) && path.isAbsolute(node24), 'set absolute Node18 and Node24 binary paths');
assert.equal(checked(node18, ['-v'], root), 'v18.20.8');
assert.match(checked(node24, ['-v'], root), /^v24\./);

const packages = ['promise', 'unhandled-rejection'];
const expressions = [
  ['ordinary-error', "Object.assign(new Error('OUTER_REAL'), { errors: [cancel] })", false, 0, {}],
  ['plain-object', "({ message: 'OUTER_REAL', errors: [cancel] })", false, 0, {}],
  [
    'outer-abort',
    "Object.assign(new Error('OUTER_REAL'), { errors: [new DOMException('abort','AbortError')] })",
    false,
    0,
    { abort: true },
  ],
  [
    'outer-timeout',
    "Object.assign(new Error('OUTER_REAL'), { errors: [new DOMException('timeout','TimeoutError')] })",
    false,
    0,
    { timeout: true },
  ],
  [
    'ordinary-getter',
    "Object.defineProperty(new Error('OUTER_REAL'), 'errors', { get() { hits++; return [cancel]; } })",
    false,
    0,
    {},
  ],
  [
    'plain-getter',
    "Object.defineProperty({ message: 'OUTER_REAL' }, 'errors', { get() { hits++; throw new Error('getter'); } })",
    false,
    0,
    {},
  ],
  ['native-aggregate', "new AggregateError([cancel], 'OUTER_REAL')", true, 0, {}],
  ['foreign-aggregate', 'vm.runInNewContext(\'new AggregateError([cancel], "OUTER_REAL")\', { cancel })', true, 0, {}],
  ['mixed', "new AggregateError([cancel,new Error('real')], 'OUTER_REAL')", false, 0, {}],
  ['empty', "new AggregateError([], 'OUTER_REAL')", false, 0, {}],
  [
    'aggregate-getter',
    "Object.defineProperty(new AggregateError([], 'OUTER_REAL'), 'errors', { get() { hits++; throw new Error('getter'); } })",
    false,
    1,
    {},
  ],
  ['name-interop', "Object.assign(new Error('OUTER_REAL'), { name: 'AggregateError', errors: [cancel] })", true, 0, {}],
  ['cancel', 'cancel', true, 0, {}],
  ['foreign-copy', "new AggregateError([new copy.CancelError('CANCEL_MARKER')], 'OUTER_REAL')", true, 0, {}],
  ['abort-leaf', "new DOMException('OUTER_REAL','AbortError')", true, 0, { abort: true }],
  ['timeout-leaf', "new DOMException('OUTER_REAL','TimeoutError')", true, 0, { timeout: true }],
];
const modeCases = [
  ['strict-callback', 'strict', true, true, true, 1, 0, 1, false],
  ['strict-default', 'strict', false, true, true, 1, 0, 1, false],
  ['strict-no-warning', 'strict', true, false, true, 1, 0, 0, false],
  ['warn-cancel', 'warn', false, false, true, 0, 0, 0, true],
  ['warn-genuine', 'warn', false, true, false, 0, 0, 1, true],
  ['warn-with-error-code', 'warn-with-error-code', false, true, false, 1, 0, 1, false],
  ['none', 'none', false, true, false, 0, 0, 1, false],
];

function createFixture(consumer, format) {
  const prelude =
    format === 'cjs' ?
      'const load = async id => require(id); const resolve = id => require.resolve(id);'
    : "import {fileURLToPath} from 'node:url'; const load = id => import(id); const resolve = async id => fileURLToPath(await import.meta.resolve(id));";
  const body = [
    '(async()=>{',
    "const fs = (await load('node:fs')).default ?? await load('node:fs');",
    "const path = (await load('node:path')).default ?? await load('node:path');",
    "const vm = (await load('node:vm')).default ?? await load('node:vm');",
    "const assert = (await load('node:assert/strict')).default ?? await load('node:assert/strict');",
    "const core = await load('@cancjs/promise');",
    "const handler = await load('@cancjs/unhandled-rejection');",
    "const copy = await load('./promise-copy/dist/index." + format + "');",
    'assert.notEqual(core.CancelError, copy.CancelError);',
    "for(const id of ['@cancjs/promise','@cancjs/unhandled-rejection']){const entry=fs.realpathSync(await resolve(id));assert.ok(entry.startsWith(fs.realpathSync(path.join(process.cwd(),'node_modules'))+path.sep));assert.ok(entry.endsWith('." +
      format +
      "'));console.log('ENTRY '+entry);}",
    'const config = JSON.parse(process.argv[2]);',
    "const cancel = new core.CancelError('CANCEL_MARKER'); let hits=0,count=0,monitor=0,same=true;",
    'const reason = eval(config.expression);',
    'const options = {...config.options,warn:config.warn};',
    'if(config.callback) options.onUnhandledRejection=(r,p)=>{count++;same=same&&r===reason&&p===rejected;};',
    '(handler.registerNode ?? handler.register)(options);',
    "process.on('uncaughtExceptionMonitor',r=>{monitor++;same=same&&r===reason;});",
    "process.on('exit',()=>console.log('RESULT '+JSON.stringify({count,monitor,same,hits})));",
    'const rejected = Promise.reject(reason);',
    '})().catch(e=>{console.error(e);process.exitCode=2;});',
  ].join('\n');
  const fixture = path.join(consumer, 'fixture.' + format);
  fs.writeFileSync(fixture, prelude + '\n' + body);
  return fixture;
}

function createLockFixture(consumer, format) {
  const prelude =
    format === 'cjs' ?
      'const load = async id => require(id); const resolve = id => require.resolve(id);'
    : "import {fileURLToPath} from 'node:url'; const load = id => import(id); const resolve = id => fileURLToPath(import.meta.resolve(id));";
  const body = async (load, resolve, format) => {
    const fs = (await load('node:fs')).default ?? (await load('node:fs'));
    const path = (await load('node:path')).default ?? (await load('node:path'));
    const assert = (await load('node:assert/strict')).default ?? (await load('node:assert/strict'));
    const { register } = await load('@cancjs/unhandled-rejection');
    const { CancelablePromise } = await load('@cancjs/promise');
    const { requestLock } = await load('@cancjs/node/worker-threads');
    for (const id of ['@cancjs/promise', '@cancjs/unhandled-rejection', '@cancjs/node/worker-threads']) {
      const entry = fs.realpathSync(await resolve(id));
      assert.ok(entry.startsWith(fs.realpathSync(path.join(process.cwd(), 'node_modules')) + path.sep));
      assert.ok(entry.endsWith('.' + format));
      console.log('ENTRY ' + entry);
    }
    const { kind, callback } = JSON.parse(process.argv[2]);
    const marker = new Error('genuine-lock-failure');
    const name = 'host-lock-' + process.pid;
    let count = 0,
      monitor = 0,
      same = true,
      hits = 0,
      entered = false,
      advanced = false;
    register(
      callback ?
        {
          warn: false,
          onUnhandledRejection(reason, promise) {
            count++;
            same = same && reason === marker && promise === holder;
          },
        }
      : { warn: false },
    );
    process.on('uncaughtExceptionMonitor', (reason) => {
      monitor++;
      same = same && reason === marker;
    });
    process.on('exit', () =>
      console.log('RESULT ' + JSON.stringify({ count, monitor, same, hits, entered, advanced })),
    );
    let notify;
    const ready = new Promise((resolve) => {
      notify = resolve;
    });
    const holder = requestLock(name, () => {
      entered = true;
      notify();
      if (kind === 'body-throw') throw marker;
      if (kind === 'cancel') return new CancelablePromise(() => {});
      return Object.defineProperty({}, 'then', {
        get() {
          hits++;
          throw marker;
        },
      });
    });
    await ready;
    if (kind === 'cancel') await holder.cancel();
    assert.equal(await requestLock(name, () => 17), 17);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    advanced = true;
  };
  const fixture = path.join(consumer, 'lock-host.' + format);
  fs.writeFileSync(
    fixture,
    prelude +
      '\n(' +
      body.toString() +
      ')(load,resolve,' +
      JSON.stringify(format) +
      ').catch(error=>{console.error(error);process.exitCode=2;});',
  );
  return fixture;
}

function checkLockHost(host, consumer, fixture, format, kind, callback) {
  const label = 'lock-host-' + kind + (callback ? '-callback' : '-default');
  const result = run(host, ['--unhandled-rejections=throw', fixture, JSON.stringify({ kind, callback })], consumer);
  console.log(
    'PROCESS',
    JSON.stringify({
      label,
      host,
      format,
      pid: result.pid,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }),
  );
  const lines = result.stdout.split(/\r?\n/);
  const summary = lines.find((line) => line.startsWith('RESULT '));
  assert.equal(lines.filter((line) => line.startsWith('ENTRY ')).length, 3, label + ': installed entries');
  assert.ok(summary, label + ': missing exit observation');
  const fatal = kind !== 'cancel' && !callback;
  assert.equal(result.status, fatal ? 1 : 0, label + ': exit');
  const info = JSON.parse(summary.slice(7));
  assert.deepEqual(
    { count: info.count, monitor: info.monitor, same: info.same, hits: info.hits, entered: info.entered },
    {
      count: kind !== 'cancel' && callback ? 1 : 0,
      monitor: fatal ? 1 : 0,
      same: true,
      hits: kind === 'getter-throw' ? 1 : 0,
      entered: true,
    },
    label + ': genuine reporting',
  );
  if (fatal) assert.ok(result.stderr.includes('genuine-lock-failure'), label + ': missing original error');
  else assert.equal(info.advanced, true, label + ': subsequent ordinary grant');
  console.log('PASS packed lock host', format, kind, callback ? 'callback' : 'default');
}

function checkCase(host, consumer, fixture, format, label, config, expected) {
  const args = [
    '--unhandled-rejections=' + (config.mode ?? 'throw'),
    ...(format === 'mjs' ? ['--experimental-import-meta-resolve'] : []),
    fixture,
    JSON.stringify(config),
  ];
  const result = run(host, args, consumer);
  const lines = result.stdout.split(/\r?\n/);
  const summary = lines.find((line) => line.startsWith('RESULT '));
  const owned = result.stderr.split(/\r?\n/).filter((line) => line.includes('[@cancjs/unhandled-rejection]')).length;
  const native = result.stderr.includes('UnhandledPromiseRejectionWarning');
  console.log(
    'PROCESS',
    JSON.stringify({
      label,
      host,
      format,
      mode: config.mode ?? 'throw',
      pid: result.pid,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }),
  );
  assert.equal(lines.filter((line) => line.startsWith('ENTRY ')).length, 2, label + ': installed entries');
  assert.ok(summary, label + ': missing exit observation');
  assert.notEqual(result.status, 2, label + ': fixture error');
  assert.equal(result.status, expected.status, label);
  assert.deepEqual(JSON.parse(summary.slice(7)), expected.result, label);
  if (expected.owned !== undefined) assert.equal(owned, expected.owned, label + ': package warnings');
  if (expected.native !== undefined) assert.equal(native, expected.native, label + ': native warnings');
  if (expected.marker) assert.ok(result.stderr.includes(expected.marker), label + ': missing original error');
}
function ordinary(host, consumer, fixture, format, row, callback) {
  const [label, expression, suppressed, hits, options] = row;
  checkCase(
    host,
    consumer,
    fixture,
    format,
    label + (callback ? '-callback' : '-default'),
    { expression, callback, warn: false, options },
    {
      status: suppressed || callback ? 0 : 1,
      result: { count: !suppressed && callback ? 1 : 0, monitor: !suppressed && !callback ? 1 : 0, same: true, hits },
      owned: 0,
      native: false,
      marker: !suppressed && !callback ? 'OUTER_REAL' : undefined,
    },
  );
}
function modeCase(host, consumer, fixture, format, row) {
  const [label, mode, callback, warn, canceled, status, count, owned, native] = row;
  checkCase(
    host,
    consumer,
    fixture,
    format,
    label,
    { expression: canceled ? 'cancel' : "new Error('OUTER_REAL')", callback, warn, mode },
    {
      status,
      result: { count, monitor: mode === 'strict' ? 1 : 0, same: true, hits: 0 },
      owned,
      native,
      marker:
        mode === 'strict' ? 'CANCEL_MARKER'
        : !canceled ? 'OUTER_REAL'
        : undefined,
    },
  );
}
function install(consumer, archives, versions) {
  fs.mkdirSync(consumer);
  npmRun(['install', '--prefix', consumer, ...installFlags, ...archives], root);
  for (const pkg of Object.keys(versions)) {
    const installed = path.join(consumer, 'node_modules/@cancjs', pkg);
    assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version, versions[pkg]);
    assert.equal(fs.lstatSync(installed).isSymbolicLink(), false);
  }
  fs.cpSync(path.join(consumer, 'node_modules/@cancjs/promise'), path.join(consumer, 'promise-copy'), {
    recursive: true,
  });
}
function mutation(host, consumer, fixture, format, id, anchor, replacement, probe) {
  const bundle = path.join(consumer, 'node_modules/@cancjs/unhandled-rejection/dist/index.' + format);
  const original = fs.readFileSync(bundle, 'utf8');
  assert.equal([...original.matchAll(new RegExp(anchor.source, 'g'))].length, 1, id + ': anchor count');
  try {
    fs.writeFileSync(bundle, original.replace(anchor, replacement));
    let failed = false;
    try {
      probe();
    } catch (error) {
      assert.ok(error instanceof assert.AssertionError, String(error));
      const expectedFailure = {
        'outer-guard': 'ordinary-error-default',
        'nonaggregate-getter': 'ordinary-getter-callback',
        instanceof: 'foreign-aggregate-default',
        'strict-advisory': 'strict-callback: package warnings',
      }[id];
      assert.equal(error.message.split('\n')[0], expectedFailure);
      if (id === 'outer-guard' || id === 'strict-advisory') assert.equal(error.actual, 0);
      if (id === 'instanceof') assert.equal(error.actual, 1);
      if (id === 'nonaggregate-getter') assert.deepEqual(error.actual, { count: 0, monitor: 0, same: true, hits: 1 });
      failed = true;
      console.log('MUTANT RED', id, format, error.message);
    }
    assert.ok(failed, id + ': mutation survived');
  } finally {
    fs.writeFileSync(bundle, original);
    assert.equal(fs.readFileSync(bundle, 'utf8'), original);
  }
  probe();
}
fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'fixture-'));
try {
  const tarDir = path.join(scratch, 'tar');
  fs.mkdirSync(tarDir);
  const versions = {};
  const archives = [...packages, 'node'].map((pkg) => {
    const cwd = path.join(root, 'packages', 'canc-' + pkg);
    versions[pkg] = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).version;
    const archive = path.join(
      tarDir,
      npmRun(['pack', '--ignore-scripts', '--pack-destination', tarDir], cwd).split(/\r?\n/).at(-1),
    );
    console.log('PACK', archive, createHash('sha256').update(fs.readFileSync(archive)).digest('hex'));
    return archive;
  });
  let failures = 0;
  let completed = 0;
  for (const lane of chosen ? [chosen] : lanes) {
    const [major, format] = lane.split('-');
    const host = major === '18' ? node18 : node24;
    const consumer = path.join(scratch, lane);
    install(consumer, archives, versions);
    const fixture = createFixture(consumer, format);
    const probes = [
      ...expressions.flatMap((row) =>
        [false, true].map((callback) => () => ordinary(host, consumer, fixture, format, row, callback)),
      ),
      ...modeCases.map((row) => () => modeCase(host, consumer, fixture, format, row)),
    ];
    if (major === '24') {
      const lockFixture = createLockFixture(consumer, format);
      for (const kind of ['body-throw', 'getter-throw', 'cancel']) {
        for (const callback of [false, true]) {
          probes.push(() => checkLockHost(host, consumer, lockFixture, format, kind, callback));
        }
      }
    }
    let passed = 0;
    for (const probe of probes) {
      try {
        probe();
        passed++;
      } catch (error) {
        failures++;
        console.error('FAIL packed', lane, error);
      }
    }
    console.log('LANE SUMMARY', lane, passed, probes.length);
    if (passed === probes.length) {
      console.log('PASS packed', format === 'cjs' ? 'CJS' : 'ESM', 'genuine error', major);
      console.log('PASS aggregate cancellation', lane);
      console.log('PASS strict callback limit', lane);
      console.log('PASS warn native notice', lane);
    }
    if (mutants) {
      const guard = /if \(!(?:promise\.)?isAggregateError\(error\)\)\s+return false;/;
      mutation(host, consumer, fixture, format, 'outer-guard', guard, '', () =>
        ordinary(host, consumer, fixture, format, expressions[0], false),
      );
      mutation(host, consumer, fixture, format, 'nonaggregate-getter', guard, '', () =>
        ordinary(host, consumer, fixture, format, expressions[4], true),
      );
      mutation(
        host,
        consumer,
        fixture,
        format,
        'instanceof',
        guard,
        'if (!(error instanceof AggregateError)) return false;',
        () => ordinary(host, consumer, fixture, format, expressions[7], false),
      );
      mutation(
        host,
        consumer,
        fixture,
        format,
        'strict-advisory',
        /if \(mode === 'strict'\) \{\s+warnSafe\(/,
        "if (mode === 'strict' && !(options && options.onUnhandledRejection)) { warnSafe(",
        () => modeCase(host, consumer, fixture, format, modeCases[0]),
      );
    }
    const stable = path.join(scratch, 'stable-' + lane);
    install(
      stable,
      packages.map((pkg) => '@cancjs/' + pkg + '@1.0.0'),
      { promise: '1.0.0', 'unhandled-rejection': '1.0.0' },
    );
    const stableFixture = createFixture(stable, format);
    ordinary(host, stable, stableFixture, format, expressions[0], false);
    ordinary(host, stable, stableFixture, format, expressions[1], false);
    console.log('PASS registry 1.0 comparator', lane);
    completed++;
  }
  console.log('PACKED SUMMARY', completed, failures);
  assert.equal(completed, chosen ? 1 : 4);
  assert.equal(failures, 0);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
