import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratchRoot = path.join(os.tmpdir(), 'canc', 'p116e-installed');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const installFlags = [
  '--no-save',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--no-package-lock',
  '--legacy-peer-deps',
];

function run(exe, args, cwd, timeout = 20000) {
  const shell = process.platform === 'win32' && exe.endsWith('.cmd');
  const result = spawnSync(exe, shell ? args.map((arg) => '"' + arg.replaceAll('"', '""') + '"') : args, {
    cwd,
    shell,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function checked(exe, args, cwd) {
  const result = run(exe, args, cwd);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}

async function exercise(load, resolve, format, file, wanted) {
  const assert = await load('node:assert/strict').then((m) => m.default ?? m);
  const native = await load('node:fs').then((m) => m.default ?? m);
  const path = await load('node:path').then((m) => m.default ?? m);
  const events = await load('node:events');
  const dnsNative = await load('node:dns/promises');
  const workerNative = await load('node:worker_threads');
  const { CancelablePromise, isCancelError } = await load('@cancjs/promise');
  const cfs = await load('@cancjs/node/fs');
  const ce = await load('@cancjs/node/events');
  const cdns = await load('@cancjs/node/dns');
  const cw = await load('@cancjs/node/worker-threads');
  const cp = await load('@cancjs/node/child-process');
  const root = await load('@cancjs/node');
  const gate = () => {
    let open;
    const promise = new Promise((resolve) => {
      open = resolve;
    });
    return { promise, open };
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const outcome = (p) =>
    Promise.resolve(p).then(
      (v) => v,
      (e) => e,
    );
  const turn = () => new Promise((resolve) => setImmediate(resolve));
  const name = (label) => label + '-' + process.pid;
  const available = (n) => cw.requestLock(n, { ifAvailable: true }, (lock) => lock !== null);
  const cases = {};
  cases.resolution = async () => {
    const prefix = native.realpathSync(path.join(process.cwd(), 'node_modules')) + path.sep;
    for (const id of [
      '@cancjs/promise',
      '@cancjs/node',
      ...['fs', 'events', 'dns', 'worker-threads', 'child-process'].map((s) => '@cancjs/node/' + s),
    ]) {
      const resolved = native.realpathSync(await resolve(id));
      assert.ok(resolved.startsWith(prefix), resolved);
      assert.ok(resolved.endsWith('.' + format), resolved);
      console.log('INSTALLED ENTRY', id, resolved);
    }
  };

  function accessible(handle) {
    if ('fd' in handle) return handle.fd !== -1 && native.fstatSync(handle.fd).isFile();
    try {
      handle.readSync();
      return true;
    } catch (error) {
      assert.equal(error.code, 'ERR_DIR_CLOSED');
      return false;
    }
  }

  for (const method of ['open', 'opendir']) {
    for (const schedule of ['before', 'microtask', 'observer', 'delivered', 'double']) {
      cases[method + '-' + schedule] = async () => {
        const handle =
          method === 'open' ? await native.promises.open(file, 'r') : await native.promises.opendir(process.cwd());
        const closeNative = handle.close.bind(handle);
        let count = 0;
        let closed;
        Object.defineProperty(handle, 'close', {
          configurable: true,
          writable: true,
          value() {
            count++;
            return (closed = closeNative());
          },
        });
        const raw = gate();
        cfs.setFs({ ...native, promises: { ...native.promises, [method]: () => raw.promise } });
        try {
          const result = method === 'open' ? cfs.open(file, 'r') : cfs.opendir(process.cwd());
          const done = outcome(result);
          if (schedule === 'before') result.cancel();
          if (schedule === 'observer') void raw.promise.then(() => result.cancel());
          raw.open(handle);
          if (schedule === 'microtask' || schedule === 'double')
            queueMicrotask(() => {
              result.cancel();
              if (schedule === 'double') result.cancel();
            });
          if (schedule === 'delivered') {
            assert.equal(await done, handle);
            result.cancel();
          } else assert.ok(isCancelError(await done));
          await turn();
          await closed;
          assert.deepEqual(
            { count, accessible: accessible(handle) },
            schedule === 'delivered' ? { count: 0, accessible: true } : { count: 1, accessible: false },
          );
        } finally {
          cfs.resetFs();
          if (accessible(handle)) await closeNative();
        }
      };
    }
  }
  cases['open-unobserved'] = async () => {
    const seen = [];
    const listener = (reason) => seen.push(reason);
    process.on('unhandledRejection', listener);
    try {
      cfs.open(path.join(process.cwd(), 'nonexistent-native-open-file'), 'r');
      const end = Date.now() + 1500;
      while (!seen.length && Date.now() < end) await delay(10);
      await turn();
      assert.equal(seen.length, 1);
      assert.equal(seen[0].code, 'ENOENT');
    } finally {
      process.off('unhandledRejection', listener);
    }
  };
  cases['event-owner'] = async () => {
    const controller = new AbortController();
    const emitter = new events.EventEmitter();
    const failure = new Error('emitter failure');
    const baseline = events.getEventListeners(controller.signal, 'abort').length;
    for (let i = 0; i < 9; i++) {
      const iterator = ce.on(emitter, 'data', { signal: controller.signal });
      const pending = outcome(iterator.next());
      emitter.emit('error', failure);
      assert.equal(await pending, failure);
      assert.equal(events.getEventListeners(controller.signal, 'abort').length, baseline);
    }
    const nativeSignal = new AbortController();
    const nativeIterator = events.on(emitter, 'data', { signal: nativeSignal.signal });
    const pending = outcome(nativeIterator.next());
    emitter.emit('error', failure);
    assert.equal(await pending, failure);
    console.log('NATIVE event error listener count', events.getEventListeners(nativeSignal.signal, 'abort').length);
    nativeSignal.abort();
  };
  cases['dns-owner'] = async () => {
    const proto = dnsNative.Resolver.prototype;
    const original = proto.cancel;
    let count = 0;
    proto.cancel = function (...args) {
      count++;
      return original.apply(this, args);
    };
    try {
      const owner = new cdns.Resolver();
      for (let i = 0; i < 5; i++) {
        const failure = await outcome(owner.resolve4(null));
        assert.equal(failure.code, 'ERR_INVALID_ARG_TYPE');
      }
      owner.cancel();
      assert.equal(count, 1);
    } finally {
      proto.cancel = original;
    }
  };
  const worker = [
    "const {parentPort,workerData}=require('node:worker_threads');",
    'const {state,ack,finish}=workerData;',
    "parentPort.on('message', message=>{",
    'if(message!==' + JSON.stringify(cw.STOP_MESSAGE) + ')return;',
    "if(ack)parentPort.postMessage({type:'ack'});",
    'Atomics.store(state,1,1);',
    'if(finish){Atomics.wait(state,2,0,1000);Atomics.store(state,0,2);process.exit(0)}',
    '});Atomics.store(state,0,1);',
  ].join('\n');
  async function until(test) {
    const end = Date.now() + 3000;
    while (!test()) {
      assert.ok(Date.now() < end, 'worker did not reach gate');
      await delay(5);
    }
  }
  for (const [label, ack, finish, terminate, expected] of [
    ['worker-ack', true, true, 'graceful', 2],
    ['worker-no-ack', false, true, 'graceful', 2],
    ['worker-immediate', true, true, 'immediate', 1],
    ['worker-expired', true, false, 'graceful', 1],
  ]) {
    cases[label] = async () => {
      const state = new Int32Array(new SharedArrayBuffer(12));
      const task = cw.runTask(
        worker,
        { state, ack, finish },
        { eval: true, terminate, gracePeriod: finish ? 2000 : 150 },
      );
      const done = outcome(task);
      try {
        await until(() => Atomics.load(state, 0) === 1);
        const drain = task.cancel();
        if (finish && terminate === 'graceful') {
          await until(() => Atomics.load(state, 1) === 1);
          await delay(80);
          Atomics.store(state, 2, 1);
          Atomics.notify(state, 2);
        }
        await drain;
        assert.ok(isCancelError(await done));
        assert.equal(Atomics.load(state, 0), expected);
      } finally {
        Atomics.store(state, 2, 1);
        Atomics.notify(state, 2);
        await task.cancel();
      }
    };
  }
  cases['worker-result'] = async () =>
    assert.equal(
      await cw.runTask("require('node:worker_threads').parentPort.postMessage(17)", undefined, { eval: true }),
      17,
    );

  const code = "process.stdout.write('ok')";
  const childFile = path.join(process.cwd(), 'child.cjs');
  native.writeFileSync(childFile, code);
  for (const [label, create] of [
    ['spawn', () => cp.spawn(process.execPath, ['-e', code])],
    ['fork', () => cp.fork(childFile, { silent: true })],
    ['exec', () => cp.exec('echo ok')],
    ['execFile', () => cp.execFile(process.execPath, ['-e', code])],
  ]) {
    cases['child-' + label] = async () => {
      const child = create();
      console.log('OWNED child PID', child.pid);
      const kill = child.kill;
      let kills = 0;
      child.kill = function (...args) {
        kills++;
        return kill.apply(this, args);
      };
      const chunks = [];
      let closes = 0;
      const closed = new Promise((resolve) =>
        child.once('close', () => {
          closes++;
          resolve();
        }),
      );
      const result = child.promise;
      const done = result.then(undefined, (e) => e);
      try {
        const observation = await new Promise((resolve) =>
          child.once('exit', () => {
            const before = closes;
            void Promise.resolve(result.cancel()).then(() => resolve({ before, after: closes }));
            child.stdout?.on('data', (chunk) => chunks.push(String(chunk)));
          }),
        );
        await closed;
        assert.deepEqual(observation, { before: 0, after: 1 });
        assert.equal(closes, 1);
        assert.equal(kills, 0);
        if (label === 'spawn') assert.equal(chunks.join('').trim(), 'ok');
        await done;
      } finally {
        child.kill = kill;
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await closed;
      }
    };
  }
  cases['child-late'] = async () => {
    const child = cp.spawn(process.execPath, ['-e', code]);
    console.log('OWNED child PID', child.pid);
    child.stdout.resume();
    await events.once(child, 'close');
    assert.deepEqual(await child.promise, { exitCode: 0, signal: null });
  };
  if (typeof cp.__probeKillAndWaitForExit === 'function') {
    cases['child-close-recorder'] = async () => {
      const child = cp.spawn(process.execPath, ['-e', code]);
      console.log('OWNED child PID', child.pid);
      child.stdout.resume();
      await events.once(child, 'close');
      assert.deepEqual(await child.promise, { exitCode: 0, signal: null });
      let timer;
      try {
        const finished = await Promise.race([
          cp.__probeKillAndWaitForExit(child).then(() => true),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(false), 180);
          }),
        ]);
        assert.equal(finished, true);
      } finally {
        clearTimeout(timer);
      }
    };
  }
  cases['child-pre-exit'] = async () => {
    const child = cp.spawn(process.execPath, ['-e', 'setTimeout(()=>{},10000)']);
    console.log('OWNED child PID', child.pid);
    let closed = false;
    const done = new Promise((resolve) =>
      child.once('close', () => {
        closed = true;
        resolve();
      }),
    );
    const result = child.promise;
    const rejected = outcome(result);
    try {
      await events.once(child, 'spawn');
      await result.cancel();
      assert.equal(closed, true);
      assert.ok(isCancelError(await rejected));
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await done;
    }
  };

  if (process.versions.node.startsWith('18.')) {
    cases['locks-unsupported'] = async () => {
      assert.equal(workerNative.locks, undefined);
      const error = await outcome(cw.requestLock(name('unsupported'), () => 17));
      assert.ok(root.isNotImplementedError(error));
      assert.equal(error.feature, 'requestLock');
      assert.equal(error.required, '24');
    };
  } else {
    for (const kind of ['throwing-then', 'single-read-then', 'private-getters', 'unbranded-duck']) {
      cases['lock-foreign-' + kind] = async () => {
        const n = name(kind);
        const marker = new Error(kind);
        let reads = 0,
          privateReads = 0,
          signal;
        const body = Object.defineProperty({}, 'then', {
          get() {
            reads++;
            if (kind === 'throwing-then' || (kind === 'single-read-then' && reads > 1)) throw marker;
            return (resolve) => resolve(42);
          },
        });
        for (const key of ['_subscribe', '_retainRef']) {
          Object.defineProperty(body, key, {
            get() {
              privateReads++;
              if (kind === 'private-getters') throw marker;
              return () => {
                throw new Error('foreign protocol invoked');
              };
            },
          });
        }
        const result = await outcome(
          cw.requestLock(n, (_lock, bodySignal) => {
            signal = bodySignal;
            return body;
          }),
        );
        assert.equal(result, kind === 'throwing-then' ? marker : 42);
        assert.equal(isCancelError(result), false);
        assert.equal(reads, 1);
        assert.equal(privateReads, 0);
        assert.equal(signal.aborted, false);
        assert.equal(await cw.requestLock(n, () => 23), 23);
      };
    }
    cases['lock-branded-incomplete'] = async () => {
      const { CANCEL_PROMISE_BRAND } = await load('@cancjs/promise');
      let reads = 0;
      const body = {
        [CANCEL_PROMISE_BRAND]: true,
        get then() {
          reads++;
          return (resolve) => resolve(42);
        },
      };
      assert.equal(await cw.requestLock(name('brand-incomplete'), () => body), 42);
      assert.equal(reads, 1);
    };
    cases['lock-brand-inaccessible'] = async () => {
      const { CANCEL_PROMISE_BRAND } = await load('@cancjs/promise');
      const body = new Proxy(Promise.resolve(42), {
        get(target, key) {
          if (key === CANCEL_PROMISE_BRAND) throw new Error('brand inaccessible');
          if (key === 'then') return target.then.bind(target);
          return Reflect.get(target, key);
        },
      });
      assert.equal(await cw.requestLock(name('brand-inaccessible'), () => body), 42);
    };
    cases['lock-branded-setup-error'] = async () => {
      const { CANCEL_PROMISE_BRAND } = await load('@cancjs/promise');
      const n = name('brand-setup-error');
      const marker = new Error('broken branded protocol');
      const body = {
        [CANCEL_PROMISE_BRAND]: true,
        get _subscribe() {
          throw marker;
        },
        then() {
          throw new Error('unexpected then call');
        },
      };
      let signal;
      const result = await outcome(
        cw.requestLock(n, (_lock, bodySignal) => {
          signal = bodySignal;
          return body;
        }),
      );
      assert.equal(result, marker);
      assert.equal(isCancelError(result), false);
      assert.equal(signal.aborted, false);
      assert.equal(await cw.requestLock(n, () => 23), 23);
    };
    for (const [shared, foreignCopy] of [
      [true, false],
      [false, false],
      [true, true],
    ]) {
      cases[
        foreignCopy ? 'lock-cross-copy'
        : shared ? 'lock-shared'
        : 'lock-bubble-false'
      ] = async () => {
        assert.ok(workerNative.locks);
        const n = name('shared-' + shared + '-' + foreignCopy);
        const entered = gate();
        const Copy =
          foreignCopy ? (await load('./promise-copy/dist/index.' + format)).CancelablePromise : CancelablePromise;
        if (foreignCopy) assert.notEqual(Copy, CancelablePromise);
        const source = Copy.withResolvers({ bubble: shared });
        const side = shared ? source.promise.then((v) => v) : undefined;
        const sideDone = side && outcome(side);
        let signal;
        const holder = cw.requestLock(n, (_lock, bodySignal) => {
          signal = bodySignal;
          entered.open();
          return source.promise;
        });
        const done = outcome(holder);
        try {
          await entered.promise;
          await holder.cancel('stop');
          assert.ok(isCancelError(await done));
          assert.equal(signal.aborted, true);
          assert.equal(source.promise.canceled, false);
          assert.equal(side?.canceled ?? false, false);
          assert.equal(await available(n), false);
          source.resolve(41);
          if (sideDone) assert.equal(await sideDone, 41);
          assert.equal(await cw.requestLock(n, () => 17), 17);
        } finally {
          source.resolve(41);
          await holder.cancel();
          await done;
          if (sideDone) await sideDone;
        }
      };
    }
    for (const steal of [false, true]) {
      cases[steal ? 'lock-steal' : 'lock-sole-cleanup'] = async () => {
        const n = name('cleanup-' + steal);
        const entered = gate(),
          cleanup = gate(),
          started = gate();
        let count = 0,
          ended = false;
        const source = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
          handleCancel(async () => {
            count++;
            started.open();
            await cleanup.promise;
            ended = true;
          });
        });
        const holder = cw.requestLock(n, () => {
          entered.open();
          return source;
        });
        const done = outcome(holder);
        try {
          await entered.promise;
          let drain;
          if (steal) {
            assert.equal(
              await cw.requestLock(n, { steal: true }, () => {
                assert.equal(ended, false);
                return 29;
              }),
              29,
            );
            assert.equal((await done).cause?.name, 'AbortError');
          } else {
            drain = holder.cancel('stop');
            assert.ok(isCancelError(await done));
          }
          await started.promise;
          assert.equal(source.canceled, true);
          assert.equal(ended, false);
          if (!steal) {
            await delay(40);
            assert.equal(await available(n), false);
          }
          holder.cancel('again');
          cleanup.open();
          await drain;
          assert.equal(await cw.requestLock(n, () => 17), 17);
          assert.equal(count, 1);
          assert.equal(ended, true);
        } finally {
          cleanup.open();
          await holder.cancel();
          await done;
        }
      };
    }
  }

  if (!process.versions.node.startsWith('18.')) {
    cases['lock-reentrant'] = async () => {
      const n = name('reentrant');
      const controller = new AbortController();
      const entered = gate(),
        cleanup = gate();
      let count = 0;
      const source = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
        handleCancel(() => {
          count++;
          return cleanup.promise;
        });
      });
      const holder = cw.requestLock(n, { signal: controller.signal }, () => {
        controller.abort('inside body');
        entered.open();
        return source;
      });
      const done = outcome(holder);
      try {
        await entered.promise;
        assert.ok(isCancelError(await done));
        assert.equal(await available(n), false);
        assert.equal(count, 1);
      } finally {
        cleanup.open();
        await holder.cancel();
        await source.cancel();
        await done;
        await cw.requestLock(n, () => undefined);
      }
    };
    cases['lock-rejecting-cleanup'] = async () => {
      const n = name('reject-cleanup');
      const entered = gate(),
        cleanup = gate(),
        started = gate();
      const source = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
        handleCancel(async () => {
          started.open();
          await cleanup.promise;
          throw new Error('cleanup failure');
        });
      });
      const holder = cw.requestLock(n, () => {
        entered.open();
        return source;
      });
      const done = outcome(holder);
      try {
        await entered.promise;
        const drain = holder.cancel();
        assert.ok(isCancelError(await done));
        await started.promise;
        assert.equal(await available(n), false);
        cleanup.open();
        await drain;
        assert.equal(await cw.requestLock(n, () => 41), 41);
      } finally {
        cleanup.open();
        await holder.cancel();
        await done;
      }
    };
  }
  cases['warning-normal'] = async () => {
    const handle = await cfs.open(file, 'r');
    try {
      if (process.versions.node.startsWith('18.')) {
        assert.equal(typeof handle.readLines, 'undefined');
        assert.equal(typeof handle[Symbol.asyncDispose], 'undefined');
      }
      assert.equal(typeof handle.readFile, 'function');
    } finally {
      await handle.close();
    }
  };
  cases['warning-damaged'] = async () => {
    const raw = await native.promises.open(file, 'r');
    const proto = Object.getPrototypeOf(raw);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'readFile');
    assert.ok(descriptor);
    try {
      delete proto.readFile;
      for (let i = 0; i < 2; i++) {
        const handle = await cfs.open(file, 'r');
        await handle.close();
      }
    } finally {
      Object.defineProperty(proto, 'readFile', descriptor);
      await raw.close();
    }
  };

  let failed = 0;
  let completed = 0;
  const deadline = setTimeout(() => {
    throw new Error('native fixture deadline exceeded');
  }, 12000);
  for (const [label, test] of Object.entries(cases)) {
    if (wanted === 'main' ? label.startsWith('warning-') : wanted !== label) continue;
    try {
      await test();
      completed++;
      if (!label.startsWith('warning-')) console.log('PASS packed node', process.version, format, label);
    } catch (error) {
      failed++;
      console.error('FAIL packed node', process.version, format, label, error);
    }
  }
  assert.ok(wanted === 'main' || Object.hasOwn(cases, wanted), wanted);
  clearTimeout(deadline);
  console.log('FIXTURE SUMMARY', completed, failed);
  process.exitCode = failed ? 1 : 0;
}

function checkMutants(consumer, scratch, node18) {
  const nodeDist = path.join('node_modules', '@cancjs', 'node', 'dist');
  const mutants = [
    ['no-rescue', 'fs/index.cjs', 'open-microtask', 'closeQuietly(nativeHandle);', 'void nativeHandle;'],
    [
      'raw-delivered',
      'fs/index.cjs',
      'opendir-observer',
      'nativeHandle = handle;',
      'nativeHandle = handle; delivered = true;',
    ],
    [
      'close-delivered',
      'fs/index.cjs',
      'open-delivered',
      'delivered = true;',
      'delivered = true; closeQuietly(nativeHandle);',
    ],
    ['worker-stop-guard', 'worker-threads.cjs', 'worker-ack', /if \(stopping\)\s+return;/, ''],
    [
      'child-exit-return',
      'child-process.cjs',
      'child-spawn',
      'if (closedChildren.has(child)) {',
      'if (child.exitCode !== null || child.signalCode !== null) {',
    ],
    [
      'child-close-recorder',
      'child-process.cjs',
      'child-close-recorder',
      "child.once('close', () => closedChildren.add(child));",
      '',
    ],
    [
      'direct-source-cancel',
      'worker-threads.cjs',
      'lock-shared',
      'countedInterest = source.then();',
      'countedInterest = source;',
    ],
    [
      'drop-original-lease',
      'worker-threads.cjs',
      'lock-shared',
      'return bodySettled.then(() => cleanupSettled);',
      'return cleanupSettled;',
    ],
    [
      'drop-cleanup-lease',
      'worker-threads.cjs',
      'lock-sole-cleanup',
      'return bodySettled.then(() => cleanupSettled);',
      'return bodySettled;',
    ],
    [
      'no-warning-floor',
      'fs/index.cjs',
      'warning-normal',
      'floors ? meetsLineFloors(features.nodeVersion, floors) : minMajor <= features.nodeMajor && entry.gate === null',
      'minMajor <= features.nodeMajor && entry.gate === null',
    ],
    [
      'no-warning',
      'fs/index.cjs',
      'warning-damaged',
      /console\.warn\(\x60\[canc\] fs\.FileHandle missing members: .*?\x60\);/,
      'void skipped;',
    ],
    ['event-error-detach', 'events.cjs', 'event-owner', /stopListening\(\);\s+throw error;/, 'throw error;'],
    ['dns-sync-finish', 'dns.cjs', 'dns-owner', /finished\(\);\s+throw error;/, 'throw error;'],
    ['public-observer', 'fs/index.cjs', 'open-unobserved', null, null],
    [
      'old-lock-classifier',
      'worker-threads.cjs',
      'lock-foreign-single-read-then',
      /function isCurrentSource\(value\) \{[\s\S]*?\n\}/,
      "function isCurrentSource(value) { const source = value; return typeof source?.then === 'function' && typeof source._subscribe === 'function' && typeof source._retainRef === 'function'; }",
    ],
  ];
  let killed = 0;
  for (const [id, relative, label, anchor, replacement] of mutants) {
    const copy = path.join(scratch, 'mutant-' + id);
    fs.cpSync(consumer, copy, { recursive: true });
    const bundle = path.join(copy, nodeDist, relative);
    const original = fs.readFileSync(bundle, 'utf8');
    let changed;
    if (id === 'public-observer') {
      const start = original.indexOf('function teardownOpen(');
      const end = original.indexOf('\nconst access =', start);
      assert.ok(start >= 0 && end > start);
      const region = original.slice(start, end);
      const open = 'return new promise.CancelablePromise((resolve, reject, { handleCancel }) => {';
      const close = '\n        });\n    };';
      assert.equal(region.split(open).length, 2);
      assert.equal(region.split(close).length, 2);
      changed =
        original.slice(0, start) +
        region
          .replace(open, open.replace('return new', 'const outer = new'))
          .replace(
            close,
            '\n        });\n        outer._subscribe(undefined, () => {});\n        return outer;\n    };',
          ) +
        original.slice(end);
    } else {
      const count =
        typeof anchor === 'string' ?
          original.split(anchor).length - 1
        : [...original.matchAll(new RegExp(anchor.source, 'g'))].length;
      assert.equal(count, 1, id + ': emitted anchor count');
      changed = original.replace(anchor, replacement);
    }
    assert.notEqual(changed, original, id);
    try {
      if (id === 'child-close-recorder') {
        const instrument = '\nexports.__probeKillAndWaitForExit = killAndWaitForExit;\n';
        fs.writeFileSync(bundle, original + instrument);
        const control = run(process.execPath, [path.join(copy, 'fixture.cjs'), label], copy);
        assert.equal(control.status, 0, control.stdout + control.stderr);
        assert.ok(control.stdout.includes('FIXTURE SUMMARY 1 0'));
        changed += instrument;
      }
      fs.writeFileSync(bundle, changed);
      const host = id === 'no-warning-floor' ? node18 : process.execPath;
      const result = run(host, [path.join(copy, 'fixture.cjs'), label], copy);
      if (label.startsWith('warning-')) {
        assert.equal(result.status, 0, id + ': ' + result.stderr);
        assert.ok(result.stdout.includes('FIXTURE SUMMARY 1 0'));
        const warnings = result.stderr
          .split(/\r?\n/)
          .filter((line) => line.includes('[canc] fs.FileHandle missing members'));
        assert.equal(warnings.length, id === 'no-warning-floor' ? 1 : 0);
      } else {
        assert.equal(result.status, 1, id + ': ' + result.stdout + result.stderr);
        assert.ok(
          result.stderr.includes('FAIL packed node ' + process.version + ' cjs ' + label),
          id + ': ' + result.stderr,
        );
      }
      console.log('MUTANT RED', id, label, result.stderr.split(/\r?\n/)[0]);
      killed++;
    } finally {
      fs.writeFileSync(bundle, original);
      assert.equal(fs.readFileSync(bundle, 'utf8'), original);
      fs.rmSync(copy, { recursive: true, force: true });
    }
  }
  assert.equal(killed, 15);
  console.log('MUTANT SUMMARY', killed);
}

fs.mkdirSync(scratchRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchRoot, 'fixture-'));
try {
  const tarDir = path.join(scratch, 'tar');
  fs.mkdirSync(tarDir);
  const packages = ['canc-node', 'canc-promise'];
  const versions = {};
  const archives = packages.map((pkg) => {
    const cwd = path.join(root, 'packages', pkg);
    versions[pkg] = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).version;
    const archive = path.join(
      tarDir,
      checked(npm, ['pack', '--ignore-scripts', '--pack-destination', tarDir], cwd).split(/\r?\n/).at(-1),
    );
    console.log('PACK', archive, createHash('sha256').update(fs.readFileSync(archive)).digest('hex'));
    return archive;
  });
  const bin = path.join(scratch, 'bin-node18');
  const nativePkg = 'node-' + (process.platform === 'win32' ? 'win' : process.platform) + '-' + process.arch;
  checked(npm, ['install', '--prefix', bin, ...installFlags, nativePkg + '@18.0.0'], root);
  const node18 = path.join(bin, 'node_modules', nativePkg, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
  assert.equal(checked(node18, ['-v'], root), 'v18.0.0');
  assert.ok(process.version.startsWith('v24.'), 'run driver on actual Node 24');
  let failures = 0;
  let passed = 0;
  for (const format of ['cjs', 'mjs']) {
    const consumer = path.join(scratch, format === 'cjs' ? 'cjs-consumer' : 'esm-consumer');
    fs.mkdirSync(consumer);
    checked(npm, ['install', '--prefix', consumer, ...installFlags, ...archives], root);
    for (const pkg of packages) {
      const manifest = path.join(consumer, 'node_modules', '@cancjs', pkg.slice(5), 'package.json');
      assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).version, versions[pkg]);
    }
    fs.cpSync(path.join(consumer, 'node_modules', '@cancjs', 'promise'), path.join(consumer, 'promise-copy'), {
      recursive: true,
    });
    const fixture = path.join(consumer, 'fixture.' + format);
    const prelude =
      format === 'cjs' ?
        'const load = async id => require(id); const resolve = id => require.resolve(id); const file = __filename;'
      : "import {fileURLToPath} from 'node:url'; const load = id => import(id); const resolve = async id => fileURLToPath(await import.meta.resolve(id)); const file = fileURLToPath(import.meta.url);";
    fs.writeFileSync(
      fixture,
      prelude +
        '\n(' +
        exercise.toString() +
        ')(load,resolve,' +
        JSON.stringify(format) +
        ',file,process.argv[2]).catch(error=>{console.error(error);process.exitCode=1});',
    );
    for (const host of [node18, process.execPath]) {
      for (const label of ['warning-normal', 'warning-damaged', 'main']) {
        const result = run(
          host,
          [...(host === node18 && format === 'mjs' ? ['--experimental-import-meta-resolve'] : []), fixture, label],
          consumer,
          15000,
        );
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        const warnings = result.stderr
          .split(/\r?\n/)
          .filter((line) => line.includes('[canc] fs.FileHandle missing members'));
        const expected = label === 'warning-damaged' ? 1 : 0;
        const expectedCases =
          label === 'main' ?
            host === node18 ?
              26
            : 39
          : 1;
        const summary = 'FIXTURE SUMMARY ' + expectedCases + ' 0';
        const valid =
          result.status === 0 &&
          result.stdout.includes(summary) &&
          warnings.length === expected &&
          (expected === 0 || warnings[0].includes('readFile'));
        if (!valid) {
          failures++;
          console.error('FAIL lane', host, format, label, 'status', result.status, 'warnings', warnings);
        } else {
          passed++;
          if (label.startsWith('warning-'))
            console.log('PASS packed node', host === node18 ? 'v18.0.0' : process.version, format, label);
        }
      }
    }
    if (format === 'cjs' && process.argv.includes('--mutants')) {
      assert.equal(failures, 0);
      checkMutants(consumer, scratch, node18);
    }
  }
  console.log('PACKED SUMMARY', { passed, failures });
  assert.equal(failures, 0);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
