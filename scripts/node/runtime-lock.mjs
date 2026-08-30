// Runs by CI, cron, or hand.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const g = globalThis;
const runtimeKey =
  g.Deno ? 'deno'
  : g.Bun ? 'bun'
  : 'node';
const runtimeVersion =
  g.Deno ? `deno ${g.Deno.version.deno}`
  : g.Bun ? `bun ${g.Bun.version}`
  : `node ${g.process?.version}`;

const SPECS = [
  'fs',
  'fs/promises',
  'child_process',
  'timers',
  'timers/promises',
  'stream',
  'stream/promises',
  'stream/consumers',
  'stream/web',
  'dns',
  'dns/promises',
  'events',
  'crypto',
  'net',
  'tls',
  'http',
  'https',
  'http2',
  'zlib',
  'worker_threads',
  'readline',
  'readline/promises',
  'dgram',
  'sqlite',
  'util',
  'os',
  'path',
  'buffer',
  'url',
  'process',
  'test',
  'cluster',
  'v8',
  'vm',
  'perf_hooks',
  'diagnostics_channel',
  'async_hooks',
  'inspector',
  'inspector/promises',
  'module',
  'string_decoder',
  'querystring',
  'assert',
  'console',
  'tty',
  'repl',
  'wasi',
  'punycode',
  'domain',
  'trace_events',
  'sea',
];

const out = {
  runtime: runtimeVersion,
  exports: {},
  promisifyCustom: {},
  errors: {},
  signalHonored: {},
  fileHandle: {
    prototypeMembers: [],
    ownFunctionMembers: [],
  },
  notes: [],
};

async function imp(spec) {
  try {
    return await import(`node:${spec}`);
  } catch (e) {
    return { __err: String(e).slice(0, 120) };
  }
}

const pid = typeof process !== 'undefined' && process.pid ? process.pid : Math.floor(Math.random() * 100000);
const tempPrefix = `canc-probe-${pid}-${Date.now()}`;
const tempFiles = [];
const DIR = tmpdir() ?? '/tmp';
const HERE_FILE = fileURLToPath(import.meta.url);
const MISSING = platform() === 'win32' ? 'C:/__no_such_canc_probe__/x' : '/__no_such_canc_probe__/x';

function shape(e) {
  const proto = Object.getPrototypeOf(e ?? {});
  return {
    ctor: proto?.constructor?.name ?? null,
    protoIsErrorItself: proto?.constructor === Error,
    name: e?.name,
    code: e?.code,
    errno: e?.errno,
    syscall: e?.syscall,
    hasPath: 'path' in (e ?? {}),
    ownKeys: Object.keys(e ?? {}).sort(),
    instanceofError: e instanceof Error,
    stackStartsWithName: typeof e?.stack === 'string' && e.stack.startsWith(String(e.name)),
  };
}

async function honors(label, run) {
  const ac = new AbortController();
  ac.abort();
  try {
    const r = await run(ac.signal);
    if (r && typeof r[Symbol.asyncIterator] === 'function') {
      // iterate first item to trigger abort
      for await (const _ of r) {
        break;
      }
    }
    out.signalHonored[label] = 'resolve';
  } catch (e) {
    out.signalHonored[label] =
      e?.name === 'AbortError' || e?.code === 'ABORT_ERR' ? 'reject:AbortError' : `other:${e?.name}:${e?.code}`;
  }
}

async function runProbe() {
  const mods = {};
  for (const spec of SPECS) {
    const m = await imp(spec);
    if (m.__err) {
      out.exports[spec] = { error: m.__err };
      continue;
    }
    mods[spec] = m;
    out.exports[spec] = { keys: Object.keys(m).sort() };
  }

  const util = mods.util;
  if (util?.promisify?.custom) {
    const customSymbol = util.promisify.custom;
    const targets = {
      child_process: ['exec', 'execFile'],
      fs: ['exists', 'readFile', 'read', 'write', 'realpath'],
      dns: ['lookup', 'lookupService', 'resolve', 'resolve4', 'reverse'],
      timers: ['setTimeout', 'setImmediate', 'setInterval'],
      stream: ['finished', 'pipeline'],
      zlib: ['gzip', 'gunzip', 'brotliCompress'],
      crypto: ['pbkdf2', 'scrypt', 'generateKeyPair', 'randomBytes', 'generatePrime', 'randomFill', 'hkdf'],
      dgram: [],
    };
    for (const [spec, fns] of Object.entries(targets)) {
      const m = mods[spec];
      if (!m) continue;
      for (const f of fns) {
        const fn = m[f];
        out.promisifyCustom[`${spec}.${f}`] =
          fn == null ? 'ABSENT'
          : customSymbol in fn ? 'HAS'
          : 'no';
      }
    }
  } else {
    out.notes.push('util.promisify.custom unavailable');
  }

  const fsp = mods['fs/promises'];
  if (fsp) {
    try {
      await fsp.stat(MISSING);
    } catch (e) {
      out.errors.ENOENT_stat = shape(e);
    }
    try {
      await fsp.readFile(DIR);
    } catch (e) {
      out.errors.EISDIR_readFile = shape(e);
    }
    try {
      await fsp.readFile(MISSING);
    } catch (e) {
      out.errors.ENOENT_readFile = shape(e);
    }
    try {
      await fsp.readdir(MISSING);
    } catch (e) {
      out.errors.ENOENT_readdir = shape(e);
    }
    try {
      await fsp.mkdir(DIR);
    } catch (e) {
      out.errors.EEXIST_mkdir = shape(e);
    }
    try {
      await fsp.readFile(123456789);
    } catch (e) {
      out.errors.VALIDATION_readFile = shape(e);
    }
    try {
      await fsp.rmdir(MISSING);
    } catch (e) {
      out.errors.ENOENT_rmdir = shape(e);
    }

    const tempAppend = join(DIR, `${tempPrefix}-append.txt`);
    const tempWrite = join(DIR, `${tempPrefix}-write.txt`);
    const tempCp = join(DIR, `${tempPrefix}-cp.txt`);
    const tempDir = join(DIR, `${tempPrefix}-dir`);
    const tempFh = join(DIR, `${tempPrefix}-fh.txt`);
    tempFiles.push(tempAppend, tempWrite, tempCp, tempDir, tempFh);

    await honors('fs.readFile', (s) => fsp.readFile(HERE_FILE, { signal: s }));
    await honors('fs.appendFile', (s) => fsp.appendFile(tempAppend, '', { signal: s }));
    await honors('fs.writeFile', (s) => fsp.writeFile(tempWrite, '', { signal: s }));
    await honors('fs.stat', (s) => fsp.stat(HERE_FILE, { signal: s }));
    await honors('fs.lstat', (s) => fsp.lstat(HERE_FILE, { signal: s }));
    await honors('fs.readdir', (s) => fsp.readdir(DIR, { signal: s }));
    await honors('fs.access', (s) => fsp.access(HERE_FILE, undefined, { signal: s }));
    await honors('fs.realpath', (s) => fsp.realpath(HERE_FILE, { signal: s }));
    out.signalHonored['fs.copyFile'] = 'n/a:no-options-arg';
    out.signalHonored['fs.open'] = 'n/a:no-options-arg';
    await honors('fs.cp', (s) => fsp.cp(HERE_FILE, tempCp, { signal: s }));
    await honors('fs.rm', (s) => fsp.rm(tempCp, { force: true, signal: s }));
    await honors('fs.mkdir', (s) => fsp.mkdir(tempDir, { recursive: true, signal: s }));
    await honors('fs.opendir', (s) => fsp.opendir(DIR, { signal: s }).then((d) => d?.close?.()));
    await honors('fs.statfs', (s) => fsp.statfs(DIR, { signal: s }));
    if (typeof fsp.glob === 'function') {
      await honors('fs.glob', (s) => fsp.glob('*.mjs', { signal: s }));
    }
    if (typeof fsp.watch === 'function') {
      await honors('fs.watch', (s) => fsp.watch(DIR, { signal: s }));
    }

    if (typeof fsp.open === 'function') {
      try {
        await fsp.writeFile(tempFh, 'probe');
        const fh = await fsp.open(tempFh, 'r');
        try {
          const proto = Object.getPrototypeOf(fh);
          out.fileHandle.prototypeMembers = proto ? Object.getOwnPropertyNames(proto).sort() : [];
          out.fileHandle.ownFunctionMembers = Object.getOwnPropertyNames(fh)
            .filter((k) => typeof fh[k] === 'function')
            .sort();
        } finally {
          await fh.close();
        }
      } catch (e) {
        out.fileHandle.error = String(e);
      }
    }
  }

  const tp = mods['timers/promises'];
  if (tp) {
    await honors('timers.setTimeout', (s) => tp.setTimeout(5, null, { signal: s }));
    await honors('timers.setImmediate', (s) => tp.setImmediate(null, { signal: s }));
    await honors('timers.scheduler.wait', (s) => tp.scheduler.wait(5, { signal: s }));
  }

  const ev = mods.events;
  if (ev) {
    const em = new ev.EventEmitter();
    await honors('events.once', (s) => ev.once(em, 'x', { signal: s }));
    await honors('events.on', (s) => ev.on(em, 'x', { signal: s }));
  }

  const sc = mods['stream/consumers'];
  const st = mods.stream;
  if (sc && st) {
    const mk = () => st.Readable.from(['a']);
    await honors('consumers.text', () => sc.text(mk()));
    out.notes.push('consumers.* take no signal arg; probe records baseline resolve');
  }

  const sp = mods['stream/promises'];
  if (sp && st) {
    await honors('stream.finished', (s) => sp.finished(st.Readable.from(['a']), { signal: s }));
    await honors('stream.pipeline', (s) => sp.pipeline(st.Readable.from(['a']), new st.PassThrough(), { signal: s }));
  }

  const cp = mods.child_process;
  if (cp) {
    await honors(
      'child_process.exec',
      (s) =>
        new Promise((res, rej) => {
          cp.exec('node -e 0', { signal: s }, (err) => (err ? rej(err) : res()));
        }),
    );
  }

  const dnsp = mods['dns/promises'];
  if (dnsp) {
    out.notes.push(`dns/promises Resolver.cancel: ${typeof dnsp.Resolver?.prototype?.cancel}`);
  }

  if (runtimeKey === 'deno') {
    out.notes.push(
      'deno write denial: NotCapable (ctor NotCapable, name NotCapable, no code/errno), covered by isPermissionError name check',
    );
  }
}

async function main() {
  const isCheck = process.argv.includes('--check');
  const lockPath = fileURLToPath(new URL('../../packages/canc-node/surface/runtime.lock.json', import.meta.url));
  const lockDir = dirname(lockPath);

  try {
    await runProbe();
  } finally {
    for (const f of tempFiles) {
      try {
        await rm(f, { recursive: true, force: true });
      } catch {
        // cleanup probe scratch files
      }
    }
  }

  let existing = {};
  let lockExists = false;
  try {
    const content = await readFile(lockPath, 'utf8');
    existing = JSON.parse(content);
    lockExists = true;
  } catch {
    // lock file does not exist yet
  }

  if (isCheck) {
    if (!lockExists) {
      console.error(`Error: runtime lock file missing at ${lockPath}`);
      process.exit(1);
    }
    const recorded = existing[runtimeKey];
    if (!recorded) {
      console.error(`Error: missing runtime entry for "${runtimeKey}" in ${lockPath}`);
      process.exit(1);
    }
    const expectedStr = JSON.stringify(recorded, null, 2);
    const actualStr = JSON.stringify(out, null, 2);
    if (expectedStr !== actualStr) {
      console.error(`Error: drift detected in runtime lock for "${runtimeKey}" (${runtimeVersion})`);
      console.error(`Recorded:\n${expectedStr}\nProbed:\n${actualStr}`);
      process.exit(1);
    }
    console.log(`Runtime lock is up to date for ${runtimeKey} (${runtimeVersion})`);
    process.exit(0);
  }

  existing[runtimeKey] = out;

  // sort runtime keys in canonical order
  const order = ['node', 'deno', 'bun'];
  const sortedKeys = Object.keys(existing).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const merged = {};
  for (const k of sortedKeys) {
    merged[k] = existing[k];
  }

  await mkdir(lockDir, { recursive: true });
  await writeFile(lockPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`Updated runtime lock for ${runtimeKey} (${runtimeVersion})`);
}

await main();
