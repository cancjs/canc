import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const owned = path.join(os.tmpdir(), 'canc', 'p104d-gen-unwind');
const tar = path.join(owned, 'tar');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const installed = (copy: string, name: string) => path.join(owned, copy, 'node_modules', '@cancjs', name);

jest.setTimeout(120000);
const PROBE =
  "\nimport assert from 'node:assert/strict';\nimport { createRequire } from 'node:module';\nimport path from 'node:path';\nimport { pathToFileURL } from 'node:url';\n\nconst { FORMAT, DRIVER, HELPER, KIND, COMPLETE } = process.env;\nconst req = createRequire(import.meta.url);\nconst load = async (root) => {\n  const filename = path.join(root, 'dist', FORMAT === 'CJS' ? 'gen.cjs' : 'gen.mjs');\n  return FORMAT === 'CJS' ? req(filename) : import(pathToFileURL(filename).href);\n};\nconst driver = await load(DRIVER);\nconst helper = await load(HELPER);\nconst log = [];\nconst gate = new Promise(() => {});\nconst after = 'after-' + KIND;\nconst watchdog = setTimeout(() => { console.error('pending timeout ' + JSON.stringify(log)); process.exit(3); }, 3500);\nconst co = driver.cancGenAsync(function* () {\n  log.push('start');\n  try {\n    if (KIND === 'forAwait') {\n      yield* helper.cancGenForAwait([1], function* () {\n        log.push('callback1');\n        yield* helper.cancGenAwait(COMPLETE === 'yes' ? Promise.resolve(5) : gate);\n      });\n    } else if (KIND === 'toArray') {\n      yield* helper.cancGenForAwait.toArray([COMPLETE === 'yes' ? Promise.resolve(5) : gate]);\n    } else {\n      let pulls = 0;\n      const source = {\n        [Symbol.asyncIterator]() { return this; },\n        next() {\n          log.push('inner-next');\n          if (COMPLETE === 'yes') return Promise.resolve(pulls++ ? { done: true } : { done: false, value: 7 });\n          return gate;\n        },\n        return() { log.push('inner-return'); return Promise.resolve({ done: true }); },\n      };\n      yield* helper.cancGenDelegate(source);\n    }\n    log.push(after);\n  } finally {\n    log.push('outer-finally');\n  }\n}, { asyncCancel: true });\nconst it = co();\nif (COMPLETE === 'yes') {\n  let result = await it.next();\n  if (KIND === 'delegate') { assert.equal(result.value, 7); result = await it.next(); }\n  assert.equal(result.done, true);\n  assert.ok(log.includes(after));\n} else {\n  const step = it.next();\n  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));\n  assert.ok(log.includes('start'), 'producer not started ' + JSON.stringify(log));\n  if (KIND === 'forAwait') assert.ok(log.includes('callback1'));\n  if (KIND === 'delegate') assert.ok(log.includes('inner-next'));\n  const draining = step.cancel();\n  assert.ok(draining && typeof draining.then === 'function', 'cleanup not awaitable');\n  const result = await Promise.resolve(step).then(() => 'resolved', (error) =>\n    error && error.name === 'CancelError' ? 'canceled' : 'wrong rejection');\n  await draining;\n  assert.equal(result, 'canceled', 'active next must cancel');\n  if (KIND === 'delegate') assert.equal(log.filter((v) => v === 'inner-return').length, 1);\n  assert.equal(log.includes(after), false, 'post-body continuation ' + JSON.stringify(log));\n  const expectedTrace = KIND === 'forAwait' ? ['start','callback1','outer-finally'] : KIND === 'toArray' ? ['start','outer-finally'] : ['start','inner-next','inner-return','outer-finally'];\n  assert.deepEqual(log, expectedTrace, 'canceled helper trace must be exact');\n}\nassert.equal(log.filter((v) => v === 'outer-finally').length, 1);\nconsole.log('PASS physical ' + FORMAT + ' ' + KIND + ' ' + JSON.stringify(log));\nclearTimeout(watchdog);\n";

function npmCommand(args: string[], cwd: string): string {
  const shell = process.platform === 'win32';
  const argv = shell ? args.map((arg) => (/[\s"]/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg)) : args;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_userconfig: path.join(owned, 'empty-npmrc'),
    NODE_OPTIONS: '',
  };
  delete env.npm_config_allow_scripts;
  const result = spawnSync(npm, argv, {
    cwd,
    shell,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
    env,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, 'npm ' + args.join(' ') + ': ' + result.stdout + '\n' + result.stderr);
  return result.stdout.trim();
}

function run(format: string, driver: string, helper: string, kind: string, completion = false) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', PROBE], {
    cwd: owned,
    encoding: 'utf8',
    timeout: 9000,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      FORMAT: format,
      DRIVER: installed(driver, 'coroutine'),
      HELPER: installed(helper, 'coroutine'),
      KIND: kind,
      COMPLETE: completion ? 'yes' : 'no',
    },
  });
}

beforeAll(() => {
  fs.rmSync(owned, { recursive: true, force: true });
  fs.mkdirSync(tar, { recursive: true });
  fs.writeFileSync(path.join(owned, 'empty-npmrc'), '');
  const expectedVersions = new Map(
    ['canc-promise', 'canc-coroutine'].map((workspace) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'packages', workspace, 'package.json'), 'utf8'));
      return [manifest.name, manifest.version] as const;
    }),
  );
  const packs = ['canc-promise', 'canc-coroutine'].map((name) => {
    const filename = npmCommand(
      ['pack', '--ignore-scripts', '--pack-destination', tar],
      path.join(repo, 'packages', name),
    )
      .split(/\r?\n/)
      .pop()!;
    const result = path.join(tar, filename);
    assert.ok(fs.existsSync(result), 'candidate artifact missing: ' + result);
    return result;
  });
  for (const copy of ['A', 'B', 'historical']) {
    const prefix = path.join(owned, copy);
    fs.mkdirSync(prefix, { recursive: true });
    npmCommand(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-save',
        '--no-package-lock',
        '--legacy-peer-deps',
        ...packs,
      ],
      prefix,
    );
    for (const name of ['promise', 'coroutine']) {
      const dir = installed(copy, name);
      assert.ok(!fs.lstatSync(dir).isSymbolicLink(), 'must not be a workspace symlink');
      assert.ok(
        fs.realpathSync.native(dir).toLowerCase().includes('p104d-gen-unwind'),
        'must resolve into owned fixture',
      );
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      assert.equal(manifest.name, '@cancjs/' + name);
      assert.equal(manifest.version, expectedVersions.get(manifest.name));
      console.log('physical ' + copy + ' ' + name + ' ' + dir);
    }
  }
  assert.notEqual(installed('A', 'coroutine'), installed('B', 'coroutine'));
  for (const entry of ['gen.cjs', 'gen.mjs']) {
    const filename = path.join(installed('historical', 'coroutine'), 'dist', entry);
    const source = fs.readFileSync(filename, 'utf8');
    assert.equal(source.split('@cancjs/coroutine:genReturnUnwind').length - 1, 1);
    fs.writeFileSync(
      filename,
      source.replace('@cancjs/coroutine:genReturnUnwind', '@cancjs/coroutine:GenReturnUnwind'),
    );
  }
});

const formats = ['CJS', 'ESM'];
const kinds = ['forAwait', 'toArray', 'delegate'];
const matching = [
  ['A', 'A'],
  ['A', 'B'],
  ['B', 'A'],
];
const mismatched = [
  ['A', 'historical'],
  ['historical', 'A'],
];

describe.each(formats)('installed generator unwind %s', (format) => {
  it.each(matching.flatMap(([driver, helper]) => kinds.map((kind) => [driver, helper, kind])))(
    'stops canceled driver %s / helper %s / %s',
    (driver, helper, kind) => {
      const result = run(format, driver, helper, kind);
      assert.equal(result.error, undefined, String(result.error));
      assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
      assert.ok(result.stdout.includes('PASS physical ' + format + ' ' + kind));
      console.log(result.stdout.trim());
    },
  );

  it.each(mismatched.flatMap(([driver, helper]) => kinds.map((kind) => [driver, helper, kind])))(
    'detects old-key continuation driver %s / helper %s / %s',
    (driver, helper, kind) => {
      const result = run(format, driver, helper, kind);
      assert.equal(result.error, undefined, String(result.error));
      assert.notEqual(result.status, 0, result.stdout);
      assert.ok(result.stderr.includes('post-body continuation'), result.stderr);
      console.log('PASS expected old-key mismatch ' + format + ' ' + kind + ' ' + driver + '/' + helper);
    },
  );

  it.each(kinds)('completes %s without cancellation', (kind) => {
    const result = run(format, 'A', 'B', kind, true);
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
  });
});
