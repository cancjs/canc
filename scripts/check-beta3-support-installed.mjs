#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owned = path.join(os.tmpdir(), 'canc', 'p105c-installed');
const tarDir = path.join(owned, 'tar');
const marks = path.join(owned, 'marks');
const hostDir = path.join(os.tmpdir(), 'canc', 'p105c-fastify-floors');
const typesDir = path.join(os.tmpdir(), 'canc', 'p105c-server-types');
const exampleDir = path.join(owned, 'example');
const hostScript = path.join(repo, 'scripts', 'check-fastify-node-floor.mjs');
const typesScript = path.join(repo, 'scripts', 'check-server-compiler-support.mjs');
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const arg = (flag) => {
  const pos = argv.indexOf(flag);
  return pos < 0 ? undefined : argv[pos + 1];
};
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sources = [
  'canc-promise',
  'canc-coroutine',
  'canc-toolbox',
  ...['node', 'express', 'koa', 'fastify', 'hono'].map((x) => 'canc-server/canc-server-' + x),
];
const hostLanes = [
  'node20-floor-strict',
  'node20-modern-strict',
  'node20-floor-relaxed',
  'node20-modern-relaxed',
  'node22-0-floor-strict',
  'node22-0-modern-strict',
  'node22-0-floor-scripts',
  'node22-0-modern-scripts',
  'node22-12-floor-strict',
  'node22-12-modern-strict',
  'hono18-web',
  'hono18-explicit',
];
const typeLanes = [
  'node-floor',
  'express-floor',
  'koa-floor',
  'fastify-floor',
  'hono-floor',
  'express-modern',
  'koa-modern',
  'fastify-modern',
  'fastify-modern-59',
  'hono-modern',
  'node-legacy',
  'express-legacy',
  'koa-legacy',
  'hono-legacy',
  'fastify-legacy',
  'hono-50',
  'fastify-50',
  'hono-54',
];

function command(exe, args, cwd = repo, extraEnv = {}, timeout = 24000) {
  const shell = process.platform === 'win32' && exe.toLowerCase().endsWith('.cmd');
  const words = shell ? args.map((v) => (/[\s"]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v)) : args;
  const env = { ...process.env, ...extraEnv, NODE_OPTIONS: '' };
  delete env.npm_config_allow_scripts;
  return spawnSync(exe, words, { cwd, shell, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, env });
}
function ok(result, label) {
  assert.equal(result.error, undefined, label + ' launcher: ' + String(result.error));
  assert.equal(result.status, 0, label + ':\n' + result.stdout + '\n' + result.stderr);
  return result.stdout;
}
function tool(file, args) {
  return ok(command(process.execPath, [file, ...args]), path.basename(file) + ' ' + args.join(' '));
}
function sha(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function gitTip() {
  return ok(command('git', ['rev-parse', 'HEAD']), 'git tip').trim();
}
function manifest(file) {
  const archive = gunzipSync(fs.readFileSync(file));
  for (let offset = 0; offset < archive.length;) {
    const name = archive
      .subarray(offset, offset + 100)
      .toString('utf8')
      .split('\0')[0];
    const size = Number.parseInt(archive.subarray(offset + 124, offset + 136).toString('utf8'), 8) || 0;
    if (name === 'package/package.json') {
      return JSON.parse(archive.subarray(offset + 512, offset + 512 + size).toString('utf8'));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('no packed manifest in ' + file);
}
function readme(adapter) {
  const content = fs.readFileSync(path.join(repo, 'packages/canc-server/canc-server-' + adapter, 'README.md'), 'utf8');
  const begin = content.indexOf('## Compatibility');
  assert.ok(begin >= 0, 'missing Compatibility: ' + adapter);
  const end = content.indexOf('\n## ', begin + 4);
  return content.slice(begin, end >= 0 ? end : undefined);
}
function supportTables() {
  const tsCatalog = fs.readFileSync(typesScript, 'utf8');
  const tuples = {
    node: [
      ['node-floor', '5.9.3', 'Supported'],
      ['node-legacy', '4.2.4', 'Advisory'],
    ],
    express: [
      ['express-floor', '4.18.0', 'Supported'],
      ['express-modern', '5.2.1', 'Supported'],
      ['express-legacy', '4.2.4', 'Advisory'],
    ],
    koa: [
      ['koa-floor', '2.13.0', 'Supported'],
      ['koa-modern', '3.3.0', 'Supported'],
      ['koa-legacy', '4.2.4', 'Advisory'],
    ],
    fastify: [
      ['fastify-floor', '5.0.0', 'Supported'],
      ['fastify-modern', '5.4.5', 'Supported'],
      ['fastify-modern-59', '5.9.3', 'Supported'],
      ['fastify-50', '5.0.4', 'Advisory'],
      ['fastify-legacy', '4.2.4', 'Unsupported'],
    ],
    hono: [
      ['hono-floor', '4.8.0', 'Supported'],
      ['hono-modern', '4.13.16', 'Supported'],
      ['hono-legacy', '4.2.4', 'Advisory'],
      ['hono-50', '5.0.4', 'Advisory'],
      ['hono-54', '5.4.5', 'Advisory'],
    ],
  };
  const expectedRows = {
    node: [
      ['Native `node:http`', 'Node.js 18+', '5.9.3', '20.19.43', 'NodeNext CJS + ESM / false', 'Supported, strict'],
      ['Native `node:http`', 'Node.js 18+', '4.2.4', '18.19.0', 'Node CJS / false', 'Advisory, older toolchain'],
    ],
    express: [
      [
        'Express 4.18.0, `@types/express` 4.17.25',
        'Node.js 18+',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Express 5.2.1, `@types/express` 5.0.6',
        'Compatible Node.js host',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, isolated peer graph',
      ],
      [
        'Express 4.18.0, `@types/express` 4.17.25',
        'Node.js 18+',
        '4.2.4',
        '18.19.0',
        'Node CJS / true',
        'Advisory, strict library checking fails',
      ],
    ],
    koa: [
      [
        'Koa 2.13.0, `@types/koa` 2.15.2',
        'Node.js 18+',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Koa 3.3.0, `@types/koa` 3.0.3',
        'Compatible Node.js host',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, isolated peer graph',
      ],
      [
        'Koa 2.13.0, `@types/koa` 2.15.2',
        'Node.js 18+',
        '4.2.4',
        '18.19.0',
        'Node CJS / true',
        'Advisory, strict library checking fails',
      ],
    ],
    fastify: [
      [
        'Fastify 5.0.0, fastify-plugin 5.0.0',
        'Node.js 22.12+ for tested injection',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Fastify 5.12.8, fastify-plugin 6.0.1',
        'Node.js 22.12+ for tested injection',
        '5.4.5',
        '22.20.5',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Fastify 5.12.8, fastify-plugin 6.0.1',
        'Node.js 22.12+',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Fastify 5.0.0, fastify-plugin 5.0.0',
        'Node.js 22+',
        '5.0.4',
        '18.19.0',
        'Node CJS / true',
        'Advisory, strict library checking fails',
      ],
      [
        'Fastify 5.0.0, fastify-plugin 5.0.0',
        'Node.js 22+',
        '4.2.4',
        '18.19.0',
        'Node CJS / either',
        'Unsupported, framework declaration syntax fails',
      ],
    ],
    hono: [
      [
        'Hono 4.8.0, `@hono/node-server` 1.9.0',
        'Node.js 18.14.1+ with Node-server',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Hono 4.13.16, `@hono/node-server` 1.19.7',
        'Compatible Node.js host with Node-server',
        '5.9.3',
        '20.19.43',
        'NodeNext CJS + ESM / false',
        'Supported, strict',
      ],
      [
        'Hono 4.8.0',
        'Node.js 18+; Node-server optional',
        '4.2.4',
        '18.19.0',
        'Node CJS / true',
        'Advisory, strict library checking fails',
      ],
      [
        'Hono 4.8.0',
        'Compatible Node.js host',
        '5.0.4',
        '18.19.0',
        'Node CJS / false',
        'Advisory, isolated compiler result',
      ],
      [
        'Hono 4.13.16',
        'Compatible Node.js host',
        '5.4.5',
        '20.19.43',
        'Node CJS / true',
        'Advisory, strict library checking fails',
      ],
    ],
  };
  for (const [adapter, cases] of Object.entries(tuples)) {
    const lines = readme(adapter).split(/\r?\n/);
    const rows = lines.filter((line) => line.startsWith('| ') && !line.startsWith('| Framework peers'));
    const data = rows.filter((line) => !/^\|\s*-+/.test(line));
    assert.equal(data.length, cases.length, 'support table row drift ' + adapter);
    for (let i = 0; i < cases.length; i++) {
      const [id] = cases[i];
      const cells = data[i]
        .split('|')
        .slice(1, -1)
        .map((value) => value.trim());
      assert.equal(cells.length, 6, 'malformed table ' + adapter);
      assert.ok(tsCatalog.includes("id: '" + id + "'"), 'missing compiler catalog lane ' + id);
      assert.deepEqual(cells, expectedRows[adapter][i], 'unverified support tuple or status ' + id);
    }
  }
  assert.match(readme('fastify'), /Node\.js 22 or later/);
  assert.match(readme('hono'), /optional peer/i);
  console.log('PASS all five README tables map to 18 pinned compiler cases');
}
function packageName(source) {
  return JSON.parse(fs.readFileSync(path.join(repo, 'packages', source, 'package.json'), 'utf8')).name;
}
function prepare() {
  for (const folder of [tarDir, marks, exampleDir, path.join(owned, 'scripts-on')]) {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder, { recursive: true });
  }
  fs.writeFileSync(path.join(owned, 'empty-npmrc'), '');
  supportTables();
  const files = {};
  for (const source of sources) {
    const folder = path.join(repo, 'packages', source);
    assert.ok(fs.existsSync(path.join(folder, 'dist/index.cjs')), 'unbuilt candidate ' + source);
    const output = ok(
      command(npm, ['pack', '--ignore-scripts', '--pack-destination', tarDir], folder),
      'pack ' + source,
    )
      .trim()
      .split(/\r?\n/)
      .pop();
    const packed = path.join(tarDir, output);
    assert.ok(fs.existsSync(packed));
    const data = manifest(packed);
    assert.equal(data.name, packageName(source));
    assert.equal(data.version, '1.1.0-beta.2');
    files[data.name] = { file: packed, hash: sha(packed), version: data.version };
    console.log('PACK ' + data.name + ' ' + packed + ' sha256=' + files[data.name].hash);
  }
  const fastify = manifest(files['@cancjs/server-fastify'].file);
  assert.equal(fastify.engines.node, '>=22', 'packed Fastify floor');
  const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['packages/canc-server/canc-server-fastify'].engines.node, '>=22');
  const sourceFastify = JSON.parse(
    fs.readFileSync(path.join(repo, 'packages/canc-server/canc-server-fastify/package.json'), 'utf8'),
  );
  assert.equal(sourceFastify.engines.node, '>=22');
  const baseline = JSON.parse(
    ok(command('git', ['show', 'f9f36d78:packages/canc-server/canc-server-fastify/package.json']), 'beta.2 manifest'),
  );
  assert.notEqual(baseline.engines.node, '>=22', 'baseline missing expected engine discrepancy');
  assert.deepEqual(fastify.peerDependencies, baseline.peerDependencies, 'Fastify peer ranges drift');
  const data = { tip: gitTip(), files };
  fs.writeFileSync(path.join(owned, 'prepared.json'), JSON.stringify(data, null, 2));
  console.log('PASS candidate packed engine>=22 / lock / unchanged peers / beta.2 manifest RED');
}
function inventory() {
  const data = JSON.parse(fs.readFileSync(path.join(owned, 'prepared.json'), 'utf8'));
  assert.equal(data.tip, gitTip(), 'candidate tip changed since prepare');
  for (const value of Object.values(data.files)) {
    assert.equal(sha(value.file), value.hash, 'candidate tarball changed');
  }
  return data;
}
function mark(name, detail) {
  const data = inventory();
  fs.mkdirSync(marks, { recursive: true });
  fs.writeFileSync(
    path.join(marks, name + '.json'),
    JSON.stringify(
      {
        name,
        tip: data.tip,
        files: Object.fromEntries(Object.entries(data.files).map(([key, value]) => [key, value.hash])),
        detail,
      },
      null,
      2,
    ),
  );
}
function verified(name) {
  const data = inventory();
  const row = JSON.parse(fs.readFileSync(path.join(marks, name + '.json'), 'utf8'));
  assert.equal(row.name, name);
  assert.equal(row.tip, data.tip, 'stale verified gate ' + name);
  assert.deepEqual(
    row.files,
    Object.fromEntries(Object.entries(data.files).map(([key, value]) => [key, value.hash])),
    'verified different tarballs ' + name,
  );
  return row.detail;
}
function samePacks(external) {
  const data = inventory();
  for (const [name, row] of Object.entries(external)) {
    if (!data.files[name]) continue;
    const file = row.file ?? row.filename;
    assert.equal(sha(file), data.files[name].hash, 'cross-gate pack mismatch ' + name);
  }
  console.log('PASS cross-check same candidate pack checksums');
}
function physical(root, name) {
  const at = path.join(root, 'node_modules', ...name.split('/'));
  const rootReal = fs.realpathSync.native(root).toLowerCase();
  const real = fs.realpathSync.native(at).toLowerCase();
  assert.equal(fs.lstatSync(at).isSymbolicLink(), false, 'workspace symlink ' + name);
  assert.ok(real.startsWith(rootReal + path.sep.toLowerCase()), 'installation escaped physical root ' + name);
  const pkg = JSON.parse(fs.readFileSync(path.join(at, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '1.1.0-beta.2', 'not the packed candidate ' + name);
  for (const rel of ['dist/index.cjs', 'dist/index.mjs', 'dist/types/index.d.ts', 'dist/types/index.d.mts']) {
    const file = path.join(at, rel);
    assert.ok(fs.existsSync(file), 'missing physical output ' + file);
    assert.ok(fs.realpathSync.native(file).toLowerCase().startsWith(real), 'escaped declaration ' + rel);
  }
  const req = createRequire(path.join(root, 'package.json'));
  const resolved = req.resolve(name);
  assert.ok(fs.realpathSync.native(resolved).toLowerCase().startsWith(real), 'CJS resolved outside physical copy');
  return pkg;
}
function guardEnv(node, cli, root, args, withScripts) {
  const env = { npm_config_userconfig: path.join(owned, 'empty-npmrc') };
  return ok(
    command(
      node,
      [cli, ...args, '--engine-strict', '--no-audit', '--no-fund', ...(withScripts ? [] : ['--ignore-scripts'])],
      root,
      env,
    ),
    'strict npm ' + args[0],
  );
}

const HOST_PROBE =
  "import assert from 'node:assert/strict';\nimport http from 'node:http';\nimport path from 'node:path';\nimport { createRequire } from 'node:module';\nconst require = createRequire(path.join(process.env.ROOT,'package.json'));\nconst fastify = require('fastify');\nconst { cancelPlugin, cancelableHandler } = require('@cancjs/server-fastify');\nconst app = fastify();\nconst watchdog = setTimeout(() => { console.error('HOST_TIMEOUT'); process.exit(3); }, 8000);\ntry {\n  await app.register(cancelPlugin);\n  app.get('/probe', cancelableHandler(function* () { return { ok: true }; }));\n  const listen = await app.listen({ host: '127.0.0.1', port: 0 });\n  const response = await new Promise((resolve, reject) => {\n    http.get(new URL('/probe', listen), (res) => {\n      let body = '';\n      res.setEncoding('utf8');\n      res.on('data', (chunk) => { body += chunk; });\n      res.on('end', () => resolve({ status: res.statusCode, body }));\n    }).on('error', reject);\n  });\n  assert.equal(response.status, 200);\n  assert.equal(response.body, '{\"ok\":true}');\n  const injected = await app.inject({ method: 'GET', url: '/probe' });\n  assert.equal(injected.statusCode, 200);\n  assert.equal(injected.body, '{\"ok\":true}');\n  console.log('PASS strict Fastify socket200 and inject200');\n} finally {\n  await app.close();\n  clearTimeout(watchdog);\n}\n";

function hostPrepare() {
  inventory();
  console.log(tool(hostScript, ['--prepare', '--already-built']));
  const external = JSON.parse(fs.readFileSync(path.join(hostDir, 'prepared.json'), 'utf8'));
  assert.equal(external.gitHead, gitTip());
  const lookup = Object.fromEntries(Object.entries(external.packed).map(([key, value]) => [packageName(key), value]));
  samePacks(lookup);
  mark('host-prepare', { cases: hostLanes.length });
}
function hostLane(name) {
  assert.ok(hostLanes.includes(name), 'unknown host lane ' + name);
  verified('host-prepare');
  const log = tool(hostScript, ['--lane', name]);
  const record = JSON.parse(fs.readFileSync(path.join(hostDir, 'marks', name + '.json'), 'utf8'));
  assert.equal(record.gitHead, gitTip(), 'host marker stale ' + name);
  assert.equal(record.name, name);
  assert.ok(record.record.hostStatus);
  mark('host-' + name, { hostStatus: record.record.hostStatus });
  console.log(
    log
      .split(/\r?\n/)
      .filter((v) => v.startsWith('PASS') || v.startsWith('GRAPH') || v.startsWith('INJECT'))
      .join('\n'),
  );
}
function hostSummary() {
  for (const name of hostLanes) verified('host-' + name);
  const output = tool(hostScript, ['--summary']);
  assert.ok(output.includes('PASS all ' + hostLanes.length + ' pinned physical host lanes'));
  console.log(output);
  mark('host-summary', { lanes: hostLanes.length });
}
function compilerPrepare() {
  inventory();
  console.log(tool(typesScript, ['--prepare']));
  const data = JSON.parse(fs.readFileSync(path.join(typesDir, 'prepared.json'), 'utf8'));
  assert.equal(data.hash, gitTip());
  samePacks(data.packed);
  mark('compiler-prepare', { lanes: typeLanes.length });
}
function compilerInstall(name) {
  assert.ok(typeLanes.includes(name), 'unknown compiler lane ' + name);
  verified('compiler-prepare');
  console.log(tool(typesScript, ['--install', name]));
  const root = path.join(typesDir, 'consumers', name);
  const adapter = name.split('-')[0];
  physical(root, '@cancjs/server-' + adapter);
  physical(root, '@cancjs/promise');
  physical(root, '@cancjs/coroutine');
}
function compilerCheck(name) {
  assert.ok(typeLanes.includes(name), 'unknown compiler lane ' + name);
  verified('compiler-prepare');
  console.log(tool(typesScript, ['--check', name]));
  const record = JSON.parse(fs.readFileSync(path.join(typesDir, 'marks', name + '.json'), 'utf8'));
  assert.equal(record.tip, gitTip());
  assert.equal(record.id, name);
  mark('compiler-' + name, { detail: record.result });
}
function compilerSummary() {
  for (const name of typeLanes) verified('compiler-' + name);
  const log = tool(typesScript, ['--summary']);
  assert.ok(log.includes('PASS all 18 installed server compiler combinations'));
  console.log(log);
  mark('compiler-summary', { lanes: typeLanes.length });
}
function strictNode22() {
  const folder = path.join(hostDir, 'toolchains');
  const node = path.join(folder, 'node-22.12.0', 'node_modules', 'node-win-x64', 'bin', 'node.exe');
  const cli = path.join(folder, 'npm-10.9.4', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  assert.ok(fs.existsSync(node) && fs.existsSync(cli), 'run host Node22.12 lane first');
  assert.equal(ok(command(node, ['--version']), 'Node22.12 version').trim(), 'v22.12.0');
  assert.equal(ok(command(node, [cli, '--version']), 'npm10 version').trim(), '10.9.4');
  return { node, cli };
}
function strictScripts22(kind) {
  assert.ok(['floor', 'modern'].includes(kind));
  verified('host-summary');
  const toolchain = strictNode22();
  const base = path.join(owned, 'scripts-on', kind);
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  const peers = kind === 'floor' ? ['5.0.0', '5.0.0'] : ['5.12.8', '6.0.1'];
  const deps = inventory().files;
  const dependencyMap = Object.fromEntries(
    ['@cancjs/promise', '@cancjs/coroutine', '@cancjs/server-fastify'].map((name) => [name, deps[name].file]),
  );
  const packageJSON = {
    name: 'p105c-node22-12-' + kind,
    version: '0.0.0',
    private: true,
    dependencies: { ...dependencyMap, fastify: peers[0], 'fastify-plugin': peers[1] },
  };
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify(packageJSON, null, 2));
  guardEnv(toolchain.node, toolchain.cli, base, ['install', '--package-lock-only'], false);
  const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json'), 'utf8'));
  for (const [key, value] of Object.entries(dependencyMap)) {
    assert.equal(lock.packages[''].dependencies[key], value);
  }
  guardEnv(toolchain.node, toolchain.cli, base, ['ci'], true);
  const installed = physical(base, '@cancjs/server-fastify');
  assert.equal(installed.engines.node, '>=22');
  physical(base, '@cancjs/promise');
  physical(base, '@cancjs/coroutine');
  const hostOutput = ok(
    command(toolchain.node, ['--input-type=module', '--eval', HOST_PROBE], base, { ROOT: base }),
    'Node22.12 ' + kind + ' scripts-on socket/inject',
  );
  assert.match(hostOutput, /PASS strict Fastify socket200 and inject200/);
  const installedGraph = Object.fromEntries(
    ['fastify', 'fastify-plugin', 'light-my-request', 'cookie'].map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(base, 'node_modules', name, 'package.json'))).version,
    ]),
  );
  console.log(
    'PASS Node22.12 ' + kind + ' strict scripts-on npm ci + socket200 + inject200 ' + JSON.stringify(installedGraph),
  );
  mark('scripts22-' + kind, {
    node: '22.12.0',
    npm: '10.9.4',
    strict: true,
    scriptsOn: true,
    socket200: true,
    inject200: true,
    installedGraph,
  });
}

const EXAMPLE_PROBE =
  "const assert = require('node:assert/strict');\nconst FakeTimers = require('@sinonjs/fake-timers');\nconst { createMockApi } = require('./app/mock-api.cjs');\nconst { isCancelError, isTimeoutError } = require('@cancjs/promise');\nconst inventory = require('./app/' + (process.env.INVENTORY_FILE || 'inventory-timeout-canc.cjs'));\nconst vanillaInventory = require('./app/inventory-timeout-vanilla.cjs');\nconst payment = require('./app/' + (process.env.PAYMENT_FILE || 'retry-payment-canc.cjs'));\nconst vanillaPayment = require('./app/retry-payment-vanilla.cjs');\nconst settings = (latency) => ({ seedMode: false, latency, jitter: 0 });\nconst capture = (value) => Promise.resolve(value).then((v) => ({ value: v }), (error) => ({ error }));\nasync function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }\nasync function clocked(fn) {\n  const clock = FakeTimers.install({ now: 0, toFake: ['Date', 'setTimeout', 'clearTimeout'] });\n  try { await fn(clock); } finally { clock.uninstall(); }\n}\nasync function inventoryTest() {\n  await clocked(async (clock) => {\n    const canc = createMockApi(settings(630));\n    const plain = createMockApi(settings(630));\n    const manual = createMockApi(settings(630));\n    const task = capture(inventory.fetchInventoryWithTimeout(canc.inventory, 'product-1'));\n    const vanilla = capture(vanillaInventory.fetchInventoryWithTimeout(plain.inventory, 'product-1'));\n    const explicit = capture(vanillaInventory.fetchInventoryWithTimeoutAbortable(manual.inventory, 'product-1'));\n    await flush();\n    assert.deepEqual(canc.api.calls.map((x) => x.status), ['started']);\n    await clock.tickAsync(500);\n    assert.ok(isTimeoutError((await task).error), 'missing TimeoutError');\n    assert.equal((await vanilla).error.message, 'timeout');\n    assert.equal((await explicit).error.message, 'timeout');\n    assert.equal(canc.api.calls[0].status, 'aborted', 'inventory native request not aborted');\n    assert.equal(manual.api.calls[0].status, 'aborted');\n    assert.equal(plain.api.calls[0].status, 'started');\n    await clock.tickAsync(500);\n    assert.deepEqual(canc.api.calls.map((x) => x.status), ['aborted']);\n    assert.deepEqual(plain.api.calls.map((x) => x.status), ['completed']);\n    assert.deepEqual(manual.api.calls.map((x) => x.status), ['aborted']);\n  });\n  console.log('PASS demo inventory aborted at deadline500, vanilla completed, manual aborted');\n}\nasync function paymentTest() {\n  await clocked(async (clock) => {\n    const canc = createMockApi(settings(160));\n    const plain = createMockApi(settings(160));\n    const manual = createMockApi(settings(160));\n    const task = payment.chargeWithRetry(canc.payments, 'payment-1');\n    const p = capture(task);\n    const v = capture(vanillaPayment.chargeWithRetry(plain.payments, 'payment-1'));\n    const hand = vanillaPayment.chargeWithRetryAbortable(manual.payments, 'payment-1');\n    const m = capture(hand.promise);\n    await flush();\n    assert.deepEqual(canc.api.calls.map((x) => x.status), ['started']);\n    await clock.tickAsync(25);\n    task.cancel();\n    hand.cancel();\n    assert.ok(isCancelError((await p).error));\n    assert.equal((await m).error.message, 'Canceled by client');\n    assert.equal(canc.api.calls[0].status, 'aborted', 'payment native request not aborted');\n    assert.equal(manual.api.calls[0].status, 'aborted');\n    assert.equal(plain.api.calls[0].status, 'started');\n    await clock.tickAsync(500);\n    assert.match((await v).value, /^txn-payment-1-/);\n    assert.equal(plain.api.calls[0].status, 'completed');\n    assert.equal(canc.api.calls.length, 1);\n    assert.equal(manual.api.calls.length, 1);\n  });\n  console.log('PASS demo active payment aborted at t25, vanilla completed, manual aborted');\n}\nasync function backoffTest() {\n  await clocked(async (clock) => {\n    const canc = createMockApi(settings(0));\n    const manual = createMockApi(settings(0));\n    const task = payment.chargeWithRetry(canc.payments, 'payment-2');\n    const p = capture(task);\n    const hand = vanillaPayment.chargeWithRetryAbortable(manual.payments, 'payment-2');\n    const m = capture(hand.promise);\n    await clock.tickAsync(0);\n    await flush();\n    assert.equal(canc.api.calls.length, 1);\n    assert.equal(manual.api.calls.length, 1);\n    assert.equal(canc.api.calls[0].status, 'failed');\n    assert.equal(manual.api.calls[0].status, 'failed');\n    await clock.tickAsync(50);\n    task.cancel();\n    hand.cancel();\n    assert.ok(isCancelError((await p).error));\n    assert.equal((await m).error.message, 'Canceled by client');\n    await clock.tickAsync(1000);\n    assert.equal(canc.api.calls.length, 1, 'post-cancel native payment attempt');\n    assert.equal(manual.api.calls.length, 1);\n  });\n  console.log('PASS demo canceled backoff leaves one native charge attempt');\n}\nasync function vanillaSuccess() {\n  await clocked(async (clock) => {\n    const api = createMockApi(settings(160));\n    const result = capture(vanillaPayment.chargeWithRetry(api.payments, 'payment-1'));\n    await clock.tickAsync(160);\n    assert.match((await result).value, /^txn-payment-1-/);\n    assert.equal(api.api.calls[0].status, 'completed');\n  });\n  console.log('PASS demo vanilla un-canceled payment completes');\n}\nasync function main() {\n  const name = process.env.TEST_CASE || 'all';\n  if (name === 'all' || name === 'inventory') await inventoryTest();\n  if (name === 'all' || name === 'payment') await paymentTest();\n  if (name === 'all' || name === 'backoff') await backoffTest();\n  if (name === 'all' || name === 'success') await vanillaSuccess();\n}\nmain().catch((error) => { console.error(error); process.exitCode = 1; });\n";
const demoSources = [
  'inventory-timeout-canc',
  'inventory-timeout-vanilla',
  'retry-payment-canc',
  'retry-payment-vanilla',
];
function compileDemo(builder, name, outputName, override) {
  const file = path.join(repo, 'examples', 'demo-toolbox', 'src', name + '.ts');
  const out = path.join(exampleDir, 'app', outputName + '.cjs');
  const result = builder.buildSync({
    ...(override === undefined ?
      { entryPoints: [file] }
    : { stdin: { contents: override, loader: 'ts', resolveDir: path.dirname(file), sourcefile: file } }),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['@cancjs/*'],
    write: false,
    logLevel: 'silent',
  });
  assert.equal(result.outputFiles.length, 1);
  fs.writeFileSync(out, result.outputFiles[0].contents);
  return out;
}
function examplePrepare() {
  const artifacts = inventory().files;
  fs.rmSync(exampleDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(exampleDir, 'app'), { recursive: true });
  const dependencies = Object.fromEntries(
    ['@cancjs/promise', '@cancjs/coroutine', '@cancjs/toolbox'].map((key) => [key, artifacts[key].file]),
  );
  dependencies['@sinonjs/fake-timers'] = '15.4.0';
  fs.writeFileSync(
    path.join(exampleDir, 'package.json'),
    JSON.stringify(
      {
        name: 'p105c-example-installed',
        version: '0.0.0',
        private: true,
        dependencies,
      },
      null,
      2,
    ),
  );
  const env = { npm_config_userconfig: path.join(owned, 'empty-npmrc') };
  ok(
    command(
      npm,
      ['install', '--package-lock-only', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund'],
      exampleDir,
      env,
    ),
    'example pinned lock',
  );
  ok(
    command(npm, ['ci', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund'], exampleDir, env),
    'example isolated npm ci',
  );
  for (const name of ['@cancjs/promise', '@cancjs/coroutine', '@cancjs/toolbox']) {
    physical(exampleDir, name);
  }
  const req = createRequire(path.join(repo, 'examples', 'package.json'));
  const esbuild = req('esbuild');
  const source = path.join(repo, 'examples', '_shared', 'mock-api', 'src', 'index.ts');
  const bundled = esbuild.buildSync({
    entryPoints: [source],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['@cancjs/*'],
    logLevel: 'silent',
    write: false,
    alias: { '@shared/util': path.join(repo, 'examples', '_shared', 'util', 'src', 'index.ts') },
  });
  assert.equal(bundled.outputFiles.length, 1);
  fs.writeFileSync(path.join(exampleDir, 'app', 'mock-api.cjs'), bundled.outputFiles[0].contents);
  for (const name of demoSources) compileDemo(esbuild, name, name);
  fs.writeFileSync(path.join(exampleDir, 'probe.cjs'), EXAMPLE_PROBE);
  const output = ok(command(process.execPath, ['probe.cjs'], exampleDir), 'installed example transport');
  assert.match(output, /PASS demo inventory aborted/);
  assert.match(output, /PASS demo active payment aborted/);
  assert.match(output, /PASS demo canceled backoff/);
  assert.match(output, /PASS demo vanilla un-canceled/);
  console.log(output.trim());
  fs.writeFileSync(
    path.join(exampleDir, 'installed.json'),
    JSON.stringify(
      {
        sourceHash: Object.fromEntries(
          demoSources.map((name) => [name, sha(path.join(repo, 'examples/demo-toolbox/src', name + '.ts'))]),
        ),
        bundleSha: sha(path.join(exampleDir, 'app/mock-api.cjs')),
      },
      null,
      2,
    ),
  );
  mark('example', { actualStatuses: true, strictInstall: true, independentToolboxTarball: true });
}
function exampleMutation() {
  verified('example');
  const original = JSON.parse(fs.readFileSync(path.join(exampleDir, 'installed.json'), 'utf8'));
  for (const [name, hash] of Object.entries(original.sourceHash)) {
    assert.equal(
      sha(path.join(repo, 'examples/demo-toolbox/src', name + '.ts')),
      hash,
      'example source changed since installed',
    );
  }
  const req = createRequire(path.join(repo, 'examples', 'package.json'));
  const esbuild = req('esbuild');
  const sourceFile = (name) => path.join(repo, 'examples/demo-toolbox/src', name + '.ts');
  function mutant(name, match, replacement, output, test, diagnostic) {
    const source = fs.readFileSync(sourceFile(name), 'utf8');
    assert.ok(source.includes(match), 'mutant anchor missing ' + name);
    compileDemo(esbuild, name, output, source.replace(match, replacement));
    const extra =
      name.startsWith('inventory') ? { INVENTORY_FILE: output + '.cjs' } : { PAYMENT_FILE: output + '.cjs' };
    const result = command(process.execPath, ['probe.cjs'], exampleDir, { TEST_CASE: test, ...extra });
    assert.notEqual(result.status, 0, 'candidate mutation escaped ' + output);
    assert.match(result.stderr + result.stdout, diagnostic);
    console.log('PASS mutant ' + output + ' RED: ' + diagnostic.source);
    fs.rmSync(path.join(exampleDir, 'app', output + '.cjs'), { force: true });
  }
  mutant(
    'inventory-timeout-canc',
    'inventoryApi.check(id, getSignal())',
    'inventoryApi.check(id)',
    'inventory-no-signal',
    'inventory',
    /inventory native request not aborted/,
  );
  mutant(
    'retry-payment-canc',
    'paymentsApi.charge(id, getSignal())',
    'paymentsApi.charge(id)',
    'payment-no-signal',
    'payment',
    /payment native request not aborted/,
  );
  const retryLine = '  return retry(() => charge(paymentId), { retries: 3, initialDelay: 100, factor: 2 });';
  const repeated =
    '  setTimeout(() => { paymentsApi.charge(paymentId).then(() => undefined, () => undefined); }, 100);\n\n' +
    retryLine;
  mutant(
    'retry-payment-canc',
    retryLine,
    repeated,
    'payment-after-cancel',
    'backoff',
    /post-cancel native payment attempt/,
  );
  for (const name of ['inventory-timeout-canc', 'retry-payment-canc']) {
    const baseline = ok(
      command('git', ['show', 'f9f36d78:examples/demo-toolbox/src/' + name + '.ts']),
      'published beta.2 ' + name,
    );
    compileDemo(esbuild, name, name + '-beta2', baseline);
  }
  for (const [test, extra, diagnostic] of [
    ['inventory', { INVENTORY_FILE: 'inventory-timeout-canc-beta2.cjs' }, /inventory native request not aborted/],
    ['payment', { PAYMENT_FILE: 'retry-payment-canc-beta2.cjs' }, /payment native request not aborted/],
  ]) {
    const failed = command(process.execPath, ['probe.cjs'], exampleDir, { TEST_CASE: test, ...extra });
    assert.notEqual(failed.status, 0, 'beta.2 source unexpectedly passes ' + test);
    assert.match(failed.stderr + failed.stdout, diagnostic);
    console.log('PASS published beta.2 ' + test + ' RED');
  }
  const output = ok(command(process.execPath, ['probe.cjs'], exampleDir), 'candidate restored example transport');
  assert.match(output, /PASS demo canceled backoff/);
  console.log('PASS candidate installed examples restored green');
  mark('example-mutations', { mutants: 3, baselineRed: 2 });
}
function summary() {
  const data = inventory();
  supportTables();
  for (const name of [
    'host-summary',
    'compiler-summary',
    'scripts22-floor',
    'scripts22-modern',
    'example',
    'example-mutations',
  ])
    verified(name);
  for (const kind of ['floor', 'modern']) {
    const value = verified('scripts22-' + kind);
    assert.equal(value.node, '22.12.0');
    assert.equal(value.scriptsOn, true);
    assert.equal(value.socket200, true);
    assert.equal(value.inject200, true);
  }
  assert.equal(verified('host-summary').lanes, 12);
  assert.equal(verified('compiler-summary').lanes, 18);
  assert.equal(verified('example-mutations').mutants, 3);
  console.log('PASS Fastify Node22 strict socket');
  console.log('PASS Fastify Node22.12 inject');
  console.log('PASS Fastify Node22.0 strict npm ci scripts-on + socket');
  console.log('PASS Fastify Node22.12 strict npm ci scripts-on + socket/inject');
  console.log('PASS Hono optional Web Node18');
  console.log('PASS five strict adapter type tuples (18 installed compiler combinations)');
  console.log('PASS demo inventory/payment aborted (native transport, plain and manual vanilla controls)');
  console.log('PASS beta.2 engine and transport RED, three installed copy mutants RED');
  console.log('PASS P105c integrated installed support and examples ' + data.tip);
}
function all() {
  prepare();
  hostPrepare();
  for (const name of hostLanes) hostLane(name);
  hostSummary();
  compilerPrepare();
  for (const name of typeLanes) {
    compilerInstall(name);
    compilerCheck(name);
  }
  compilerSummary();
  strictScripts22('floor');
  strictScripts22('modern');
  examplePrepare();
  exampleMutation();
  summary();
}
try {
  if (has('--prepare')) prepare();
  else if (has('--check-docs')) supportTables();
  else if (has('--host-prepare')) hostPrepare();
  else if (arg('--host-lane')) hostLane(arg('--host-lane'));
  else if (has('--host-summary')) hostSummary();
  else if (has('--compiler-prepare')) compilerPrepare();
  else if (arg('--compiler-install')) compilerInstall(arg('--compiler-install'));
  else if (arg('--compiler-check')) compilerCheck(arg('--compiler-check'));
  else if (has('--compiler-summary')) compilerSummary();
  else if (arg('--scripts22')) strictScripts22(arg('--scripts22'));
  else if (has('--example')) examplePrepare();
  else if (has('--example-mutations')) exampleMutation();
  else if (has('--summary')) summary();
  else all();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
