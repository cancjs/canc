#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build the candidate first, then run this script
// For bounded execution, use a fresh
// --run ID and --step list; execute every required step in order, then --step summary.
// Each step is bound to the same git head, probe sources and seven tarball hashes.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (key) => {
  const index = args.indexOf(key);
  return index < 0 ? undefined : args[index + 1];
};
const base = path.join(os.tmpdir(), 'canc', 'p117d-installed');
const runId = arg('--run');
assert.ok(!runId || /^[a-zA-Z0-9_-]+$/.test(runId), 'invalid run ID');
fs.mkdirSync(base, { recursive: true });
const root = runId ? path.join(base, runId) : fs.mkdtempSync(path.join(base, 'gate-'));
const tarDir = path.join(root, 'tar');
const marks = path.join(root, 'marks');
// Invoke npm's CLI directly on Windows; avoid shell interpolation of paths and arguments.
const hostNpm = process.platform === 'win32' ? process.execPath : 'npm';
const hostNpmArgs =
  process.platform === 'win32' ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')] : [];
if (hostNpmArgs.length) assert.ok(fs.existsSync(hostNpmArgs[0]), 'host npm CLI is missing');
const names = ['promise', 'coroutine', ...['node', 'express', 'koa', 'hono', 'fastify'].map((a) => 'server-' + a)];
const formats = ['cjs', 'esm'];
const peers = {
  floor: { fastify: '5.0.0', 'fastify-plugin': '5.0.0' },
  current: { fastify: '5.12.8', 'fastify-plugin': '6.0.1' },
};
const otherPeers = {
  express: '5.3.0',
  koa: '3.3.0',
  hono: '4.13.16',
  '@hono/node-server': '1.19.7',
};
const compilerDeps = {
  typescript: '5.9.3',
  typescript42: 'npm:typescript@4.2.4',
  '@types/node': '20.19.43',
};
const coreWire = [
  'node-route429',
  'node-option429',
  'node-fallback500',
  'express-route429',
  'express-option429',
  'hono-route429',
  'hono-option429',
  'node-shutdown507',
];
const wireCases = [
  ...coreWire,
  'node-head',
  'node-zero',
  'node-absent',
  'node-stream',
  'express-stream',
  'express-native',
  'koa-native429',
  'fastify-native429',
];
const modes = [
  ['node', 'cancelableHandler'],
  ['express', 'cancelableHandler'],
  ['express', 'middleware'],
  ['koa', 'cancelableHandler'],
  ['koa', 'middleware'],
  ['hono', 'cancelableHandler'],
  ['hono', 'middleware'],
  ['fastify', 'cancelableHandler'],
  ['fastify', 'cancelableHook'],
  ['fastify', 'cancelablePreParsing'],
  ['fastify', 'plugin'],
];
const es5Cases = ['routes', 'request-hooks', 'preParsing', 'plain', 'preabort', 'off'];
const versions = {
  '22-0': ['22.0.0', '10.9.4'],
  '22-12': ['22.12.0', '10.9.4'],
  20: ['20.20.2', '10.9.4'],
  18: ['18.0.0', '9.9.4'],
};
const entries = ['dist/index.cjs', 'dist/index.mjs', 'dist/types/index.d.ts', 'dist/types/index.d.mts'];
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const real = (file) => fs.realpathSync.native(file);
const within = (dir, file) => {
  const relative = path.relative(real(dir), real(file));
  assert.ok(
    relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative),
    'not physically inside consumer: ' + file,
  );
};
const packageDir = (name) =>
  path.join(repo, 'packages', name.startsWith('server-') ? 'canc-server/canc-' + name : 'canc-' + name);
const packageName = (name) => '@cancjs/' + name;
const packageRoot = (dir, name) => path.join(dir, 'node_modules', packageName(name));
const consumer = (lane) => path.join(root, lane);
const safeInstall = ['--no-audit', '--no-fund'];
const npmEnv = () => ({
  npm_config_userconfig: path.join(root, 'empty-npmrc'),
});

function run(exe, argv, cwd = repo, extra = {}) {
  const env = { ...process.env, ...extra, NODE_OPTIONS: '' };
  delete env.NODE_PATH;
  return spawnSync(exe, argv, {
    cwd,
    shell: false,
    encoding: 'utf8',
    timeout: 24000,
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
}

function ok(result, label) {
  assert.equal(result.error, undefined, label + ': ' + result.error);
  assert.equal(result.status, 0, label + ':\n' + result.stdout + '\n' + result.stderr);
  return result.stdout;
}

function exactReplace(source, old, replacement) {
  assert.equal(source.split(old).length, 2, 'probe or mutation anchor drift: ' + old);
  return source.replace(old, replacement);
}

// Run the same runtime assertions as the dist tests, in physically installed consumers.
function distProbe(name) {
  const source = read(path.join(repo, 'tests-dist', 'src', name + '.spec.ts')).replace(/\r\n/g, '\n');
  const start = 'const probe = String.raw' + String.fromCharCode(96);
  const end = '\n' + String.fromCharCode(96) + ';';
  const body = source.split(start);
  assert.equal(body.length, 2, 'dist probe missing or ambiguous: ' + name);
  const close = body[1].indexOf(end);
  assert.ok(close > 0, 'unterminated dist probe: ' + name);
  return body[1].slice(0, close);
}

function wireProbe() {
  return exactReplace(
    distProbe('http-empty-framing'),
    "assert.ok(head[2] === null || head[2] === '0', 'empty response must not advertise bytes');",
    "assert.equal(head[2], null, 'empty response must not advertise a content length');",
  );
}

function timeoutProbe() {
  let source = distProbe('server-timeout-status-setup');
  source = exactReplace(
    source,
    "['199', { ms: 1, status: 199 }],",
    "['700', { ms: 1, status: 700 }],\n  ['199', { ms: 1, status: 199 }],",
  );
  source = exactReplace(source, "['200.5', { ms: 1, status: 200.5 }],", "['429.25', { ms: 1, status: 429.25 }],");
  return exactReplace(
    source,
    "['bad-header', { ms: 1, headers: { 'Bad Name': 'ok' } }],",
    "['bad-header', { ms: 1, headers: { 'Bad Name': 'ok' } }],\n  ['nonstring', { ms: 1, headers: { 'X-Test': 17 } }],\n  ['crlf', { ms: 1, headers: { 'X-Test': 'bad\\r\\nvalue' } }],",
  );
}
const es5Probe = () => distProbe('fastify-es5-conditional');

function fingerprint() {
  const paths = [
    'scripts/check-beta3-server-installed.mjs',
    'tests-dist/src/http-empty-framing.spec.ts',
    'tests-dist/src/server-timeout-status-setup.spec.ts',
    'tests-dist/src/fastify-es5-conditional.spec.ts',
    'tests-types/fixtures/common/server-fastify-types.ts',
    'tests-types/fixtures/common/server-fastify-es5-auto.ts',
  ];
  return Object.fromEntries(paths.map((file) => [file, hash(path.join(repo, file))]));
}
function head() {
  return ok(run('git', ['rev-parse', 'HEAD']), 'git head').trim();
}
function pack(name, published, builtBase) {
  const dir = builtBase ? path.join(builtBase, path.relative(repo, packageDir(name))) : packageDir(name);
  const manifest = json(path.join(dir, 'package.json'));
  assert.equal(manifest.name, packageName(name));
  const result = ok(
    run(
      hostNpm,
      [
        ...hostNpmArgs,
        'pack',
        '--ignore-scripts',
        '--pack-destination',
        tarDir,
        ...(published ? [manifest.name + '@1.1.0-beta.2'] : []),
      ],
      dir,
      npmEnv(),
    ),
    'pack ' + name,
  );
  const file = path.join(tarDir, result.trim().split(/\r?\n/).pop());
  assert.ok(fs.existsSync(file));
  const record = {
    file,
    hash: hash(file),
    version: published ? '1.1.0-beta.2' : manifest.version,
    entries: published ? null : Object.fromEntries(entries.map((entry) => [entry, hash(path.join(dir, entry))])),
  };
  console.log('PACK', name, file, record.hash);
  return record;
}
function prepare() {
  fs.mkdirSync(root, { recursive: true });
  within(base, root);
  assert.equal(fs.lstatSync(root).isSymbolicLink(), false, 'run root is a link');
  assert.ok(!fs.existsSync(tarDir) && !fs.existsSync(marks), 'run ID already used; preserve previous artifacts');
  fs.mkdirSync(tarDir, { recursive: true });
  fs.mkdirSync(marks, { recursive: true });
  fs.writeFileSync(path.join(root, 'empty-npmrc'), '');
  const published = args.includes('--published-beta2');
  const builtBase = arg('--built-beta2');
  assert.ok(!(published && builtBase), 'choose one baseline source');
  const baseline = Boolean(published || builtBase);
  let baselineHead;
  if (builtBase) {
    baselineHead = ok(run('git', ['rev-parse', 'HEAD'], builtBase), 'baseline head').trim();
    const tag = ok(run('git', ['rev-parse', 'v1.1.0-beta.2^{commit}']), 'beta.2 tag').trim();
    assert.equal(baselineHead, tag, 'baseline tree must be at exact beta.2 tag');
    assert.equal(
      ok(run('git', ['status', '--porcelain'], builtBase), 'baseline tree status').trim(),
      '',
      'dirty baseline source',
    );
  }
  const packs = Object.fromEntries(names.map((name) => [name, pack(name, published, builtBase)]));
  writeJson(path.join(root, 'prepared.json'), {
    head: head(),
    fingerprint: fingerprint(),
    packs,
    baseline,
    baselineHead,
  });
}
function ready() {
  within(base, root);
  assert.equal(fs.lstatSync(root).isSymbolicLink(), false, 'run root is a link');
  const info = json(path.join(root, 'prepared.json'));
  assert.equal(info.head, head(), 'prepared head drift');
  assert.deepEqual(info.fingerprint, fingerprint(), 'probe source drift');
  for (const record of Object.values(info.packs)) assert.equal(hash(record.file), record.hash, 'tarball modified');
  return info;
}
function mark(lane, data) {
  const info = ready();
  writeJson(path.join(marks, lane + '.json'), {
    head: info.head,
    fingerprint: info.fingerprint,
    packs: info.packs,
    data,
  });
}
function marked(lane) {
  const info = ready();
  const record = json(path.join(marks, lane + '.json'));
  assert.equal(record.head, info.head);
  assert.deepEqual(record.fingerprint, info.fingerprint);
  assert.deepEqual(record.packs, info.packs);
  return record.data;
}

function toolchain(key) {
  const [nodeVersion, npmVersion] = versions[key];
  const nodeModule =
    'node-' + { win32: 'win', darwin: 'darwin', linux: 'linux' }[process.platform] + '-' + process.arch;
  assert.ok(!nodeModule.includes('undefined'), 'unsupported toolchain platform');
  const prefix = path.join(base, 'toolchains', 'node-' + nodeVersion);
  const binary = process.platform === 'win32' ? 'node.exe' : 'node';
  const node = arg('--node' + key) ?? path.join(prefix, 'node_modules', nodeModule, 'bin', binary);
  const npmPrefix = path.join(base, 'toolchains', 'npm-' + npmVersion);
  const cli =
    arg('--npm' + npmVersion.split('.')[0]) ?? path.join(npmPrefix, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  for (const [file, dir, spec] of [
    [node, prefix, nodeModule + '@' + nodeVersion],
    [cli, npmPrefix, 'npm@' + npmVersion],
  ]) {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      ok(
        run(
          hostNpm,
          [
            ...hostNpmArgs,
            'install',
            '--prefix',
            dir,
            '--no-save',
            '--no-package-lock',
            '--ignore-scripts',
            ...safeInstall,
            spec,
          ],
          repo,
          npmEnv(),
        ),
        'toolchain ' + spec,
      );
    }
    assert.ok(fs.existsSync(file), 'toolchain executable missing ' + file);
  }
  assert.equal(ok(run(node, ['--version']), 'node version').trim(), 'v' + nodeVersion);
  assert.equal(ok(run(node, [cli, '--version']), 'npm version').trim(), npmVersion);
  return { node, cli, nodeVersion, npmVersion };
}
function npm(tool, argv, dir) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const env = { ...npmEnv(), [pathKey]: path.dirname(tool.node) + path.delimiter + (process.env[pathKey] ?? '') };
  return ok(run(tool.node, [tool.cli, ...argv], dir, env), 'npm ' + argv.join(' '));
}
function dependencyGraph(dir) {
  const graph = {};
  function visit(modules) {
    if (!fs.existsSync(modules)) return;
    for (const name of fs
      .readdirSync(modules)
      .filter((name) => !name.startsWith('.'))
      .sort()) {
      const item = path.join(modules, name);
      const candidates =
        name.startsWith('@') ?
          fs
            .readdirSync(item)
            .sort()
            .map((pkg) => path.join(item, pkg))
        : [item];
      for (const folder of candidates) {
        const file = path.join(folder, 'package.json');
        if (!fs.existsSync(file)) continue;
        within(dir, folder);
        assert.equal(fs.lstatSync(folder).isSymbolicLink(), false, 'symlink in installed graph');
        graph[path.relative(dir, folder).split(path.sep).join('/')] = json(file).version;
        visit(path.join(folder, 'node_modules'));
      }
    }
  }
  visit(path.join(dir, 'node_modules'));
  return graph;
}
const resolveProbe =
  "\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport { createRequire } from 'node:module';\nimport { fileURLToPath } from 'node:url';\nconst require = createRequire(import.meta.url);\nfor (const name of process.argv.slice(2)) {\n  const pkg = '@cancjs/' + name;\n  const folder = path.join(process.cwd(), 'node_modules', pkg);\n  const cjs = fs.realpathSync.native(require.resolve(pkg));\n  assert.equal(cjs, fs.realpathSync.native(path.join(folder, 'dist/index.cjs')));\n  require(pkg);\n  if (typeof import.meta.resolve === 'function') {\n    const esm = fs.realpathSync.native(fileURLToPath(import.meta.resolve(pkg)));\n    assert.equal(esm, fs.realpathSync.native(path.join(folder, 'dist/index.mjs')));\n    await import(pkg);\n    console.log('RESOLVE', name, cjs, esm);\n  } else {\n    await import(pkg);\n    console.log('RESOLVE', name, cjs, 'ESM import executed');\n  }\n}\n";
function physical(dir, selected, tool) {
  const info = ready();
  for (const name of selected) {
    const folder = packageRoot(dir, name);
    within(dir, folder);
    assert.equal(fs.lstatSync(folder).isSymbolicLink(), false);
    const record = info.packs[name];
    const manifest = json(path.join(folder, 'package.json'));
    assert.equal(manifest.name, packageName(name));
    assert.equal(manifest.version, record.version);
    for (const entry of entries) {
      const file = path.join(folder, entry);
      within(dir, file);
      if (record.entries) assert.equal(hash(file), record.entries[entry], 'not candidate bytes: ' + file);
    }
  }
  fs.writeFileSync(path.join(dir, 'resolve.mjs'), resolveProbe);
  console.log(ok(run(tool.node, ['resolve.mjs', ...selected], dir), 'physical CJS/ESM imports').trim());
}
function install(lane, key, selected, extra, scriptsOn = false, relaxed = false, omitOptional = false) {
  const info = ready();
  const tool = toolchain(key);
  const dir = consumer(lane);
  assert.ok(!fs.existsSync(dir), 'consumer already exists: ' + lane);
  fs.mkdirSync(dir, { recursive: true });
  const dependencies = {
    ...Object.fromEntries(selected.map((name) => [packageName(name), info.packs[name].file])),
    ...extra,
  };
  writeJson(path.join(dir, 'package.json'), {
    name: 'server-installed-probe',
    version: '0.0.0',
    private: true,
    dependencies,
  });
  const pins = relaxed ? ['--engine-strict=false'] : ['--engine-strict'];
  if (omitOptional) pins.push('--omit=optional');
  if (scriptsOn) {
    assert.equal(
      npm(tool, ['config', 'get', 'ignore-scripts'], dir).trim(),
      'false',
      'scripts-on install disabled by npm config',
    );
    console.log(npm(tool, ['install', '--package-lock-only', '--ignore-scripts', ...pins, ...safeInstall], dir).trim());
    console.log(npm(tool, ['ci', ...pins, ...safeInstall], dir).trim());
    assert.ok(fs.existsSync(path.join(dir, 'package-lock.json')));
  } else {
    console.log(
      npm(
        tool,
        [
          'install',
          '--prefix',
          dir,
          '--no-save',
          '--no-package-lock',
          '--ignore-scripts',
          ...pins,
          ...safeInstall,
          ...Object.entries(dependencies).map(([name, pin]) => (pin.endsWith('.tgz') ? pin : name + '@' + pin)),
        ],
        dir,
      ).trim(),
    );
  }
  physical(dir, selected, tool);
  const graph = dependencyGraph(dir);
  for (const [name, version] of Object.entries(extra)) {
    const manifest = json(path.join(dir, 'node_modules', name, 'package.json'));
    assert.equal(manifest.version, version.startsWith('npm:') ? version.split('@').pop() : version);
  }
  console.log('GRAPH', lane, JSON.stringify(graph));
  mark('install-' + lane, { selected, key, extra, scriptsOn, relaxed, graph });
}
function installed(lane) {
  const data = marked('install-' + lane);
  const tool = toolchain(data.key);
  const dir = consumer(lane);
  within(root, dir);
  assert.equal(fs.lstatSync(dir).isSymbolicLink(), false, 'consumer is a link');
  assert.deepEqual(dependencyGraph(dir), data.graph, 'installed graph drift ' + lane);
  physical(dir, data.selected, tool);
  return { ...data, tool, dir };
}
function probe(ctx, code, argv, label, red) {
  const result = run(ctx.tool.node, ['-e', code, ...argv], ctx.dir);
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  console.log(label + '\n' + output.trim());
  if (red) {
    assert.equal(result.error, undefined, 'negative must not be an external timeout');
    assert.notEqual(result.status, 0, 'negative unexpectedly green: ' + label);
    assert.match(output, red, 'wrong failure site: ' + label);
  } else {
    ok(result, label);
  }
  return output;
}
function wire(lane, format) {
  const ctx = installed(lane);
  for (const label of wireCases) {
    const output = probe(ctx, wireProbe(), [label, format], label);
    assert.ok(output.includes('WIRE ' + format + ' ' + label));
    if (coreWire.includes(label) && label !== 'node-shutdown507')
      assert.match(output, new RegExp('REUSE ' + format + ' ' + label + ' .* true'));
  }
  mark('wire-' + format, { cases: wireCases });
}
function timeout(lane, format) {
  const ctx = installed(lane);
  for (const [adapter, mode] of modes) {
    const output = probe(ctx, timeoutProbe(), [adapter, mode, format], 'timeout ' + adapter + ' ' + mode);
    assert.equal(output.match(/^SETUP /gm)?.length, 14);
    assert.equal(output.match(/^CONTROL /gm)?.length, 5);
    assert.ok(output.includes('WIRE ' + adapter + ' ' + mode + ' ' + format));
  }
  mark('timeout-' + format, { modes });
}
function emit(ctx) {
  const source = read(path.join(repo, 'tests-types/fixtures/common/server-fastify-es5-auto.ts'));
  const require = createRequire(path.join(ctx.dir, 'package.json'));
  const output = [];
  for (const [name, version] of [
    ['typescript42', '4.2.4'],
    ['typescript', '5.9.3'],
  ]) {
    const ts = require(name);
    assert.equal(ts.version, version);
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        lib: ['lib.es2018.d.ts'],
      },
    });
    assert.ok(result.outputText.includes('__generator'), 'compiler did not emit ES5 generator helper');
    const filename = path.join(ctx.dir, 'generator-' + version + '.cjs');
    fs.writeFileSync(filename, result.outputText);
    assert.equal(Object.prototype.toString.call(require(filename).es5Task), '[object Function]');
    console.log('ES5', version, '__generator', filename, hash(filename));
    output.push(filename);
  }
  return output;
}
function strictTypes(lane, extension) {
  const ctx = installed(lane);
  const fixture = read(path.join(repo, 'tests-types/fixtures/common/server-fastify-types.ts'));
  const file = 'fastify-types.' + extension;
  fs.writeFileSync(path.join(ctx.dir, file), fixture);
  const result = ok(
    run(
      ctx.tool.node,
      [
        path.join(ctx.dir, 'node_modules/typescript/lib/tsc.js'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2022',
        '--traceResolution',
        file,
      ],
      ctx.dir,
    ),
    'strict TS5.9 ' + extension,
  );
  const entry = path.join(packageRoot(ctx.dir, 'server-fastify'), extension === 'cts' ? entries[2] : entries[3]);
  const found = result
    .split(/\r?\n/)
    .filter((line) => line.includes('successfully resolved to') && line.includes('@cancjs/server-fastify'));
  assert.ok(
    found.some((line) => line.toLowerCase().includes(real(entry).replace(/\\/g, '/').toLowerCase())),
    'missing physical declaration trace ' + entry,
  );
  fs.writeFileSync(path.join(ctx.dir, 'trace-' + extension + '.log'), result);
  console.log('TYPE', extension, entry);
  mark('types-' + lane + '-' + extension, { entry });
}

const mapperProbe =
  "\nconst assert = require('node:assert/strict');\nconst format = process.argv[1];\nconst load = name => format === 'esm' ? import(name) : Promise.resolve(require(name));\nasync function main() {\n  const Fastify = (await load('fastify')).default ?? require('fastify');\n  const { cancelErrorHandler } = await load('@cancjs/server-fastify');\n  const failures = [];\n  for (const mode of ['sync', 'async', 'reject', 'sent']) {\n    const original = Error('ORIGINAL');\n    async function exchange(wrapped) {\n      const warnings = [], unhandled = [];\n      const app = Fastify({ logger: { level: 'warn', stream: { write: line => warnings.push(line) } } });\n      let calls = 0, sends = 0, timer;\n      const onUnhandled = reason => unhandled.push(String(reason));\n      process.on('unhandledRejection', onUnhandled);\n      try {\n        const onError = (error, request, reply) => {\n          assert.equal(error, original);\n          assert.equal(request.url, '/mapped');\n          calls++;\n          if (mode === 'sent') { reply.code(418).send({ marker: 'sent' }); return; }\n          if (mode === 'reject') return Promise.reject(Error('MAPPER_REJECT'));\n          const body = { marker: mode };\n          return mode === 'async' ? Promise.resolve(body) : body;\n        };\n        app.addHook('onRequest', (_request, reply, done) => {\n          const send = reply.send;\n          reply.send = function (payload) { sends++; return send.call(this, payload); };\n          done();\n        });\n        app.setErrorHandler(wrapped ? cancelErrorHandler({ onError }) : onError);\n        app.get('/mapped', () => { throw original; });\n        const result = await Promise.race([app.inject('/mapped'), new Promise(resolve => { timer = setTimeout(() => resolve('NO_END'), 750); })]);\n        await new Promise(resolve => setImmediate(resolve));\n        const record = { status: result.statusCode, body: result === 'NO_END' ? result : JSON.parse(result.body), calls, sends,\n          unhandled, double: warnings.filter(line => line.includes('FST_ERR_REP_ALREADY_SENT')).length };\n        console.log('MAPPER', format, mode, wrapped, JSON.stringify(record));\n        return record;\n      } finally { clearTimeout(timer); process.off('unhandledRejection', onUnhandled); await app.close(); }\n    }\n    const native = await exchange(false);\n    assert.equal(native.status, mode === 'reject' ? 500 : mode === 'sent' ? 418 : 200);\n    assert.equal(native.calls, 1); assert.deepEqual(native.unhandled, []); assert.equal(native.double, 0);\n    if (mode === 'reject') assert.equal(native.body.message, 'MAPPER_REJECT');\n    else assert.deepEqual(native.body, { marker: mode });\n    try { assert.deepEqual(await exchange(true), native); } catch (error) { failures.push(error.message); }\n  }\n  assert.deepEqual(failures, []);\n}\nmain().catch(error => { console.error(error); process.exitCode = 1; });\n";
const socketProbe =
  "\nconst assert = require('node:assert/strict');\nconst http = require('node:http');\nconst [format, fixture, required] = process.argv.slice(1);\nconst load = name => format === 'esm' ? import(name) : Promise.resolve(require(name));\nasync function main() {\n  const Fastify = (await load('fastify')).default ?? require('fastify');\n  const { cancelPlugin } = await load('@cancjs/server-fastify');\n  const { es5Task } = require(fixture);\n  const app = Fastify();\n  const calls = [], steps = [], finals = [];\n  try {\n    await app.register(cancelPlugin);\n    app.get('/native', function* () { calls.push('native'); yield Promise.resolve(); return { mode: 'native' }; });\n    app.get('/es5', () => { calls.push('es5'); return es5Task(() => steps.push('es5'), { mode: 'es5' }, () => finals.push('es5')); });\n    const url = await app.listen({ host: '127.0.0.1', port: 0 });\n    for (const mode of ['native', 'es5']) {\n      const result = await new Promise((resolve, reject) => {\n        let timer;\n        const request = http.get(url + '/' + mode, { headers: { Connection: 'close' } }, response => {\n          const parts = [];\n          response.on('data', part => parts.push(part));\n          response.on('error', error => { clearTimeout(timer); reject(error); });\n          response.on('end', () => { clearTimeout(timer); resolve({ status: response.statusCode, body: Buffer.concat(parts).toString(), end: true }); });\n        });\n        timer = setTimeout(() => request.destroy(Error('NO_END')), 1500);\n        request.on('error', error => { clearTimeout(timer); reject(error); });\n      });\n      console.log('SOCKET', process.version, format, mode, JSON.stringify(result));\n      assert.deepEqual(result, { status: 200, body: JSON.stringify({ mode }), end: true });\n    }\n    assert.deepEqual(calls, ['native', 'es5']); assert.deepEqual(steps, ['es5']); assert.deepEqual(finals, steps);\n    try {\n      const result = await app.inject('/es5');\n      console.log('INJECT', process.version, format, result.statusCode, result.body);\n      if (required === 'yes') { assert.equal(result.statusCode, 200); assert.deepEqual(JSON.parse(result.body), { mode: 'es5' }); }\n    } catch (error) { if (required === 'yes') throw error; console.log('INJECT DIAGNOSTIC', error.code, error.message); }\n  } finally { await app.close(); }\n}\nmain().catch(error => { console.error(error); process.exitCode = 1; });\n";
const honoWebProbe =
  "\nconst assert = require('node:assert/strict');\nassert.throws(() => require.resolve('@hono/node-server'), { code: 'MODULE_NOT_FOUND' });\nconst { Hono } = require('hono');\nconst { cancelableHandler } = require('@cancjs/server-hono');\n(async () => {\n  const app = new Hono();\n  app.get('/web', cancelableHandler(function* (c) { return c.text('WEB-OK'); }));\n  const res = await app.request('http://localhost/web');\n  assert.equal(res.status, 200);\n  assert.equal(await res.text(), 'WEB-OK');\n  console.log('Node18 Hono Web optional-less HTTP200 WEB-OK');\n})().catch(error => { console.error(error); process.exitCode = 1; });\n";

function fastify(lane, format, detail = 'full') {
  const ctx = installed(lane);
  const fixtures = emit(ctx);
  for (const fixture of fixtures)
    probe(ctx, socketProbe, [format, fixture, ctx.key === '22-12' ? 'yes' : 'no'], 'socket ' + lane);
  if (ctx.key === '22-12') {
    probe(ctx, mapperProbe, [format], 'mapper ' + lane);
    for (const fixture of fixtures)
      for (const label of detail === 'full' ? es5Cases : ['routes', 'preParsing']) {
        probe(ctx, es5Probe(), [format, fixture, label], 'ES5 ' + lane + ' ' + label);
      }
  }
  if (ctx.scriptsOn) {
    const counterpart = lane.replace(/-on$/, '-off');
    assert.deepEqual(
      ctx.graph,
      marked('install-' + counterpart).graph,
      'scripts-on/off dependency graph drift ' + lane,
    );
  }
  mark('fastify-' + lane + '-' + format, {
    detail,
    sockets: true,
    inject: ctx.key === '22-12',
    scriptsOn: ctx.scriptsOn,
  });
}
function mutant(ctx, name, adapter, transform, source, argv, expected) {
  const file = path.join(packageRoot(ctx.dir, 'server-' + adapter), 'dist/index.cjs');
  within(ctx.dir, file);
  const original = fs.readFileSync(file);
  const before = hash(file);
  const changed = transform(original.toString('utf8'));
  assert.notEqual(changed, original.toString('utf8'));
  try {
    fs.writeFileSync(file, changed);
    probe(ctx, source, argv, 'MUTANT ' + name, expected);
  } finally {
    fs.writeFileSync(file, original);
    assert.equal(hash(file), before, 'mutation restore failed');
  }
}
function wireMutants(adapter) {
  const ctx = installed('CJS');
  mutant(
    ctx,
    adapter + '-missing-length',
    adapter,
    (s) => exactReplace(s, "    'Content-Length',\n];", '];'),
    wireProbe(),
    [adapter + '-route429', 'cjs'],
    /WIRE cjs .*429,"7".*(NO_END|ECONNRESET)/,
  );
  const overlay = {
    node: '    for (const [name, value] of Object.entries(headers)) {\n        res.setHeader(name, value);\n    }\n',
    express:
      '        const headers = cancelHeadersFor(error, options.status);\n        if (headers) {\n            res.set(headers);\n        }\n',
    hono: '        for (const [name, value] of Object.entries(cancelHeadersFor(error, options.status) ?? {})) {\n            headers.set(name, value);\n        }\n',
  }[adapter];
  const remove =
    adapter === 'hono' ?
      '        for (const name of STALE_CONTENT_HEADERS) {\n            headers.delete(name);\n        }\n'
    : adapter === 'node' ? '    for (const name of STALE_CONTENT_HEADERS) {\n        res.removeHeader(name);\n    }\n'
    : '        for (const name of STALE_CONTENT_HEADERS) {\n            res.removeHeader(name);\n        }\n';
  for (const label of adapter === 'node' ? ['node-option429', 'node-shutdown507'] : [adapter + '-option429']) {
    mutant(
      ctx,
      label + '-overlay-order',
      adapter,
      (s) => exactReplace(s, overlay + remove, remove + overlay),
      wireProbe(),
      [label, 'cjs'],
      /WIRE cjs .*(429|507),"7".*(NO_END|ECONNRESET)/,
    );
  }
  if (adapter === 'node') {
    mutant(
      ctx,
      'node-fallback500',
      'node',
      (s) =>
        exactReplace(
          s,
          '        res.removeHeader(name);\n    }\n    res.statusCode = status;',
          '        if (status !== HANDLER_FAILED_STATUS) res.removeHeader(name);\n    }\n    res.statusCode = status;',
        ),
      wireProbe(),
      ['node-fallback500', 'cjs'],
      /WIRE cjs .*500,"7".*(NO_END|ECONNRESET)/,
    );
    mutant(
      ctx,
      'missing-eager-node-timeout',
      'node',
      (s) => exactReplace(s, '    checkTimeoutOptions(options?.timeout);\n', ''),
      timeoutProbe(),
      ['node', 'cancelableHandler', 'cjs'],
      /SETUP node cancelableHandler cjs 700 ACCEPTED/,
    );
  }
  physical(ctx.dir, names, ctx.tool);
  mark('wire-mutants-' + adapter, { count: adapter === 'node' ? 5 : 2 });
}
function fastifyMutants() {
  const ctx = installed('22-12-floor-off');
  const fixture = emit(ctx)[0];
  const generator = (name, before, after, label, expected) =>
    mutant(ctx, name, 'fastify', (s) => exactReplace(s, before, after), es5Probe(), ['cjs', fixture, label], expected);
  mutant(
    ctx,
    'missing-mapper-return',
    'fastify',
    (s) => exactReplace(s, 'return onError(error, request, reply);', 'onError(error, request, reply); return;'),
    mapperProbe,
    ['cjs'],
    /NO_END/,
  );
  generator(
    'tag-only',
    '        if (!isFastifyGeneratorResult(result)) {\n            return result;\n        }\n        // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments\n        return cancelableHandler',
    "        if (Object.prototype.toString.call(original) !== '[object GeneratorFunction]') {\n            return result;\n        }\n        return cancelableHandler",
    'routes',
    /INJECT routes cjs "\/es5" 200 \{\}/,
  );
  generator(
    'weak-iterator',
    "        hasDataMethod(value, 'throw') &&\n        hasDataMethod(value, 'return') &&\n",
    '',
    'plain',
    /INJECT plain cjs "\/iterator" 500|iterator pulls/,
  );
  generator(
    'getter-read',
    "        hasDataMethod(value, 'next') &&",
    "        typeof value.next === 'function' &&",
    'plain',
    /getter reads|DO_NOT_TOUCH_NEXT/,
  );
  generator('callback-no-done', '.then(() => done(), done);', '.then(() => {}, done);', 'request-hooks', /NO_END/);
  generator(
    'parser-no-stream',
    '.then((value) => done(null, value), done);',
    '.then(() => done(null, payload), done);',
    'preParsing',
    /"hello":1/,
  );
  generator(
    'preabort-step',
    '        return cancelableHandler(() => result).apply(this, arguments);',
    '        result.next();\n        return cancelableHandler(() => result).apply(this, arguments);',
    'preabort',
    /"steps":1/,
  );
  mutant(
    ctx,
    'plugin-sync-throw',
    'fastify',
    (s) => exactReplace(s, 'const plugin = async function cancelPlugin(', 'const plugin = function cancelPlugin('),
    timeoutProbe(),
    ['fastify', 'plugin', 'cjs'],
    /RangeError: timeout status \(700\)/,
  );
  physical(ctx.dir, ctx.selected, ctx.tool);
  mark('fastify-mutants', { count: 8 });
}

const selectedFastify = ['promise', 'coroutine', 'server-fastify'];
const selectedHono = ['promise', 'coroutine', 'server-hono'];
const steps = new Map();
const advisory = new Map();
steps.set('prepare', prepare);
for (const format of formats) {
  const lane = format.toUpperCase();
  steps.set('install-' + lane, () => install(lane, '22-12', names, { ...otherPeers, ...peers.current }));
  steps.set('wire-' + format, () => wire(lane, format));
  steps.set('timeout-' + format, () => timeout(lane, format));
}
for (const key of ['22-0', '22-12'])
  for (const kind of Object.keys(peers))
    for (const variant of ['off', 'on']) {
      const lane = key + '-' + kind + '-' + variant;
      steps.set('install-' + lane, () =>
        install(lane, key, selectedFastify, { ...peers[kind], ...compilerDeps }, variant === 'on'),
      );
      for (const format of formats)
        steps.set('fastify-' + lane + '-' + format, () =>
          fastify(lane, format, variant === 'off' ? 'full' : 'controls'),
        );
      if (key === '22-12' && variant === 'off')
        for (const extension of ['cts', 'mts']) {
          steps.set('types-' + lane + '-' + extension, () => strictTypes(lane, extension));
        }
    }
advisory.set('install-20-floor', () =>
  install('20-floor', '20', selectedFastify, { ...peers.floor, ...compilerDeps }, false, true),
);
for (const format of formats) advisory.set('fastify-20-floor-' + format, () => fastify('20-floor', format, 'advisory'));
advisory.set('install-18-web', () => install('18-web', '18', selectedHono, { hono: '4.8.0' }, false, false, true));
advisory.set('hono-18-web', () => {
  const ctx = installed('18-web');
  probe(ctx, honoWebProbe, [], 'Node18 Hono Web optional-less');
  mark('hono-18-web', { optionalAbsent: true });
});
for (const adapter of ['node', 'express', 'hono']) steps.set('wire-mutants-' + adapter, () => wireMutants(adapter));
steps.set('fastify-mutants', fastifyMutants);
steps.set('restored-wire', () => {
  wire('CJS', 'cjs');
  mark('restored-wire', { verified: true });
});
steps.set('restored-timeout', () => {
  timeout('CJS', 'cjs');
  mark('restored-timeout', { verified: true });
});
for (const format of formats)
  steps.set('restored-fastify-' + format, () => {
    fastify('22-12-floor-off', format);
    mark('restored-fastify-' + format, { verified: true });
  });

function baselineWire() {
  assert.equal(ready().baseline, true);
  const ctx = installed('CJS');
  for (const label of coreWire)
    probe(ctx, wireProbe(), [label, 'cjs'], 'BASELINE ' + label, /WIRE cjs .*(429|500|507),"7".*(NO_END|ECONNRESET)/);
  console.error('BASELINE RED: all eight real stale-length exchanges fail');
  process.exitCode = 1;
}
function baselineFastify() {
  assert.equal(ready().baseline, true);
  const ctx = installed('22-12-floor-off');
  const fixture = emit(ctx)[0];
  probe(ctx, mapperProbe, ['cjs'], 'BASELINE mapper', /NO_END/);
  probe(ctx, es5Probe(), ['cjs', fixture, 'routes'], 'BASELINE ES5', /INJECT routes cjs "\/es5" 200 \{\}/);
  console.error('BASELINE RED: real mapper and ES5 exchanges fail');
  process.exitCode = 1;
}
function summary() {
  assert.equal(ready().baseline, false, 'published baseline cannot be certified');
  for (const name of steps.keys()) if (name !== 'prepare') marked(name);
  console.log('PASS installed CJS Node Express Hono framing');
  console.log('PASS installed ESM Node Express Hono framing');
  console.log('PASS installed Fastify onError sync async rejected');
  console.log('PASS installed Fastify ES5 route hooks');
  console.log('PASS timeout configuration bounds');
  console.log('PASS installed Fastify strict scripts-on ci Node22.0 socket');
  console.log('PASS installed Fastify strict scripts-on ci Node22.12 socket/inject');
  console.log('PASS installed copy mutations and restored candidate');
  console.log('Node20 relaxed and Node18 optional-less Web are separate advisory steps, not required for this gate.');
  console.log('EVIDENCE', root);
}
const step = arg('--step');
if (step === 'list') console.log([...steps.keys(), 'summary', ...advisory.keys()].join('\n'));
else if (step === 'summary') summary();
else if (step === 'baseline-wire') baselineWire();
else if (step === 'baseline-fastify') baselineFastify();
else if (step) {
  assert.ok(runId, '--step requires --run');
  const action = steps.get(step) ?? advisory.get(step);
  assert.ok(action, 'unknown step: ' + step);
  action();
} else {
  for (const action of steps.values()) action();
  summary();
}
