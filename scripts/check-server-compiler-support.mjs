#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owned = path.join(os.tmpdir(), 'canc', 'p105c-server-types');
const tarDir = path.join(owned, 'tar');
const consumers = path.join(owned, 'consumers');
const marks = path.join(owned, 'marks');
const argumentsList = process.argv.slice(2);
const has = (name) => argumentsList.includes(name);
const value = (name) => {
  const index = argumentsList.indexOf(name);
  return index < 0 ? undefined : argumentsList[index + 1];
};
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packages = [
  'canc-promise',
  'canc-coroutine',
  ...['node', 'express', 'koa', 'fastify', 'hono'].map((name) => 'canc-server/canc-server-' + name),
];
const base = { typescript: '5.9.3', '@types/node': '20.19.43' };
const peerSets = {
  node: {},
  express: { express: '4.18.0', '@types/express': '4.17.25' },
  koa: { koa: '2.13.0', '@types/koa': '2.15.2' },
  fastify: { fastify: '5.0.0', 'fastify-plugin': '5.0.0' },
  hono: { hono: '4.8.0', '@hono/node-server': '1.9.0' },
};
const cases = [
  { id: 'node-floor', adapter: 'node', official: true },
  { id: 'express-floor', adapter: 'express', official: true },
  { id: 'koa-floor', adapter: 'koa', official: true },
  { id: 'fastify-floor', adapter: 'fastify', official: true },
  { id: 'hono-floor', adapter: 'hono', official: true },
  { id: 'express-modern', adapter: 'express', official: true, peers: { express: '5.2.1', '@types/express': '5.0.6' } },
  { id: 'koa-modern', adapter: 'koa', official: true, peers: { koa: '3.3.0', '@types/koa': '3.0.3' } },
  {
    id: 'fastify-modern',
    adapter: 'fastify',
    official: true,
    ts: '5.4.5',
    nodeTypes: '22.20.5',
    peers: { fastify: '5.12.8', 'fastify-plugin': '6.0.1' },
  },
  {
    id: 'fastify-modern-59',
    adapter: 'fastify',
    official: true,
    peers: { fastify: '5.12.8', 'fastify-plugin': '6.0.1' },
  },
  { id: 'hono-modern', adapter: 'hono', official: true, peers: { hono: '4.13.16', '@hono/node-server': '1.19.7' } },
  { id: 'node-legacy', adapter: 'node', ts: '4.2.4', nodeTypes: '18.19.0', expect: 'pass' },
  { id: 'express-legacy', adapter: 'express', ts: '4.2.4', nodeTypes: '18.19.0', expect: 'skip', diagnostic: 'TS1337' },
  { id: 'koa-legacy', adapter: 'koa', ts: '4.2.4', nodeTypes: '18.19.0', expect: 'skip', diagnostic: 'TS1337|TS1023' },
  {
    id: 'hono-legacy',
    adapter: 'hono',
    ts: '4.2.4',
    nodeTypes: '18.19.0',
    expect: 'skip',
    diagnostic: 'TS2380|TS1023',
  },
  {
    id: 'fastify-legacy',
    adapter: 'fastify',
    ts: '4.2.4',
    nodeTypes: '18.19.0',
    expect: 'unsupported',
    diagnostic: 'TS1139',
  },
  { id: 'hono-50', adapter: 'hono', ts: '5.0.4', nodeTypes: '18.19.0', expect: 'pass' },
  { id: 'fastify-50', adapter: 'fastify', ts: '5.0.4', nodeTypes: '18.19.0', expect: 'skip', diagnostic: 'TS2304' },
  {
    id: 'hono-54',
    adapter: 'hono',
    ts: '5.4.5',
    nodeTypes: '20.19.43',
    expect: 'skip',
    diagnostic: 'TS2315',
    peers: { hono: '4.13.16', '@hono/node-server': '1.19.7' },
  },
];

function run(executable, argv, cwd) {
  const shell = process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd');
  const shellArgs = shell ? argv.map((a) => (/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a)) : argv;
  const env = { ...process.env, NODE_OPTIONS: '', npm_config_userconfig: path.join(owned, 'empty-npmrc') };
  delete env.npm_config_allow_scripts;
  return spawnSync(executable, shellArgs, {
    cwd,
    shell,
    env,
    encoding: 'utf8',
    timeout: 24000,
    maxBuffer: 16 * 1024 * 1024,
  });
}
function ok(result, reason) {
  assert.equal(result.error, undefined, reason + ': ' + String(result.error));
  assert.equal(result.status, 0, reason + ':\n' + result.stdout + '\n' + result.stderr);
  return result.stdout;
}
function candidateNames(name) {
  return name.startsWith('canc-server/') ? '@cancjs/server-' + name.split('-').pop() : '@cancjs/' + name.slice(5);
}
function archiveEntry(name) {
  return name.startsWith('canc-server/') ? name : name;
}
function readme(name) {
  const filename = path.join(repo, 'packages/canc-server/canc-server-' + name + '/README.md');
  const content = fs.readFileSync(filename, 'utf8');
  const start = content.indexOf('## Compatibility');
  assert.ok(start >= 0, 'missing Compatibility ' + name);
  const end = content.indexOf('\n## ', start + 3);
  return content.slice(start, end < 0 ? undefined : end);
}
function checkDocs() {
  const expected = {
    node: ['5.9.3', '20.19.43', '4.2.4', '18.19.0'],
    express: ['4.18.0', '4.17.25', '5.2.1', '5.0.6', '4.2.4'],
    koa: ['2.13.0', '2.15.2', '3.3.0', '3.0.3', '4.2.4'],
    fastify: ['5.0.0', '5.12.8', '22.12', '5.4.5', '5.0.4', '4.2.4', 'Unsupported'],
    hono: ['4.8.0', '4.13.16', '1.9.0', '1.19.7', '4.2.4', '5.0.4', '5.4.5', 'optional'],
  };
  for (const [name, fragments] of Object.entries(expected)) {
    const text = readme(name);
    const normalized = text.toLowerCase();
    assert.ok(
      text.includes(
        '| Framework peers | Node host and optional peers | TypeScript | @types/node | Resolver / skipLibCheck | Status |',
      ),
      name + ' missing support table',
    );
    for (const part of [...fragments, 'NodeNext CJS + ESM / false', 'Supported', 'Advisory']) {
      assert.ok(normalized.includes(part.toLowerCase()), name + ' missing verified support tuple ' + part);
    }
    assert.ok(!/TypeScript 4\.2 and later\./.test(text), name + ' has unqualified TypeScript floor');
    const rows = text.split(/\r?\n/).filter((line) => line.startsWith('| ') && !line.startsWith('|---'));
    assert.ok(rows.length >= 3, 'insufficient support cases ' + name);
    assert.ok(
      rows.every((line) => line.split('|').length === 8),
      'malformed support table ' + name,
    );
  }
  assert.match(readme('fastify'), /Node\.js 22 or later/i);
  assert.match(readme('hono'), /Node-server peer.*optional|optional peer/i);
  console.log('PASS five adapter support tables');
}
function packageFile(name) {
  return path.join(repo, 'packages', archiveEntry(name));
}
function prepare() {
  fs.mkdirSync(owned, { recursive: true });
  for (const directory of [tarDir, consumers, marks]) fs.rmSync(directory, { recursive: true, force: true });
  for (const directory of [tarDir, consumers, marks]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(owned, 'empty-npmrc'), '');
  const packed = {};
  for (const name of packages) {
    assert.ok(fs.existsSync(path.join(packageFile(name), 'dist', 'index.cjs')), 'build required: ' + name);
    const output = ok(
      run(npm, ['pack', '--ignore-scripts', '--pack-destination', tarDir], packageFile(name)),
      'pack ' + name,
    )
      .trim()
      .split(/\r?\n/)
      .pop();
    const filename = path.join(tarDir, output);
    assert.ok(fs.existsSync(filename), 'packed artifact missing ' + filename);
    packed[candidateNames(name)] = {
      file: filename,
      hash: createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
    };
    console.log('PACK ' + name + ' ' + filename);
  }
  const hash = ok(run('git', ['rev-parse', 'HEAD'], repo), 'git tip').trim();
  fs.writeFileSync(path.join(owned, 'prepared.json'), JSON.stringify({ hash, packed }, null, 2));
  console.log('PASS packed candidate all seven packages ' + hash);
}
function ready() {
  const info = JSON.parse(fs.readFileSync(path.join(owned, 'prepared.json'), 'utf8'));
  assert.equal(ok(run('git', ['rev-parse', 'HEAD'], repo), 'git tip').trim(), info.hash, 'candidate tip changed');
  for (const packed of Object.values(info.packed)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(packed.file)).digest('hex'), packed.hash);
  }
  return info;
}
function definition(id) {
  const spec = cases.find((c) => c.id === id);
  assert.ok(spec, 'unknown lane ' + id);
  return spec;
}
function fixtureDir(id) {
  return path.join(consumers, id);
}
function dependencies(spec, info) {
  const own = {
    '@cancjs/promise': info.packed['@cancjs/promise'].file,
    '@cancjs/coroutine': info.packed['@cancjs/coroutine'].file,
  };
  own['@cancjs/server-' + spec.adapter] = info.packed['@cancjs/server-' + spec.adapter].file;
  return {
    ...base,
    ...own,
    ...peerSets[spec.adapter],
    ...spec.peers,
    typescript: spec.ts ?? base.typescript,
    '@types/node': spec.nodeTypes ?? base['@types/node'],
  };
}
function install(id) {
  const info = ready();
  const spec = definition(id);
  const dir = fixtureDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'server-types-' + id,
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: dependencies(spec, info),
      },
      null,
      2,
    ),
  );
  ok(
    run(npm, ['install', '--package-lock-only', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund'], dir),
    'lock ' + id,
  );
  ok(run(npm, ['ci', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund'], dir), 'ci ' + id);
  for (const name of ['promise', 'coroutine', 'server-' + spec.adapter]) {
    const root = path.join(dir, 'node_modules', '@cancjs', name);
    assert.ok(fs.existsSync(root), 'missing physical package ' + root);
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false, 'workspace symlink ' + root);
    assert.ok(
      fs.realpathSync.native(root).toLowerCase().startsWith(fs.realpathSync.native(dir).toLowerCase()),
      'installed package escaped its consumer root',
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, '1.1.0-beta.2');
  }
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'node_modules/typescript/package.json'))).version,
    spec.ts ?? '5.9.3',
  );
  fs.writeFileSync(path.join(dir, '.installed.json'), JSON.stringify({ tip: info.hash, id, packed: info.packed }));
  console.log('PASS installed ' + id + ' physical packed candidate, TypeScript ' + (spec.ts ?? '5.9.3'));
}
function installed(id) {
  const info = ready();
  const dir = fixtureDir(id);
  const marker = JSON.parse(fs.readFileSync(path.join(dir, '.installed.json'), 'utf8'));
  assert.equal(marker.tip, info.hash, 'stale installed ' + id);
  assert.deepEqual(marker.packed, info.packed, 'installed different candidate tarballs');
  return dir;
}
function config(dir, ts, skipLibCheck, files) {
  const modern = Number.parseInt(ts.split('.')[0], 10) >= 5;
  const full = modern && files.some((name) => name.endsWith('.mts'));
  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck,
          esModuleInterop: true,
          target: 'ES2020',
          module: full ? 'NodeNext' : 'CommonJS',
          moduleResolution: full ? 'NodeNext' : 'Node',
          types: ['node'],
          forceConsistentCasingInFileNames: true,
        },
        files,
      },
      null,
      2,
    ),
  );
}
function typecheck(dir, trace = false) {
  const args = [path.join(dir, 'node_modules/typescript/lib/tsc.js'), '--project', 'tsconfig.json'];
  if (trace) args.push('--traceResolution');
  return run(process.execPath, args, dir);
}
function fullCase(spec, dir) {
  const original = fs.readFileSync(
    path.join(repo, 'tests-types/fixtures/common', 'server-' + spec.adapter + '-types.ts'),
    'utf8',
  );
  const files = ['sample.cts', 'sample.mts'];
  for (const f of files) fs.writeFileSync(path.join(dir, f), original);
  config(dir, spec.ts ?? '5.9.3', false, files);
  const result = typecheck(dir, true);
  const output = ok(result, 'strict CJS+ESM ' + spec.id);
  const typesPath = path.join(dir, 'node_modules', '@cancjs', 'server-' + spec.adapter, 'dist', 'types');
  for (const suffix of ['index.d.ts', 'index.d.mts']) {
    const target = path.join(typesPath, suffix);
    assert.ok(fs.existsSync(target), 'declaration format missing: ' + target);
    assert.ok(
      output.toLowerCase().includes(target.toLowerCase().replace(/\\/g, '/')) ||
        output.toLowerCase().includes(target.toLowerCase()),
      'not resolved installed ' + target,
    );
  }
  const guard = /[ \t]*\/\/ @ts-expect-error[^\r\n]*\r?\n/;
  assert.ok(guard.test(original), 'missing wrong-type negative for ' + spec.id);
  try {
    fs.writeFileSync(path.join(dir, 'sample.mts'), original.replace(guard, '\n'));
    const negative = typecheck(dir);
    assert.notEqual(negative.status, 0, 'removed expected error unexpectedly compiled ' + spec.id);
    assert.match(negative.stdout + negative.stderr, /TS2345/, 'wrong-type diagnostic not raised ' + spec.id);
    console.log('PASS expected-error mutant TS2345 ' + spec.id);
  } finally {
    fs.writeFileSync(path.join(dir, 'sample.mts'), original);
  }
  ok(typecheck(dir), 'restored strict ' + spec.id);
  console.log('PASS installed strict CJS+ESM ' + spec.id + ' TS' + (spec.ts ?? '5.9.3'));
}
function legacyCase(spec, dir) {
  const sample =
    "import { cancelableHandler } from '@cancjs/server-" + spec.adapter + "';\nvoid cancelableHandler;\nexport {};\n";
  fs.writeFileSync(path.join(dir, 'sample.ts'), sample);
  const ts = spec.ts;
  config(dir, ts, false, ['sample.ts']);
  const strict = typecheck(dir);
  if (spec.expect === 'pass') {
    ok(strict, 'legacy strict ' + spec.id);
  } else {
    assert.notEqual(strict.status, 0, 'strict control unexpectedly compiled ' + spec.id);
    assert.match(strict.stdout + strict.stderr, new RegExp(spec.diagnostic), 'wrong legacy diagnostic ' + spec.id);
  }
  if (spec.expect === 'skip' || spec.expect === 'unsupported') {
    config(dir, ts, true, ['sample.ts']);
    const skip = typecheck(dir);
    if (spec.expect === 'skip') ok(skip, 'skipLibCheck advisory ' + spec.id);
    else {
      assert.notEqual(skip.status, 0, 'unsupported parser unexpectedly compiled ' + spec.id);
      assert.match(skip.stdout + skip.stderr, /TS1139/);
    }
  }
  console.log('PASS installed advisory ' + spec.id + ' TS' + ts + ' ' + spec.expect);
}
function checkLane(id) {
  const spec = definition(id);
  const dir = installed(id);
  if (spec.official) fullCase(spec, dir);
  else legacyCase(spec, dir);
  const info = ready();
  fs.mkdirSync(marks, { recursive: true });
  fs.writeFileSync(
    path.join(marks, id + '.json'),
    JSON.stringify({
      id,
      tip: info.hash,
      packed: info.packed,
      result: spec.official ? 'official CJS+ESM strict negative verified' : 'advisory diagnostic verified',
    }),
  );
}
function summary() {
  checkDocs();
  const info = ready();
  for (const spec of cases) {
    const filename = path.join(marks, spec.id + '.json');
    assert.ok(fs.existsSync(filename), 'missing installed compiler lane ' + spec.id);
    const result = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(result.id, spec.id);
    assert.equal(result.tip, info.hash);
    assert.deepEqual(result.packed, info.packed);
    console.log('VERIFIED ' + spec.id + ' ' + result.result);
  }
  console.log('PASS all ' + cases.length + ' installed server compiler combinations');
}
try {
  if (has('--check-docs')) checkDocs();
  else if (has('--prepare')) prepare();
  else if (value('--install')) install(value('--install'));
  else if (value('--check')) checkLane(value('--check'));
  else if (has('--summary')) summary();
  else {
    prepare();
    for (const spec of cases) {
      install(spec.id);
      checkLane(spec.id);
    }
    summary();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
