import { spawnSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const probe = String.raw`
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const label = process.argv[1];
const format = process.argv[2];
const load = name => format === 'esm' ? import(name) : Promise.resolve(require(name));
const never = () => new Promise(() => {});
const deadline = headers => ({ timeout: { ms: 20, status: 429, headers } });

async function request(server, pathname = '/', method = 'GET') {
  return new Promise(resolve => {
    const events = [];
    let socket;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      resolve({ events, socket });
    };
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: pathname, method }, res => {
      events.push(['head', res.statusCode, res.headers['content-length'] ?? null, res.headers['retry-after'] ?? null]);
      res.on('data', buf => events.push(['data', buf.length]));
      res.on('end', () => { events.push(['end']); finish(); });
      res.on('error', err => { events.push(['response-error', err.code]); finish(); });
    });
    req.on('socket', value => { socket = value; });
    req.on('error', err => { events.push(['request-error', err.code]); finish(); });
    const watchdog = setTimeout(() => {
      events.push(['watchdog', 'NO_END']);
      req.destroy();
      finish();
    }, 750);
    req.end();
  });
}

async function main() {
  const [adapter] = label.split('-');
  const canc = await load('@cancjs/server-' + adapter);
  const optionLength = label.includes('-option') ? { 'Content-Length': '7', 'Retry-After': '1' } : undefined;
  const routeLength = label.includes('-route') || label.includes('-fallback') || label.includes('-head')
    || label.includes('-stream') || label.includes('-native') ? '7' : label.includes('-zero') ? '0' : undefined;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let server;
  let shutdown;
  let app;
  const expectStatus = label.includes('-fallback') || label === 'express-native' ? 500 : label.includes('-shutdown') ? 507 : 429;
  if (adapter === 'node') {
    const handler = canc.cancelableHandler((_req, res) => {
      if (routeLength !== undefined) res.setHeader('Content-Length', routeLength);
      if (label.includes('-fallback')) throw new Error('expected handler failure');
      if (label.includes('-stream')) res.write('cut');
      entered();
      return never();
    }, label.includes('-shutdown') ? undefined : deadline(optionLength));
    server = http.createServer((req, res) => {
      if (req.url === '/ok') {
        res.setHeader('Content-Length', '2');
        res.end('OK');
      } else handler(req, res);
    });
    if (label.includes('-shutdown')) shutdown = canc.createShutdown(server);
  } else if (adapter === 'express') {
    const express = (await load('express')).default ?? require('express');
    app = express();
    app.get('/ok', (_req, res) => res.send('OK'));
    app.all('/', canc.cancelableHandler((_req, res) => {
      if (routeLength !== undefined) res.set('Content-Length', routeLength);
      if (label.includes('-native')) throw new Error('expected native failure');
      if (label.includes('-stream')) res.write('cut');
      return never();
    }, deadline(optionLength)));
    if (!label.includes('-native')) app.use(canc.cancelErrorHandler());
    server = http.createServer(app);
  } else if (adapter === 'hono') {
    const { Hono } = await load('hono');
    const { serve } = await load('@hono/node-server');
    app = new Hono();
    app.get('/ok', c => c.text('OK'));
    app.all('/', canc.cancelableHandler(c => {
      if (routeLength !== undefined) c.header('Content-Length', routeLength);
      return never();
    }, deadline(optionLength)));
    app.onError(canc.cancelErrorHandler());
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  } else if (adapter === 'koa') {
    const Koa = (await load('koa')).default ?? require('koa');
    app = new Koa();
    app.use(canc.cancelableHandler(ctx => {
      ctx.set('Content-Length', '7');
      return never();
    }, deadline()));
    server = http.createServer(app.callback());
  } else {
    const fastify = (await load('fastify')).default ?? require('fastify');
    app = fastify();
    await app.register(canc.cancelPlugin);
    app.get('/', canc.cancelableHandler((_req, reply) => {
      reply.header('Content-Length', '7');
      return never();
    }, deadline()));
    await app.listen({ host: '127.0.0.1', port: 0 });
    server = app.server;
  }

  const connectionPool = http.globalAgent;
  connectionPool.keepAlive = true;
  connectionPool.maxSockets = 1;
  let shutdownResult;
  try {
    if (!server.listening) {
      const listening = once(server, 'listening');
      if (adapter !== 'hono') server.listen(0, '127.0.0.1');
      await listening;
    }
    const response = request(server, '/', label.includes('-head') ? 'HEAD' : 'GET');
    if (shutdown) {
      await started;
      shutdownResult = shutdown({ cancelAfter: 0, closeAfter: 190, status: 507, headers: { 'Content-Length': '7' } });
    }
    const result = await response;
    console.log('WIRE', format, label, JSON.stringify(result.events));
    const [head] = result.events;
    const bytes = result.events.filter(event => event[0] === 'data').reduce((n, event) => n + event[1], 0);
    const ended = result.events.some(event => event[0] === 'end');
    if (label.includes('-stream')) {
      assert.equal(head[1], 200);
      assert.equal(bytes, 3);
      assert.equal(ended, false);
      assert.ok(result.events.some(event => event[0] === 'response-error' || event[0] === 'request-error'));
    } else {
      assert.equal(head[1], expectStatus);
      assert.equal(ended, true, 'response must reach end');
      if (label.includes('-native') || adapter === 'koa' || adapter === 'fastify') {
        assert.ok(bytes > 0);
        assert.equal(Number(head[2]), bytes);
      } else {
        assert.equal(bytes, 0);
        if (!label.includes('-head')) {
          assert.ok(head[2] === null || head[2] === '0', 'empty response must not advertise bytes');
        }
        if (optionLength) assert.equal(head[3], '1');
        if (!shutdown && !label.includes('-head')) {
          const next = await request(server, '/ok');
          console.log('REUSE', format, label, JSON.stringify(next.events), next.socket === result.socket);
          assert.equal(next.events[0][1], 200);
          assert.equal(next.events[0][2], '2');
          assert.equal(next.events.some(event => event[0] === 'end'), true);
          assert.equal(next.socket, result.socket, 'same keepalive socket');
        }
      }
    }
    if (shutdownResult) {
      const result = await shutdownResult;
      assert.equal(result.canceled, 1);
      assert.equal(result.timedOut, false);
    }
  } finally {
    connectionPool.destroy();
    if (shutdownResult) await shutdownResult;
    if (adapter === 'fastify') await app.close();
    else if (server.listening) {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
`;

const cases = [
  'node-route429',
  'node-option429',
  'node-fallback500',
  'express-route429',
  'express-option429',
  'hono-route429',
  'hono-option429',
  'node-shutdown507',
  'node-head',
  'node-zero',
  'node-absent',
  'node-stream',
  'express-stream',
  'express-native',
  'koa-native429',
  'fastify-native429',
];

describe.each(['cjs', 'esm'])('empty HTTP response framing (%s)', (format) => {
  it.each(cases)('%s', (label) => {
    const result = spawnSync(process.execPath, ['-e', probe, label, format], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 4000,
    });
    const output = result.stdout;
    console.log(output.trim());
    expect({
      status: result.status,
      error: result.error?.message,
      stderr: result.status === 0 ? '' : result.stderr,
    }).toEqual({ status: 0, error: undefined, stderr: '' });
    expect(output).toContain('WIRE ' + format + ' ' + label);
    if (
      !label.includes('-shutdown') &&
      !label.includes('-head') &&
      !label.includes('-stream') &&
      !label.includes('-native')
    ) {
      expect(output).toContain('REUSE ' + format + ' ' + label);
    }
  });
});
