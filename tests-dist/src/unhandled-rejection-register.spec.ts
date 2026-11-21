import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const distUnhandled = path.resolve(__dirname, '../../packages/canc-unhandled-rejection/dist/register.cjs');

if (!fs.existsSync(distUnhandled)) {
  throw new Error('Run "npm run build" before "npm run test:dist"');
}

const repoRoot = path.resolve(__dirname, '../..');

// a callback that never fires exits 0 silently, so completion is a printed marker
const DONE = 'DONE';

function runCjs(code: string): void {
  const stdout = execFileSync(
    process.execPath,
    [
      '-e',
      `(async () => { ${code}; process.stdout.write('${DONE}'); })().catch((err) => { console.error(err); process.exit(1); });`,
    ],
    { cwd: repoRoot, encoding: 'utf8', timeout: 20000 },
  );
  expect(stdout).toBe(DONE);
}

function runEsm(code: string): void {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `${code}\nprocess.stdout.write('${DONE}');`],
    { cwd: repoRoot, encoding: 'utf8', timeout: 20000 },
  );
  expect(stdout).toBe(DONE);
}

// resolves once the first callback fires, so no timers are needed to wait for the event
const callbackProbe = `
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
  const calls = [];
  const probe = (label) => {
    let fire;
    const fired = new Promise((resolve) => { fire = resolve; });
    return {
      fired,
      onUnhandledRejection: (reason) => {
        calls.push(label + ':' + reason.message);
        fire();
      },
    };
  };
  const count = () => process.listenerCount('unhandledRejection');
`;

describe('unhandled-rejection built entry points share one handler (CommonJS)', () => {
  it('a side-effect import plus register with a callback leaves one listener that calls the callback', () => {
    runCjs(`
      ${callbackProbe}
      const assert = require('node:assert/strict');
      require('@cancjs/unhandled-rejection/register');
      assert.equal(count(), 1);
      const { register } = require('@cancjs/unhandled-rejection');
      const first = probe('first');
      register(first);
      assert.equal(count(), 1);
      Promise.reject(new Error('real failure'));
      await first.fired;
      assert.deepEqual(calls, ['first:real failure']);
    `);
  });

  it('unregister removes the listener the side-effect import installed', () => {
    runCjs(`
      const assert = require('node:assert/strict');
      require('@cancjs/unhandled-rejection/register');
      assert.equal(process.listenerCount('unhandledRejection'), 1);
      require('@cancjs/unhandled-rejection').unregister();
      assert.equal(process.listenerCount('unhandledRejection'), 0);
    `);
  });

  it('registering again warns once and the new callback wins', () => {
    runCjs(`
      ${callbackProbe}
      const assert = require('node:assert/strict');
      const { register } = require('@cancjs/unhandled-rejection');
      const first = probe('first');
      const second = probe('second');
      register(first);
      assert.equal(warnings.length, 0);
      register(second);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /already registered/);
      assert.equal(count(), 1);
      Promise.reject(new Error('real failure'));
      await second.fired;
      assert.deepEqual(calls, ['second:real failure']);
    `);
  });

  it('the register entry holds no registration list of its own', () => {
    const source = fs.readFileSync(distUnhandled, 'utf8');
    expect(source).not.toContain('registrations');
    expect(source).toContain("require('@cancjs/unhandled-rejection')");
  });
});

describe('unhandled-rejection built entry points share one handler (ESM and CommonJS together)', () => {
  it('an ESM side-effect import plus register with a callback leaves one listener', () => {
    runEsm(`
      ${callbackProbe}
      import assert from 'node:assert/strict';
      import '@cancjs/unhandled-rejection/register';
      import { register } from '@cancjs/unhandled-rejection';
      assert.equal(count(), 1);
      const first = probe('first');
      register(first);
      assert.equal(count(), 1);
      Promise.reject(new Error('real failure'));
      await first.fired;
      assert.deepEqual(calls, ['first:real failure']);
    `);
  });

  it('the ESM copy and the CommonJS copy of the package share one handler', () => {
    runEsm(`
      ${callbackProbe}
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import '@cancjs/unhandled-rejection/register';
      const cjs = createRequire(import.meta.url)('@cancjs/unhandled-rejection');
      assert.equal(count(), 1);
      const first = probe('first');
      cjs.register(first);
      assert.equal(warnings.length, 1);
      assert.equal(count(), 1);
      Promise.reject(new Error('real failure'));
      await first.fired;
      assert.deepEqual(calls, ['first:real failure']);
      cjs.unregister();
      assert.equal(count(), 0);
    `);
  });
});

describe('unhandled-rejection built copies in separate realms of one process', () => {
  // each call evaluates the CommonJS build in its own vm context while sharing the one process
  const loadCopy = `
    const vm = require('node:vm');
    const fs = require('node:fs');
    const path = require('node:path');
    const file = path.resolve('packages/canc-unhandled-rejection/dist/index.cjs');
    const loadCopy = () => {
      const context = vm.createContext({ process, console, setImmediate, setTimeout, clearTimeout });
      const mod = { exports: {} };
      vm.runInContext('(function (exports, require, module) {' + fs.readFileSync(file, 'utf8') + '\\n})', context, { filename: file })(
        mod.exports,
        require,
        mod,
      );
      return mod.exports;
    };
    const a = loadCopy();
    const b = loadCopy();
    assert.notEqual(a.register, b.register);
  `;

  it('registering from both realms leaves one listener and the later callback fires', () => {
    runCjs(`
      ${callbackProbe}
      const assert = require('node:assert/strict');
      ${loadCopy}
      const first = probe('first');
      const second = probe('second');
      a.register(first);
      b.register(second);
      assert.equal(count(), 1);
      Promise.reject(new Error('real failure'));
      await second.fired;
      assert.deepEqual(calls, ['second:real failure']);
    `);
  });

  it('unregister() from one realm removes the listener the other realm installed', () => {
    runCjs(`
      const assert = require('node:assert/strict');
      ${loadCopy}
      a.register();
      assert.equal(process.listenerCount('unhandledRejection'), 1);
      b.unregister();
      assert.equal(process.listenerCount('unhandledRejection'), 0);
    `);
  });

  it('two realms with no callback still crash on a real error instead of swallowing it', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
          const assert = require('node:assert/strict');
          ${loadCopy}
          console.warn = () => {};
          a.register();
          b.register();
          Promise.reject(new Error('real failure'));
        `,
      ],
      { cwd: repoRoot, encoding: 'utf8', timeout: 20000 },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('real failure');
  });
});

describe.each(['umd.js', 'umd.min.js'])('unhandled-rejection UMD builds share one handler (%s)', (variant) => {
  const packagesDir = path.resolve(__dirname, '../../packages');

  // classic scripts in a bare context, with a fake event target that tracks live listeners
  function createScope(bundles: string[]): vm.Context {
    const scope = vm.createContext({ console: { warn() {} } });
    vm.runInContext(
      `globalThis.live = [];
       globalThis.addEventListener = function (type, fn) { live.push(fn); };
       globalThis.removeEventListener = function (type, fn) { live.splice(live.indexOf(fn), 1); };`,
      scope,
    );
    for (const bundle of bundles) {
      const [pkg, base] = bundle.split('/');
      const file = path.join(packagesDir, `canc-${pkg}/dist/${base}.${variant}`);
      vm.runInContext(fs.readFileSync(file, 'utf8'), scope, {
        filename: file,
      });
    }
    return scope;
  }

  it('the register bundle needs the index bundle loaded first', () => {
    expect(() => createScope(['promise/index', 'unhandled-rejection/register'])).toThrow(/register/);
    expect(() => createScope(['promise/index', 'unhandled-rejection/register', 'unhandled-rejection/index'])).toThrow(
      /register/,
    );
  });

  it('the register bundle after the index bundle installs one listener', () => {
    const scope = createScope(['promise/index', 'unhandled-rejection/index', 'unhandled-rejection/register']);

    expect(vm.runInContext('live.length', scope)).toBe(1);
  });

  it('the index and register bundles loaded together keep one listener after register with a callback', () => {
    const scope = createScope(['promise/index', 'unhandled-rejection/index', 'unhandled-rejection/register']);

    expect(vm.runInContext('live.length', scope)).toBe(1);
    const result = vm.runInContext(
      `(function () {
        var seen = [];
        canc_unhandled_rejection.register({ onUnhandledRejection: function (reason) { seen.push(reason.message); } });
        live[0]({ reason: new Error('real failure'), preventDefault: function () {} });
        return [live.length, seen.join()];
      })()`,
      scope,
    );

    expect(Array.from(result)).toEqual([1, 'real failure']);
  });
});
