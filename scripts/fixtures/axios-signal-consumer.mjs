// Copied into an actual installed consumer by check-beta3-axios-signals.mjs.
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [format, version, mutant] = process.argv.slice(2);
assert.ok(['cjs', 'esm'].includes(format), 'invalid format');
assert.ok(['0.22.0', '1.16.0'].includes(version), 'invalid Axios version');
assert.ok(['none', 'no-ingress', 'no-close'].includes(mutant), 'invalid mutant');
const require = createRequire(import.meta.url);
const consumer = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const names = ['@cancjs/promise', '@cancjs/toolbox', '@cancjs/axios', 'axios'];
const entries = new Map();
for (const name of names) {
  const packageDir = path.join(consumer, 'node_modules', name);
  assert.equal(fs.lstatSync(packageDir).isSymbolicLink(), false, name + ' must not be linked');
  assert.equal(fs.realpathSync(packageDir), packageDir, name + ' physical package root');
  const required = fs.realpathSync(require.resolve(name));
  const resolved = format === 'cjs' ? required : fs.realpathSync(fileURLToPath(import.meta.resolve(name)));
  for (const entry of [required, resolved]) {
    const relative = path.relative(packageDir, entry);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), name + ' escaped consumer');
  }
  if (name.startsWith('@cancjs/')) {
    assert.equal(required, path.join(packageDir, 'dist', 'index.cjs'));
    assert.equal(resolved, path.join(packageDir, 'dist', 'index.' + (format === 'cjs' ? 'cjs' : 'mjs')));
  } else {
    const nativeEntry = version === '1.16.0' && format === 'cjs' ? path.join('dist', 'node', 'axios.cjs') : 'index.js';
    assert.equal(resolved, path.join(packageDir, nativeEntry));
    assert.equal(require('axios/package.json').version, version);
  }
  entries.set(name, resolved);
  console.log('REALPATH ' + name + ' require=' + required + ' ' + format + '=' + resolved);
}

const ax = format === 'cjs' ? require('axios') : (await import('axios')).default;
const canc = format === 'cjs' ? require('@cancjs/axios') : await import('@cancjs/axios');
const cpkg = format === 'cjs' ? require('@cancjs/promise') : await import('@cancjs/promise');
const toolbox = format === 'cjs' ? require('@cancjs/toolbox') : await import('@cancjs/toolbox');

assert.equal(ax.VERSION, version);
console.log('NATIVE axios ' + version + ' node ' + process.version + ' format ' + format);
assert.equal(typeof toolbox.cancelify, 'function');

const { wrapAxios } = canc;
const { CancelablePromise, isCancelError } = cpkg;
assert.equal(typeof wrapAxios, 'function');
assert.equal(typeof isCancelError, 'function');

const deferred = () => {
  let resolve;
  const promise = new Promise((release) => {
    resolve = release;
  });
  return { promise, resolve };
};

async function deadline(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('deadline: ' + label)), 2_500);
      }),
    ]);
  } catch (error) {
    throw new Error(label + ': ' + error.message, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

const records = [];
const waiters = new Map();
const sockets = new Map();
let nextSocket = 0;
const server = http.createServer((req, res) => {
  const requestPath = req.url.split('?')[0];
  const socket = req.socket;
  if (!sockets.has(socket)) sockets.set(socket, ++nextSocket);
  const record = {
    path: requestPath,
    id: records.length + 1,
    socketId: sockets.get(socket),
    req,
    res,
    socket,
    responseSocket: res.socket,
    close: deferred(),
    closed: false,
  };
  records.push(record);
  console.log('INGRESS ' + requestPath + ' response=' + record.id + ' socket=' + record.socketId);
  res.once('close', () => {
    if (mutant === 'no-close' && requestPath === '/hold/final-B') return;
    record.closed = true;
    console.log('CLOSE ' + record.path + ' response=' + record.id + ' socket=' + record.socketId);
    record.close.resolve(record);
  });
  const waiter = waiters.get(requestPath);
  if (waiter) {
    waiters.delete(requestPath);
    waiter.resolve(record);
  }
  if (requestPath.startsWith('/hold/')) return;
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  if (requestPath.startsWith('/stream/')) {
    res.write('chunk');
  } else {
    res.end('ok');
  }
});
server.on('connection', (socket) => {
  if (!sockets.has(socket)) sockets.set(socket, ++nextSocket);
});
const listening = deferred();
server.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
  listening.resolve(false);
});
server.listen(0, '127.0.0.1', () => listening.resolve(true));

let passed = 0;
try {
  assert.equal(await deadline(listening.promise, 'listen callback'), true);
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  const native = (config = {}) => ax.create({ baseURL, proxy: false, ...config });
  console.log('SERVER ' + baseURL);

  async function check(name, fn) {
    await fn();
    passed++;
    console.log('PASS ' + name);
  }

  function startIngress(requestPath, dispatch) {
    const before = records.length;
    assert.equal(
      records.some((record) => record.path === requestPath),
      false,
      'path already observed',
    );
    const waiter = deferred();
    waiters.set(requestPath, waiter);
    const cp = dispatch();
    return {
      cp,
      async ingress() {
        const record = await deadline(waiter.promise, 'missing real request callback ' + requestPath);
        assert.equal(records.length, before + 1, 'unexpected ingress count ' + requestPath);
        assert.equal(records[before], record, 'request-specific callback identity');
        assert.equal(record.path, requestPath);
        assert.equal(record.req.socket, record.socket);
        assert.equal(record.responseSocket, record.socket);
        return record;
      },
    };
  }

  async function closeOf(record) {
    const closed = await deadline(record.close.promise, 'missing held-response close observation ' + record.path);
    assert.equal(closed, record, 'wrong response close record');
    assert.equal(closed.res, record.res);
    assert.equal(closed.socket, record.socket);
    assert.equal(closed.closed, true);
  }

  async function rejectsCancel(cp, label) {
    const error = await deadline(
      cp.then(
        () => {
          throw new Error('unexpected success: ' + label);
        },
        (reason) => reason,
      ),
      label,
    );
    assert.equal(isCancelError(error), true, label);
    return error;
  }

  function noIngress(before, paths) {
    assert.equal(records.length, before, 'ingress count must remain unchanged');
    for (const requestPath of paths) {
      assert.equal(
        records.some((record) => record.path === requestPath),
        false,
        'unexpected ingress ' + requestPath,
      );
      console.log('NO INGRESS ' + requestPath + ' count=' + before);
    }
  }

  function nativeAbortMetadata(error) {
    if (version === '0.22.0') {
      // Its native HTTP Cancel does not expose final config or original signal reason.
      assert.equal(error.message, 'canceled');
      assert.equal(error.aborted, false);
      assert.equal(error.timedOut, false);
    } else {
      assert.equal(error.aborted, true);
    }
  }

  await check('physical public entries and HTTP success', async () => {
    assert.equal(entries.size, 4);
    const request = wrapAxios(native()).get('/ok/entry');
    assert.ok(request instanceof CancelablePromise);
    const response = await deadline(request, 'public entry request');
    assert.equal(response.status, 200);
    assert.equal(response.data, 'ok');
  });

  await check('default/request/null/undefined precedence', async () => {
    const a = new AbortController();
    a.abort('default');
    const api = wrapAxios(native({ signal: a.signal }));
    const b = new AbortController();
    const nulled = await deadline(api.get('/ok/null', { signal: null }), 'JS-null override');
    assert.equal(nulled.status, 200);
    const response = await deadline(api.get('/ok/request', { signal: b.signal }), 'per-request override');
    assert.equal(response.status, 200);
    const before = records.length;
    await rejectsCancel(api.get('/ok/inherit-omitted'), 'inherited omitted');
    await rejectsCancel(api.get('/ok/inherit-undefined', { signal: undefined }), 'inherited undefined');
    noIngress(before, ['/ok/inherit-omitted', '/ok/inherit-undefined']);
  });

  await check('A abort then B selected', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const gate = deferred();
    const entered = deferred();
    const raw = native({ signal: a.signal });
    raw.interceptors.request.use(async (config) => {
      entered.resolve();
      await gate.promise;
      return { ...config, signal: b.signal };
    });
    const cp = wrapAxios(raw).get('/ok/override-final');
    await deadline(entered.promise, 'native interceptor entered');
    a.abort('provisional');
    gate.resolve();
    assert.equal((await deadline(cp, 'A abort then B selected')).status, 200);
    assert.equal(b.signal.aborted, false);
  });

  await check('final replacement B abort closes HTTP response', async () => {
    const b = new AbortController();
    const raw = native();
    raw.interceptors.request.use((config) => ({ ...config, signal: b.signal }));
    const started = startIngress('/hold/final-B', () => wrapAxios(raw).get('/hold/final-B'));
    const record = await started.ingress();
    assert.equal(record.closed, false);
    b.abort();
    nativeAbortMetadata(await rejectsCancel(started.cp, 'final B abort'));
    await closeOf(record);
    assert.equal(record.res.writableEnded, false);
  });

  await check('retained external signal abort closes HTTP response', async () => {
    const a = new AbortController();
    const started = startIngress('/hold/external', () =>
      wrapAxios(native()).get('/hold/external', { signal: a.signal }),
    );
    const record = await started.ingress();
    a.abort();
    nativeAbortMetadata(await rejectsCancel(started.cp, 'external abort'));
    await closeOf(record);
    assert.equal(record.res.writableEnded, false);
  });

  await check('Canc cancel before native dispatch zero ingress', async () => {
    const gate = deferred();
    const entered = deferred();
    const settled = deferred();
    const raw = native();
    raw.interceptors.request.use(async (config) => {
      entered.resolve();
      await gate.promise;
      return config;
    });
    raw.interceptors.response.use(
      (response) => {
        settled.resolve({ response });
        return response;
      },
      (error) => {
        settled.resolve({ error });
        throw error;
      },
    );
    const before = records.length;
    const cp = wrapAxios(raw).get('/ok/pre-dispatch');
    await deadline(entered.promise, 'pre-dispatch interceptor entered');
    cp.cancel('owner cancel');
    await rejectsCancel(cp, 'pre-dispatch cancel');
    gate.resolve();
    const result = await deadline(settled.promise, 'native cancellation after gate release');
    assert.equal(ax.isCancel(result.error), true);
    noIngress(before, ['/ok/pre-dispatch']);
  });

  await check('Canc cancel after ingress closes retained HTTP response', async () => {
    const requestPath = '/hold/cp-cancel';
    const started = startIngress(requestPath, () => {
      // Negative control: prevent the named request from ever being dispatched.
      if (mutant === 'no-ingress') return new Promise(() => {});
      return wrapAxios(native()).get(requestPath);
    });
    const record = await started.ingress();
    started.cp.cancel('owner cancel');
    await rejectsCancel(started.cp, 'inflight cancel');
    await closeOf(record);
    assert.equal(record.res.writableEnded, false);
  });

  await check('deliberate config.signal replacement permits HTTP continuation', async () => {
    const gate = deferred();
    const entered = deferred();
    const raw = native();
    raw.interceptors.request.use(async (config) => {
      entered.resolve();
      await gate.promise;
      return { ...config, signal: new AbortController().signal };
    });
    const requestPath = '/ok/intentionally-replaced';
    const started = startIngress(requestPath, () => wrapAxios(raw).get(requestPath));
    await deadline(entered.promise, 'replacement interceptor entered');
    started.cp.cancel('owner');
    await rejectsCancel(started.cp, 'replaced outer promise');
    gate.resolve();
    const record = await started.ingress();
    await closeOf(record);
    assert.equal(record.res.writableEnded, true);
  });

  await check('native response stage does not retroactively reject external abort', async () => {
    const a = new AbortController();
    const entered = deferred();
    const gate = deferred();
    const raw = native();
    raw.interceptors.response.use(async (response) => {
      entered.resolve();
      await gate.promise;
      return response;
    });
    const cp = wrapAxios(raw).get('/ok/response-stage', { signal: a.signal });
    await deadline(entered.promise, 'response interceptor entered');
    a.abort();
    gate.resolve();
    assert.equal((await deadline(cp, 'native response stage')).status, 200);
  });

  await check('timeout cause and abort metadata', async () => {
    // Start the timeout after real ingress to exclude pre-dispatch cancellation
    const controller = new AbortController();
    const started = startIngress('/hold/timeout', () =>
      wrapAxios(native()).get('/hold/timeout', { signal: controller.signal }),
    );
    const record = await started.ingress();
    const timeout = AbortSignal.timeout(1);
    const fired = deferred();
    timeout.addEventListener('abort', fired.resolve, { once: true });
    await deadline(fired.promise, 'timeout signal');
    controller.abort(timeout.reason);
    const error = await rejectsCancel(started.cp, 'native timeout');
    if (version === '0.22.0') {
      assert.equal(error.message, 'canceled');
      assert.equal(error.timedOut, false);
    } else {
      assert.equal(error.timedOut, true);
      assert.equal(error.cause, controller.signal.reason);
      assert.equal(error.cause, timeout.reason);
    }
    await closeOf(record);
  });

  await check('stream after headers abort and listener cleanup', async () => {
    for (const mode of ['retained', 'replaced', 'scope', 'quiet']) {
      const external = new AbortController();
      const replacement = new AbortController();
      const raw = native();
      if (mode === 'replaced') {
        raw.interceptors.request.use((config) => ({ ...config, signal: replacement.signal }));
      }
      const requestPath = '/stream/live-' + mode;
      const started = startIngress(requestPath, () =>
        wrapAxios(raw).get(requestPath, { signal: external.signal, responseType: 'stream' }),
      );
      const record = await started.ingress();
      const response = await deadline(started.cp, 'stream headers ' + mode);
      const body = response.data;
      assert.equal(body.destroyed, false);
      const chunk = deferred();
      body.once('data', chunk.resolve);
      assert.equal(String(await deadline(chunk.promise, 'stream chunk ' + mode)), 'chunk');
      const errors = [];
      if (mode !== 'quiet') {
        body.on('error', (error) => errors.push(error));
      }
      const closed = deferred();
      body.once('close', closed.resolve);
      const reason = new DOMException('stream ' + mode, mode === 'replaced' ? 'TimeoutError' : 'AbortError');
      if (mode === 'scope') {
        response.config.cancelScope.cancel(reason);
      } else if (mode === 'replaced') {
        replacement.abort(reason);
      } else {
        external.abort(reason);
      }
      await deadline(closed.promise, 'body close ' + mode);
      await closeOf(record);
      assert.equal(record.res.writableEnded, false);
      assert.equal(body.destroyed, true);
      if (mode !== 'quiet') {
        assert.equal(errors.length, 1, 'stream error count ' + mode);
        const [error] = errors;
        assert.equal(isCancelError(error), true, 'stream emitted error identity ' + mode);
        assert.equal(error.cause, reason, 'stream cause identity ' + mode);
        assert.equal(error.aborted, mode !== 'replaced', 'stream aborted flag ' + mode);
        assert.equal(error.timedOut, mode === 'replaced', 'stream timeout flag ' + mode);
      }
      assert.equal(getEventListeners(external.signal, 'abort').length, 0, 'live external listeners ' + mode);
      assert.equal(getEventListeners(response.config.signal, 'abort').length, 0, 'live final listeners ' + mode);
      console.log('STREAM ' + mode + ' errors=' + (mode === 'quiet' ? 'unobserved' : errors.length) + ' listeners=0/0');
    }

    for (const terminal of ['end', 'close']) {
      for (const mode of ['retained', 'replaced']) {
        const external = new AbortController();
        const replacement = new AbortController();
        const raw = native();
        if (mode === 'replaced') {
          raw.interceptors.request.use((config) => ({ ...config, signal: replacement.signal }));
        }
        raw.interceptors.response.use(async (response) => {
          const body = response.data;
          const closed = deferred();
          body.once('close', closed.resolve);
          if (terminal === 'end') {
            body.resume();
          } else {
            body.destroy();
          }
          await deadline(closed.promise, 'interceptor body close ' + terminal + ' ' + mode);
          return response;
        });
        const requestPath = (terminal === 'end' ? '/ok/' : '/stream/') + 'terminal-' + terminal + '-' + mode;
        const started = startIngress(requestPath, () =>
          wrapAxios(raw).get(requestPath, { signal: external.signal, responseType: 'stream' }),
        );
        const record = await started.ingress();
        const response = await deadline(started.cp, 'terminal response ' + terminal + ' ' + mode);
        await closeOf(record);
        assert.equal(response.status, 200);
        assert.equal(response.data.closed, true);
        assert.equal(response.data.readableEnded, terminal === 'end');
        assert.equal(record.res.writableEnded, terminal === 'end');
        assert.equal(
          getEventListeners(external.signal, 'abort').length,
          0,
          'terminal external listeners ' + terminal + ' ' + mode,
        );
        assert.equal(
          getEventListeners(response.config.signal, 'abort').length,
          0,
          'terminal final listeners ' + terminal + ' ' + mode,
        );
        console.log('STREAM terminal ' + terminal + ' ' + mode + ' listeners=0/0');
      }
    }
  });

  await check('external listener cleanup after success', async () => {
    const a = new AbortController();
    const response = await deadline(wrapAxios(native()).get('/ok/cleanup', { signal: a.signal }), 'normal response');
    assert.equal(response.status, 200);
    assert.equal(getEventListeners(a.signal, 'abort').length, 0);
    console.log('LISTENERS success=0');
  });

  assert.equal(passed, 12);
  console.log('PHYSICAL PASS 12/12 cases ' + format + ' axios ' + version);
} finally {
  // Includes held responses on negative-control and assertion failures.
  for (const socket of sockets.keys()) socket.destroy();
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('SERVER CLOSED');
}
