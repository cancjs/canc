import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import ts from 'typescript';

const repoRoot = path.resolve(__dirname, '../..');

// Executed in an isolated child against the built package, not the TypeScript source aliases.
const probe = String.raw`
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const [format, fixture, label] = process.argv.slice(1);
const load = name => format === 'esm' ? import(name) : Promise.resolve(require(name));
const { es5Task } = require(fixture);
const noop = () => {};
assert.equal(Object.prototype.toString.call(es5Task), '[object Function]');
const unhandled = [];
const onUnhandled = reason => unhandled.push(String(reason));
process.on('unhandledRejection', onUnhandled);

async function inject(app, options) {
  let timer;
  try {
    const res = await Promise.race([
      app.inject(options),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('NO_END ' + JSON.stringify(options))), 1000); }),
    ]);
    console.log('INJECT', label, format, JSON.stringify(options), res.statusCode, res.body);
    return { status: res.statusCode, body: JSON.parse(res.body) };
  } finally { clearTimeout(timer); }
}

async function main() {
  const canc = await load('@cancjs/server-fastify');
  const Fastify = (await load('fastify')).default ?? require('fastify');
  const warnings = [];
  const create = () => Fastify({ logger: { level: 'warn', stream: { write: line => warnings.push(line) } } });
  async function use(options, run) {
    const app = create();
    try {
      if (options !== false) await app.register(canc.cancelPlugin, options);
      return await run(app);
    } finally { await app.close(); }
  }

  if (label === 'routes') {
    await use({}, async app => {
      const calls = [], steps = [], finals = [];
      const factory = mode => es5Task(() => steps.push(mode), { mode }, () => finals.push(mode));
      app.get('/es5', function () { calls.push('es5'); return factory('es5'); });
      app.get('/native', new Proxy(function* () {
        try { steps.push('native'); yield Promise.resolve(); return { mode: 'native' }; }
        finally { finals.push('native'); }
      }, { apply(target, receiver, args) { calls.push('native'); return Reflect.apply(target, receiver, args); } }));
      app.get('/mixed/:mode', function (request, reply) {
        assert.equal(this, app); assert.equal(arguments.length, 2); assert.equal(reply.request, request);
        const { mode } = request.params;
        calls.push(mode);
        return mode === 'gen' ? factory(mode) : mode === 'promise' ? Promise.resolve({ mode }) : { mode };
      });
      for (const [uri, mode] of [
        ['/es5', 'es5'], ['/native', 'native'], ['/mixed/plain', 'plain'],
        ['/mixed/gen', 'gen'], ['/mixed/promise', 'promise'], ['/mixed/plain', 'plain'],
      ]) assert.deepEqual(await inject(app, uri), { status: 200, body: { mode } });
      assert.deepEqual(calls, ['es5', 'native', 'plain', 'gen', 'promise', 'plain']);
      assert.deepEqual(steps, ['es5', 'native', 'gen']);
      assert.deepEqual(finals, steps);
      console.log('FACTORIES', JSON.stringify({ calls, steps, finals }));
    });
  } else if (label === 'request-hooks') {
    await use({}, async app => {
      const trail = [];
      let doneCalls = 0;
      app.get('/hooks', {
        onRequest: [
          function (req, reply, done) {
            assert.equal(this, app); assert.equal(arguments.length, 3); assert.equal(reply.request, req);
            trail.push('request-cb'); doneCalls++; done();
          },
          function* (req, reply) {
            assert.equal(this, app); assert.equal(reply.request, req);
            trail.push('request-gen'); yield Promise.resolve(); trail.push('request-end');
          },
        ],
        preValidation: function (req, reply, done) {
          assert.equal(this, app); assert.equal(arguments.length, 3); assert.equal(reply.request, req); assert.equal(typeof done, 'function');
          trail.push('validation-factory');
          return es5Task(() => trail.push('validation-step'), undefined, () => trail.push('validation-final'));
        },
        preHandler: [
          function (req, reply) {
            assert.equal(this, app); assert.equal(reply.request, req);
            return es5Task(() => trail.push('handler-gen'), undefined, () => trail.push('handler-end'));
          },
          function (_req, _reply, done) { trail.push('handler-cb'); doneCalls++; done(); },
        ],
      }, () => { trail.push('route'); return { via: 'hook' }; });
      assert.deepEqual(await inject(app, '/hooks'), { status: 200, body: { via: 'hook' } });
      assert.deepEqual(trail, [
        'request-cb', 'request-gen', 'request-end', 'validation-factory', 'validation-step',
        'validation-final', 'handler-gen', 'handler-end', 'handler-cb', 'route',
      ]);
      assert.equal(doneCalls, 2);
      console.log('HOOKS', JSON.stringify({ trail, doneCalls }));
    });
  } else if (label === 'preParsing') {
    await use({}, async app => {
      const trail = [];
      let doneCalls = 0;
      app.post('/parse', {
        preParsing: [
          function (req, reply, payload, done) {
            assert.equal(this, app); assert.equal(arguments.length, 4); assert.equal(reply.request, req);
            trail.push('parser-cb'); doneCalls++; done(null, payload);
          },
          async function (req, reply, payload) {
            assert.equal(this, app); assert.equal(reply.request, req);
            trail.push('parser-promise'); return payload;
          },
          function* (req, reply, payload) {
            assert.equal(this, app); assert.equal(reply.request, req);
            trail.push('parser-gen'); yield Promise.resolve(); return payload;
          },
          function (req, reply, payload, done) {
            assert.equal(this, app); assert.equal(arguments.length, 4); assert.equal(reply.request, req);
            assert.equal(typeof payload.pipe, 'function'); assert.equal(typeof done, 'function');
            trail.push('parser-factory');
            return es5Task(() => trail.push('parser-step'), Readable.from(['{"hello":3}']), () => trail.push('parser-final'));
          },
        ],
      }, req => ({ payload: req.body }));
      assert.deepEqual(await inject(app, { method: 'POST', url: '/parse', payload: { hello: 1 } }),
        { status: 200, body: { payload: { hello: 3 } } });
      assert.deepEqual(trail, ['parser-cb', 'parser-promise', 'parser-gen', 'parser-factory', 'parser-step', 'parser-final']);
      assert.equal(doneCalls, 1);
      console.log('PARSER', JSON.stringify({ trail, doneCalls }));
    });
  } else if (label === 'plain') {
    async function scenario(auto) {
      return use(auto ? {} : false, async app => {
        let reads = 0, pulls = 0, doneCalls = 0, thenCalls = 0, globalSteps = 0;
        app.addHook('onRequest', function (_req, _reply, done) {
          const value = es5Task(() => globalSteps++, undefined, noop);
          done();
          return value;
        });
        app.get('/object', () => ({ kind: 'object' }));
        app.get('/promise', async () => ({ kind: 'promise' }));
        app.get('/thenable', () => ({ then(resolve) { thenCalls++; resolve({ kind: 'thenable' }); } }));
        app.get('/array', () => [1, 2, 3]);
        app.get('/array-iterator', () => [1, 2][Symbol.iterator]());
        app.get('/getter', () => Object.defineProperty({ kind: 'getter' }, 'next', {
          enumerable: false, get() { reads++; throw Error('DO_NOT_TOUCH_NEXT'); },
        }));
        app.get('/iterator', () => ({
          kind: 'iterator', next() { pulls++; return { done: true }; }, [Symbol.iterator]() { pulls++; return this; },
        }));
        app.get('/proxy', () => new Proxy({ kind: 'proxy' }, { getOwnPropertyDescriptor(target, key) { if (key === 'next') throw Error('NO_DESCRIPTOR'); return Reflect.getOwnPropertyDescriptor(target, key); } }));
        app.get('/callback', { preHandler: function (req, reply, done) {
          assert.equal(this, app); assert.equal(arguments.length, 3); assert.equal(reply.request, req);
          doneCalls++; done();
        } }, () => ({ kind: 'callback' }));
        app.get('/throw', () => { throw Error('NATIVE_THROW'); });
        const results = [];
        for (const route of ['object','promise','thenable','array','array-iterator','getter','iterator','proxy','callback','throw']) {
          results.push(await inject(app, '/' + route));
        }
        assert.equal(reads, 0, 'getter reads'); assert.equal(pulls, 0, 'iterator pulls');
        assert.equal(doneCalls, 1); assert.equal(thenCalls, 1); assert.equal(globalSteps, 0);
        console.log('PLAIN', auto, JSON.stringify({ reads, pulls, doneCalls, thenCalls, globalSteps }));
        return results;
      });
    }
    const native = await scenario(false);
    assert.deepEqual(native.map(result => result.status), [200,200,200,200,200,200,200,200,200,500]);
    assert.equal(native[9].body.message, 'NATIVE_THROW');
    assert.deepEqual(await scenario(true), native);
  } else if (label === 'preabort') {
    for (const mode of ['native', 'es5', 'explicit']) {
      const controller = new AbortController();
      await use({ signal: controller.signal }, async app => {
        let factories = 0, steps = 0, finals = 0;
        const original = mode === 'native' ? function* () {
          try { steps++; yield Promise.resolve(); return { ok: true }; } finally { finals++; }
        } : function () { return es5Task(() => steps++, { ok: true }, () => finals++); };
        const route = new Proxy(original, { apply(target, receiver, args) { factories++; return Reflect.apply(target, receiver, args); } });
        app.get('/', mode === 'explicit' ? canc.cancelableHandler(route) : route);
        controller.abort('pre-aborted');
        const response = await inject(app, '/');
        console.log('PREABORT', mode, JSON.stringify({ factories, steps, finals, response }));
        assert.equal(response.status, 503);
        assert.equal(response.body.message, 'pre-aborted');
        assert.equal(factories, mode === 'explicit' ? 0 : 1);
        assert.equal(steps, 0); assert.equal(finals, 0);
      });
    }
  } else if (label === 'off') {
    const step = () => { throw Error('native iterator must not be driven'); };
    await use({ autoWrap: false }, async app => {
      app.get('/', () => es5Task(step, { ok: true }, noop));
      assert.deepEqual(await inject(app, '/'), { status: 200, body: {} });
    });
    const app = create();
    try {
      app.get('/early', () => es5Task(step, { ok: true }, noop));
      await app.register(canc.cancelPlugin);
      assert.deepEqual(await inject(app, '/early'), { status: 200, body: {} });
    } finally { await app.close(); }
  } else { throw Error('Unknown dispatch label: ' + label); }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
  assert.equal(warnings.filter(line => line.includes('FST_ERR_REP_ALREADY_SENT')).length, 0);
  console.log('PASS ES5', label, format);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.off('unhandledRejection', onUnhandled));
`;

const labels = ['routes', 'request-hooks', 'preParsing', 'plain', 'preabort', 'off'];
let temp: string;
let fixture: string;

beforeAll(() => {
  const tempRoot = path.join(tmpdir(), 'canc');
  mkdirSync(tempRoot, { recursive: true });
  temp = mkdtempSync(path.join(tempRoot, 'fastify-es5-'));
  fixture = path.join(temp, 'fixture.cjs');
  const source = readFileSync(path.join(repoRoot, 'tests-types/fixtures/common/server-fastify-es5-auto.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS },
  });
  expect(outputText).toContain('__generator');
  writeFileSync(fixture, outputText);
  console.log('ES5 compiler', ts.version, fixture);
});

afterAll(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
});

describe.each(['cjs', 'esm'])('built Fastify conditional generator dispatch (%s)', (format) => {
  it.each(labels)('%s', (label) => {
    const result = spawnSync(process.execPath, ['-e', probe, format, fixture, label], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 5000,
    });
    console.log(result.stdout.trim());
    expect({
      status: result.status,
      error: result.error?.message,
      stderr: result.status === 0 ? '' : result.stderr,
    }).toEqual({ status: 0, error: undefined, stderr: '' });
    expect(result.stdout).toContain('PASS ES5 ' + label + ' ' + format);
  });
});
