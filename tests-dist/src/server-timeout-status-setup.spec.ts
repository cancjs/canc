import { spawnSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const probe = String.raw`
const assert = require('node:assert/strict');
const [adapter, mode, format] = process.argv.slice(1);
const load = name => format === 'esm' ? import(name) : Promise.resolve(require(name));
const invalid = [
  ['199', { ms: 1, status: 199 }],
  ['600', { ms: 1, status: 600 }],
  ['NaN', { ms: 1, status: NaN }],
  ['200.5', { ms: 1, status: 200.5 }],
  ['429.1', { ms: 1, status: 429.1 }],
  ['Infinity', { ms: 1, status: Infinity }],
  ['string', { ms: 1, status: '429' }],
  ['bad-header', { ms: 1, headers: { 'Bad Name': 'ok' } }],
];
async function main() {
  const canc = await load('@cancjs/server-' + adapter);
  let calls = 0;
  const handler = () => { calls++; };
  const fastify = adapter === 'fastify' ? (await load('fastify')).default ?? require('fastify') : undefined;
  async function setup(timeout) {
    const options = { timeout };
    if (mode === 'plugin') {
      const app = fastify();
      try {
        app.register(canc.cancelPlugin, options);
        await app.ready();
      } finally {
        await app.close();
      }
    } else if (mode === 'middleware') {
      canc.cancelMiddleware(options);
    } else {
      canc[mode](handler, options);
    }
  }
  const failures = [];
  for (const [label, timeout] of invalid.concat([
    ['newline', { ms: 1, headers: { 'X-Test': 'bad\nvalue' } }],
    ['disabled-header', { ms: Infinity, headers: { 'Bad Name': 'ok' } }],
    ['disabled-status', { ms: -1, status: 600 }],
  ])) {
    const kind = timeout.headers ? TypeError : RangeError;
    let error;
    try { await setup(timeout); } catch (e) { error = e; }
    console.log('SETUP', adapter, mode, format, label, error?.constructor.name ?? 'ACCEPTED', error?.message ?? '');
    if (!(error instanceof kind)) failures.push(label + ': expected ' + kind.name);
    if (kind === RangeError && error?.message !== 'timeout status (' + timeout.status + ') must be an integer from 200 to 599') {
      failures.push(label + ': wrong message');
    }
  }
  for (const timeout of [undefined, 10, { ms: -1, status: 200 }, { ms: 10, status: 429 }, { ms: 10, status: 599 }]) {
    let error;
    try { await setup(timeout); } catch (e) { error = e; }
    console.log('CONTROL', adapter, mode, format, JSON.stringify(timeout), error?.message ?? 'ACCEPTED');
    if (adapter === 'koa' && timeout?.status === 599) {
      if (!(error instanceof RangeError) || !error.message.includes('is not a status koa answers with')) failures.push('koa native 599');
    } else if (error) failures.push('valid option rejected: ' + error.message);
  }
  assert.equal(calls, 0, 'no handler call during setup');
  assert.deepEqual(failures, []);
  await wire(canc, fastify);
}

async function wire(canc, fastify) {
  const http = require('node:http');
  const { once } = require('node:events');
  const reasons = [];
  const options = {
    timeout: { ms: 25, status: 429, message: 'private deadline', headers: { 'Retry-After': '1' } },
    onTimeout: reason => reasons.push(reason),
  };
  const never = () => new Promise(() => {});
  let app, server;
  try {
    if (adapter === 'node') {
      server = http.createServer(canc.cancelableHandler(never, options));
    } else if (adapter === 'express') {
      const express = (await load('express')).default ?? require('express');
      app = express();
      if (mode === 'middleware') app.use(canc.cancelMiddleware(options));
      app.get('/', canc.cancelableHandler(never, mode === 'middleware' ? undefined : options));
      app.use(canc.cancelErrorHandler());
      server = http.createServer(app);
    } else if (adapter === 'koa') {
      const Koa = (await load('koa')).default ?? require('koa');
      app = new Koa();
      app.silent = true;
      if (mode === 'middleware') app.use(canc.cancelMiddleware(options));
      app.use(canc.cancelableHandler(never, mode === 'middleware' ? undefined : options));
      server = http.createServer(app.callback());
    } else if (adapter === 'hono') {
      const { Hono } = await load('hono');
      const { serve } = await load('@hono/node-server');
      app = new Hono();
      if (mode === 'middleware') app.use(canc.cancelMiddleware(options));
      app.get('/', canc.cancelableHandler(never, mode === 'middleware' ? undefined : options));
      app.onError(canc.cancelErrorHandler());
      server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    } else {
      app = fastify();
      await app.register(canc.cancelPlugin, mode === 'plugin' ? options : {});
      if (mode === 'cancelableHook') {
        app.get('/', { preHandler: canc.cancelableHook(never, options) }, () => ({ unexpected: true }));
      } else if (mode === 'cancelablePreParsing') {
        app.post('/', { preParsing: canc.cancelablePreParsing(never, options) }, () => ({ unexpected: true }));
      } else {
        app.get('/', canc.cancelableHandler(never, mode === 'plugin' ? undefined : options));
      }
      await app.listen({ host: '127.0.0.1', port: 0 });
      server = app.server;
    }
    if (!server.listening) {
      const listening = once(server, 'listening');
      if (adapter !== 'hono') server.listen(0, '127.0.0.1');
      await listening;
    }
    const result = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: server.address().port, path: '/',
        method: mode === 'cancelablePreParsing' ? 'POST' : 'GET',
        headers: { Connection: 'close' },
      }, res => {
        const chunks = [];
        res.on('data', data => chunks.push(data));
        res.on('error', reject);
        res.on('end', () => {
          clearTimeout(watchdog);
          resolve({ status: res.statusCode, retryAfter: res.headers['retry-after'], body: Buffer.concat(chunks).toString() });
        });
      });
      const watchdog = setTimeout(() => req.destroy(new Error('NO_END')), 1500);
      req.on('error', error => { clearTimeout(watchdog); reject(error); });
      req.end();
    });
    console.log('WIRE', adapter, mode, format, JSON.stringify(result));
    assert.equal(result.status, 429);
    assert.equal(result.retryAfter, '1');
    if (adapter === 'fastify' || adapter === 'koa') assert.ok(result.body.length > 0);
    else assert.equal(result.body, '');
    assert.equal(reasons.length, 1);
    assert.equal(reasons[0].message, 'Request canceled');
    assert.equal(reasons[0].cause.message, 'private deadline');
    assert.equal(Object.getOwnPropertyDescriptor(reasons[0], 'cause').enumerable, false);
    assert.equal(reasons[0].timedOut, true);
  } finally {
    if (adapter === 'fastify' && app) await app.close();
    else if (server?.listening) {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`;

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

describe.each(['cjs', 'esm'])('timeout options at setup (%s)', (format) => {
  it.each(modes)('%s %s', (adapter, mode) => {
    const result = spawnSync(process.execPath, ['-e', probe, adapter, mode, format], {
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
    expect(result.stdout.match(/^SETUP /gm)).toHaveLength(11);
    expect(result.stdout.match(/^CONTROL /gm)).toHaveLength(5);
    expect(result.stdout).toContain('WIRE ' + adapter + ' ' + mode + ' ' + format);
  });
});
