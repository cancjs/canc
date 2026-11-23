#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owned = path.join(os.tmpdir(), 'canc', 'p105c-fastify-floors');
const tarDir = path.join(owned, 'tar');
const marks = path.join(owned, 'marks');
const args = process.argv.slice(2);
const arg = (flag) => {
  const pos = args.indexOf(flag);
  return pos < 0 ? undefined : args[pos + 1];
};
const has = (flag) => args.includes(flag);
const hostNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const HOST_FASTIFY =
  "\nimport assert from 'node:assert/strict';\nimport http from 'node:http';\nimport path from 'node:path';\nimport { createRequire } from 'node:module';\nconst { ROOT, REQUIRE_INJECT }=process.env;\nconst require=createRequire(path.join(ROOT,'package.json'));\nconst fastify=require('fastify');\nconst {cancelPlugin,cancelableHandler}=require('@cancjs/server-fastify');\nconst app=fastify();\nconst watchdog=setTimeout(()=>{console.error('HOST_TIMEOUT');process.exit(3);},8000);\ntry{\n await app.register(cancelPlugin);\n app.get('/probe',cancelableHandler(function*(){return {ok:true};}));\n const listening=await app.listen({host:'127.0.0.1',port:0});\n const data=await new Promise((resolve,reject)=>{\n   http.get(new URL('/probe',listening),(response)=>{\n    let text='';\n    response.setEncoding('utf8');\n    response.on('data',chunk=>{text+=chunk;});\n    response.on('end',()=>resolve({status:response.statusCode,body:text}));\n   }).on('error',reject);\n });\n assert.equal(data.status,200);\n assert.equal(data.body,JSON.stringify({ok:true}));\n console.log('PASS real socket 200 '+data.body);\n try {\n  const response=await app.inject({method:'GET',url:'/probe'});\n  if(REQUIRE_INJECT==='yes'){\n   assert.equal(response.statusCode,200);\n   assert.equal(response.body,JSON.stringify({ok:true}));\n  }\n  console.log('INJECT status='+response.statusCode+' body='+response.body);\n }catch(error){\n  if(REQUIRE_INJECT==='yes')throw error;\n  console.log('INJECT advisory='+error.code+' '+error.message);\n }\n}finally{\n await app.close();\n clearTimeout(watchdog);\n}\n";
const HOST_HONO =
  "\nimport assert from 'node:assert/strict';\nimport path from 'node:path';\nimport { createRequire } from 'node:module';\nconst require=createRequire(path.join(process.env.ROOT,'package.json'));\nassert.throws(()=>require.resolve('@hono/node-server'),{code:'MODULE_NOT_FOUND'});\nconst {Hono}=require('hono');\nconst {cancelableHandler}=require('@cancjs/server-hono');\nconst app=new Hono();\napp.get('/web',cancelableHandler(function*(c){return c.text('WEB-OK');}));\nconst reply=await app.request('http://localhost/web');\nassert.equal(reply.status,200);\nassert.equal(await reply.text(),'WEB-OK');\nconsole.log('PASS Node18 Hono without node-server HTTP200 WEB-OK');\n";
const specs = {
  node18: ['18.0.0', '9.9.4'],
  node20: ['20.20.2', '10.9.4'],
  'node22-0': ['22.0.0', '10.9.4'],
  'node22-12': ['22.12.0', '10.9.4'],
};
const tuples = { floor: ['5.0.0', '5.0.0'], modern: ['5.12.8', '6.0.1'] };
const lanes = [
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

function run(exe, argv, cwd, env = {}) {
  const shell = process.platform === 'win32' && exe.toLowerCase().endsWith('.cmd');
  const runArgs = shell ? argv.map((x) => (/[\s"]/.test(x) ? '"' + x.replace(/"/g, '\\"') + '"' : x)) : argv;
  const childEnv = { ...process.env, ...env, NODE_OPTIONS: '' };
  delete childEnv.npm_config_allow_scripts;
  return spawnSync(exe, runArgs, {
    cwd,
    shell,
    encoding: 'utf8',
    timeout: 24000,
    maxBuffer: 16 * 1024 * 1024,
    env: childEnv,
  });
}
function ok(result, reason) {
  assert.equal(result.error, undefined, reason + ': ' + String(result.error));
  assert.equal(result.status, 0, reason + ':\n' + result.stdout + '\n' + result.stderr);
  return result.stdout;
}
function toolchain(key) {
  const [nodeVersion, npmVersion] = specs[key];
  let node = arg('--' + key);
  let cli = arg('--npm' + npmVersion.split('.')[0]);
  if (!node) {
    const prefix = path.join(owned, 'toolchains', 'node-' + nodeVersion);
    node = path.join(prefix, 'node_modules', 'node-win-x64', 'bin', 'node.exe');
    if (!fs.existsSync(node)) {
      fs.mkdirSync(prefix, { recursive: true });
      ok(
        run(
          hostNpm,
          [
            'install',
            '--prefix',
            prefix,
            '--no-save',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            'node-win-x64@' + nodeVersion,
          ],
          repo,
        ),
        'node bootstrap ' + nodeVersion,
      );
    }
  }
  if (!cli) {
    const prefix = path.join(owned, 'toolchains', 'npm-' + npmVersion);
    cli = path.join(prefix, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!fs.existsSync(cli)) {
      fs.mkdirSync(prefix, { recursive: true });
      ok(
        run(
          hostNpm,
          [
            'install',
            '--prefix',
            prefix,
            '--no-save',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            'npm@' + npmVersion,
          ],
          repo,
        ),
        'npm bootstrap ' + npmVersion,
      );
    }
  }
  const actual = ok(run(node, ['--version'], repo), 'node version').trim();
  assert.equal(actual, 'v' + nodeVersion);
  assert.equal(ok(run(node, [cli, '--version'], repo), 'npm version').trim(), npmVersion);
  return { node, cli, nodeVersion, npmVersion };
}
function install(tool, argv, cwd) {
  return run(tool.node, [tool.cli, ...argv], cwd, { npm_config_userconfig: path.join(owned, 'empty-npmrc') });
}
function packedManifest(filename) {
  const bytes = gunzipSync(fs.readFileSync(filename));
  for (let offset = 0; offset < bytes.length;) {
    const name = bytes
      .subarray(offset, offset + 100)
      .toString('utf8')
      .split('\0')[0];
    const size = Number.parseInt(bytes.subarray(offset + 124, offset + 136).toString('utf8'), 8) || 0;
    if (name === 'package/package.json') {
      return JSON.parse(bytes.subarray(offset + 512, offset + 512 + size).toString('utf8'));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('packed archive has no package/package.json: ' + filename);
}
function checkPackedEngine(filename) {
  const manifest = packedManifest(filename);
  assert.equal(manifest.name, '@cancjs/server-fastify');
  assert.equal(manifest.engines.node, '>=22', 'packed Fastify engine must be >=22');
  console.log('PASS fastify packed engine>=22: ' + filename);
}

function pack(name) {
  const folder = path.join(repo, 'packages', name);
  const output = ok(
    run(hostNpm, ['pack', '--ignore-scripts', '--pack-destination', tarDir], folder),
    'npm pack ' + name,
  )
    .trim()
    .split(/\r?\n/)
    .pop();
  const filename = path.join(tarDir, output);
  assert.ok(fs.existsSync(filename), 'packed artifact missing ' + filename);
  const hash = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  console.log('PACK ' + name + ' ' + filename + ' sha256=' + hash);
  return { filename, hash };
}
function prepare() {
  // Only own this task's fixture directory. Preserve downloaded toolchains when regenerating packs.
  fs.mkdirSync(owned, { recursive: true });
  for (const dir of [tarDir, marks, path.join(owned, 'consumers')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(tarDir, { recursive: true });
  fs.mkdirSync(marks, { recursive: true });
  fs.writeFileSync(path.join(owned, 'empty-npmrc'), '');
  const build = ['canc-promise', 'canc-coroutine', 'canc-server/canc-server-fastify', 'canc-server/canc-server-hono'];
  if (!has('--already-built')) {
    for (const pkg of build) {
      const meta = JSON.parse(fs.readFileSync(path.join(repo, 'packages', pkg, 'package.json'), 'utf8'));
      ok(run(hostNpm, ['run', 'build', '-w', meta.name], repo), 'build ' + meta.name);
    }
  } else {
    for (const pkg of build)
      assert.ok(fs.existsSync(path.join(repo, 'packages', pkg, 'dist', 'index.cjs')), 'missing built ' + pkg);
  }
  const packed = Object.fromEntries(build.map((name) => [name, pack(name)]));
  checkPackedEngine(packed['canc-server/canc-server-fastify'].filename);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, 'packages/canc-server/canc-server-fastify/package.json'), 'utf8'),
  );
  assert.equal(manifest.engines.node, '>=22', 'adapter declared Node floor');
  const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['packages/canc-server/canc-server-fastify'].engines.node, '>=22', 'lock engine drift');
  const gitHead = ok(run('git', ['rev-parse', 'HEAD'], repo), 'git hash').trim();
  const fingerprints = { gitHead, packed };
  fs.writeFileSync(path.join(owned, 'prepared.json'), JSON.stringify(fingerprints, null, 2));
  console.log('PASS fastify engine>=22 / lock agreement, prepared candidate ' + gitHead);
}
function ready() {
  const info = JSON.parse(fs.readFileSync(path.join(owned, 'prepared.json'), 'utf8'));
  const gitHead = ok(run('git', ['rev-parse', 'HEAD'], repo), 'git hash').trim();
  assert.equal(info.gitHead, gitHead, 'candidate tip changed since prepare');
  for (const value of Object.values(info.packed))
    assert.equal(
      createHash('sha256').update(fs.readFileSync(value.filename)).digest('hex'),
      value.hash,
      'candidate tarball modified',
    );
  return info;
}
function physical(dir, pkg) {
  const filename = path.join(dir, 'node_modules', '@cancjs', pkg, 'package.json');
  assert.ok(fs.existsSync(filename), 'installed package missing ' + filename);
  const installed = path.dirname(filename);
  assert.equal(fs.lstatSync(installed).isSymbolicLink(), false);
  assert.ok(fs.realpathSync.native(installed).toLowerCase().includes('p105c-fastify-floors'));
  const m = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(m.version, '1.1.0-beta.2', 'candidate version');
  return m;
}
function consumerDir(lane) {
  return path.join(owned, 'consumers', lane);
}
function installFixture(lane, dependencies) {
  const dir = consumerDir(lane);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'p105c-' + lane,
        version: '0.0.0',
        private: true,
        dependencies,
      },
      null,
      2,
    ),
  );
  return dir;
}
function candidateDeps(info, includeHono = false) {
  const deps = {
    '@cancjs/promise': info.packed['canc-promise'].filename,
    '@cancjs/coroutine': info.packed['canc-coroutine'].filename,
  };
  deps[includeHono ? '@cancjs/server-hono' : '@cancjs/server-fastify'] =
    info.packed[includeHono ? 'canc-server/canc-server-hono' : 'canc-server/canc-server-fastify'].filename;
  return deps;
}
function diagnose(dir) {
  const lock = path.join(dir, 'package-lock.json');
  const fingerprint = {};
  const packages = ['node_modules/cookie', 'node_modules/light-my-request', 'node_modules/fastify'];
  const records = fs.existsSync(lock) ? JSON.parse(fs.readFileSync(lock, 'utf8')).packages : {};
  for (const label of packages) {
    const installed = path.join(dir, label, 'package.json');
    if (!fs.existsSync(installed)) continue;
    const manifest = JSON.parse(fs.readFileSync(installed, 'utf8'));
    const recorded = records?.[label];
    assert.equal(manifest.version, recorded?.version ?? manifest.version, 'resolved graph drift ' + label);
    fingerprint[label] = { version: manifest.version, integrity: recorded?.integrity ?? 'no-lock' };
  }
  assert.ok(fingerprint['node_modules/fastify'], 'Fastify package not physically installed');
  assert.ok(fingerprint['node_modules/light-my-request'], 'request harness not physically installed');
  console.log('GRAPH ' + JSON.stringify(fingerprint));
  return fingerprint;
}
function runFastify(lane, info) {
  const [, major, minor, kind, variant] =
    lane.match(/^node(20|22)-(0-|12-)?(floor|modern)-(strict|relaxed|scripts)$/) || [];
  assert.ok(kind, 'invalid lane ' + lane);
  const key = major === '20' ? 'node20' : 'node22-' + (minor === '12-' ? '12' : '0');
  const tool = toolchain(key);
  const peers = tuples[kind];
  const dir = installFixture(lane, { ...candidateDeps(info), fastify: peers[0], 'fastify-plugin': peers[1] });
  const strict = variant !== 'relaxed';
  if (variant === 'scripts') {
    ok(
      install(
        tool,
        ['install', '--package-lock-only', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund'],
        dir,
      ),
      'strict pinned lock ' + lane,
    );
    ok(install(tool, ['ci', '--engine-strict', '--no-audit', '--no-fund'], dir), 'scripts-ON npm ci ' + lane);
    assert.ok(fs.existsSync(path.join(dir, 'package-lock.json')));
  } else {
    const result = install(
      tool,
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        strict ? '--engine-strict' : '--engine-strict=false',
      ],
      dir,
    );
    if (major === '20' && strict) {
      assert.notEqual(result.status, 0, 'Node20 strict candidate must fail');
      assert.ok((result.stderr + result.stdout).includes('EBADENGINE'), 'must be engine failure: ' + result.stderr);
      const m = JSON.parse(
        fs.readFileSync(path.join(repo, 'packages/canc-server/canc-server-fastify/package.json'), 'utf8'),
      );
      assert.equal(m.engines.node, '>=22');
      console.log(
        'PASS Node20 strict EBADENGINE ' +
          kind +
          ' ' +
          (result.stderr.match(/required: [^\n]+/) || ['declared >=22'])[0],
      );
      return { tool, kind, variant, hostStatus: 'strict engine rejected', strictRejected: true };
    }
    ok(result, 'installed ' + lane);
  }
  const candidate = physical(dir, 'server-fastify');
  assert.equal(candidate.engines.node, '>=22');
  physical(dir, 'promise');
  physical(dir, 'coroutine');
  const fingerprint = diagnose(dir);
  const requiresInject = major === '20' || key === 'node22-12';
  const route = run(tool.node, ['--input-type=module', '--eval', HOST_FASTIFY], dir, {
    ROOT: dir,
    REQUIRE_INJECT: requiresInject ? 'yes' : 'no',
  });
  const trace = ok(route, 'real http+inject ' + lane);
  assert.ok(trace.includes('PASS real socket 200'));
  assert.ok(trace.includes('INJECT '));
  console.log(trace.trim());
  const status =
    variant === 'scripts' ? 'Node22.0 scripts-on strict npm ci + socket'
    : major === '20' ? 'Node20 relaxed advisory socket'
    : key === 'node22-12' ? 'Node22.12 inject'
    : 'Node22 strict socket';
  console.log('PASS ' + status + ' ' + kind);
  return {
    tool,
    kind,
    variant,
    fingerprint,
    hostStatus: status,
    stdout: trace.trim(),
    socketVerified: true,
    injectVerified: requiresInject,
    scriptsOnVerified: variant === 'scripts',
  };
}
function runHono(lane, info) {
  const tool = toolchain('node18');
  const deps = { ...candidateDeps(info, true), hono: '4.8.0' };
  if (lane === 'hono18-explicit') deps['@hono/node-server'] = '1.9.0';
  const dir = installFixture(lane, deps);
  const result = install(
    tool,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--omit=optional',
      '--engine-strict',
    ],
    dir,
  );
  if (lane === 'hono18-explicit') {
    assert.notEqual(result.status, 0, 'explicit Node-server should fail Node18.0 strict');
    assert.ok((result.stdout + result.stderr).includes('EBADENGINE'), 'Node-server engine failure expected');
    console.log('PASS Node18 explicit node-server engine rejection');
    return { tool, hostStatus: 'explicit node-server engine rejection', strictRejected: true };
  }
  ok(result, 'Node18 Hono optional-less install');
  physical(dir, 'server-hono');
  physical(dir, 'promise');
  physical(dir, 'coroutine');
  const output = ok(
    run(tool.node, ['--input-type=module', '--eval', HOST_HONO], dir, { ROOT: dir }),
    'Node18 Hono Web app.request',
  );
  assert.ok(output.includes('PASS Node18 Hono without node-server HTTP200 WEB-OK'));
  console.log(output.trim());
  return { tool, hostStatus: 'Node18 Hono without node-server', optionalAbsent: true };
}
function lane(name) {
  assert.ok(lanes.includes(name), 'unknown case ' + name);
  const info = ready();
  const record = name.startsWith('hono') ? runHono(name, info) : runFastify(name, info);
  fs.mkdirSync(marks, { recursive: true });
  const candidate = Object.fromEntries(Object.entries(info.packed).map(([key, item]) => [key, item.hash]));
  fs.writeFileSync(
    path.join(marks, name + '.json'),
    JSON.stringify(
      {
        name,
        gitHead: info.gitHead,
        candidate,
        record,
      },
      null,
      2,
    ),
  );
}
function summary() {
  const info = ready();
  const expected = Object.fromEntries(Object.entries(info.packed).map(([k, v]) => [k, v.hash]));
  for (const name of lanes) {
    const filename = path.join(marks, name + '.json');
    assert.ok(fs.existsSync(filename), 'missing executed lane ' + name);
    const entry = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(entry.name, name);
    assert.equal(entry.gitHead, info.gitHead, 'stale lane ' + name);
    assert.deepEqual(entry.candidate, expected, 'different packs in lane ' + name);
    assert.ok(entry.record.hostStatus, 'missing asserted status ' + name);
    if (name === 'hono18-web') assert.equal(entry.record.optionalAbsent, true, 'Hono optional-less case missing');
    else if (name === 'hono18-explicit' || (name.startsWith('node20-') && name.endsWith('-strict'))) {
      assert.equal(entry.record.strictRejected, true, 'required strict engine rejection missing ' + name);
    } else {
      assert.equal(entry.record.socketVerified, true, 'required real socket check missing ' + name);
      const manifest = physical(consumerDir(name), 'server-fastify');
      assert.equal(manifest.engines.node, '>=22', 'installed candidate engine floor regressed');
      if (name.endsWith('-scripts')) {
        assert.equal(entry.record.scriptsOnVerified, true, 'scripts-on npm ci bypassed ' + name);
        assert.ok(fs.existsSync(path.join(consumerDir(name), 'package-lock.json')), 'scripts-on lock missing');
      }
      if (name.startsWith('node22-12') || name.startsWith('node20-')) {
        assert.equal(entry.record.injectVerified, true, 'required inject case bypassed ' + name);
      }
    }
    console.log('VERIFIED ' + name + ' ' + entry.record.hostStatus);
  }
  console.log('PASS fastify engine>=22');
  console.log('PASS Node22 strict socket');
  console.log('PASS Node22.0 scripts-on strict npm ci + socket');
  console.log('PASS Node22.12 inject');
  console.log('PASS Node20 strict EBADENGINE');
  console.log('PASS Node18 Hono without node-server');
  console.log('PASS all ' + lanes.length + ' pinned physical host lanes');
}

try {
  if (has('--check-packed-engine')) {
    const filename = arg('--tar') ?? ready().packed['canc-server/canc-server-fastify'].filename;
    checkPackedEngine(filename);
  } else if (has('--prepare')) prepare();
  else if (arg('--lane')) lane(arg('--lane'));
  else if (has('--summary')) summary();
  else {
    prepare();
    for (const name of lanes) lane(name);
    summary();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
