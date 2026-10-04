// Runs by CI, cron, or hand.
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Suppress unhandled rejections from stream internals on deliberately failing file handles.
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('unhandledRejection', () => {});
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('unhandledrejection', (e) => {
    if (typeof e?.preventDefault === 'function') {
      e.preventDefault();
    }
  });
}

const g = globalThis;
const rt =
  g.Deno ? `deno ${g.Deno.version.deno}`
  : g.Bun ? `bun ${g.Bun.version}`
  : `node ${g.process?.version}`;

const TMP_DIR = join(tmpdir(), `canc-fh-facts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TMP_RO_FILE = join(TMP_DIR, 'test-ro-file.txt');
const TMP_WO_FILE = join(TMP_DIR, 'test-wo-file.txt');
const TMP_SUBDIR = join(TMP_DIR, 'subdir');

await mkdir(TMP_DIR, { recursive: true });
await mkdir(TMP_SUBDIR, { recursive: true });
await writeFile(TMP_RO_FILE, 'x'.repeat(1024));
await writeFile(TMP_WO_FILE, 'x'.repeat(1024));

/**
 * Known programmer error codes (e.g. invalid arguments) that stay out of failure sets.
 */
const PROGRAMMER_ERROR_CODES = new Set(['ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_METHOD_NOT_IMPLEMENTED']);

function extractErrorCode(err, isClosed = false) {
  if (!err) return null;
  if (typeof err !== 'object') return String(err);
  if (isClosed && (err.name === 'RangeError' || err.code === 'ERR_OUT_OF_RANGE' || err.code === 'ERR_INVALID_STATE')) {
    return 'EBADF';
  }
  if (err.name === 'TypeError' || err.name === 'RangeError') return null;
  const code = err.code || err.errno;
  if (typeof code === 'string') {
    if (PROGRAMMER_ERROR_CODES.has(code)) return null;
    return code;
  }
  if (err.name && err.name !== 'Error' && err.name !== 'SystemError') {
    return err.name;
  }
  return 'UNKNOWN_ERROR';
}

async function safeClose(fh, memberName) {
  if (!fh) return;
  // readableWebStream leaks internal stream locks on error across runtimes, making close() hang
  if (memberName === 'readableWebStream') return;
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, 50);
      if (typeof timer?.unref === 'function') timer.unref();
    });
    await Promise.race([fh.close().catch(() => {}), timeout]);
  } catch {
    // ignore
  } finally {
    clearTimeout(timer);
  }
}

async function probeMember(fh, memberName, isClosed = false) {
  const buf = new Uint8Array(4);
  try {
    switch (memberName) {
      case 'appendFile':
        await fh.appendFile('append data\n');
        return { ok: true, code: null };
      case 'chmod':
        await fh.chmod(0o666);
        return { ok: true, code: null };
      case 'chown':
        await fh.chown(1000, 1000);
        return { ok: true, code: null };
      case 'close':
        await fh.close();
        return { ok: true, code: null };
      case 'createReadStream': {
        let rs;
        try {
          rs = fh.createReadStream();
        } catch (e) {
          const errCode = extractErrorCode(e, isClosed);
          return { ok: false, code: errCode || e.code || e.name };
        }
        return await new Promise((resolve) => {
          let settled = false;
          const timerRef = { id: null };
          const finish = (ok, code) => {
            if (!settled) {
              settled = true;
              if (timerRef.id) clearTimeout(timerRef.id);
              try {
                rs.destroy();
              } catch {
                // ignore
              }
              resolve({ ok, code });
            }
          };
          timerRef.id = setTimeout(() => finish(true, null), 100);
          if (typeof timerRef.id?.unref === 'function') timerRef.id.unref();
          rs.on('data', () => finish(true, null));
          rs.on('end', () => finish(true, null));
          rs.on('close', () => finish(true, null));
          rs.on('error', (err) => {
            const errCode = extractErrorCode(err, isClosed);
            finish(false, errCode || err.code || err.name);
          });
        });
      }
      case 'createWriteStream': {
        let ws;
        try {
          ws = fh.createWriteStream();
        } catch (e) {
          const errCode = extractErrorCode(e, isClosed);
          return { ok: false, code: errCode || e.code || e.name };
        }
        return await new Promise((resolve) => {
          let settled = false;
          const timerRef = { id: null };
          const finish = (ok, code) => {
            if (!settled) {
              settled = true;
              if (timerRef.id) clearTimeout(timerRef.id);
              try {
                ws.destroy();
              } catch {
                // ignore
              }
              resolve({ ok, code });
            }
          };
          timerRef.id = setTimeout(() => finish(true, null), 100);
          if (typeof timerRef.id?.unref === 'function') timerRef.id.unref();
          ws.on('finish', () => finish(true, null));
          ws.on('close', () => finish(true, null));
          ws.on('error', (err) => {
            const errCode = extractErrorCode(err, isClosed);
            finish(false, errCode || err.code || err.name);
          });
          try {
            ws.write('stream data\n');
            ws.end();
          } catch (err) {
            const errCode = extractErrorCode(err, isClosed);
            finish(false, errCode || err.code || err.name);
          }
        });
      }
      case 'datasync':
        await fh.datasync();
        return { ok: true, code: null };
      case 'fd': {
        const val = fh.fd;
        return { ok: true, code: null, val };
      }
      case 'pull':
        if (typeof fh.pull !== 'function') return { ok: false, code: 'N/A' };
        await fh.pull(buf);
        return { ok: true, code: null };
      case 'pullSync':
        if (typeof fh.pullSync !== 'function') return { ok: false, code: 'N/A' };
        fh.pullSync(buf);
        return { ok: true, code: null };
      case 'read':
        await fh.read(buf, 0, 4, 0);
        return { ok: true, code: null };
      case 'readableWebStream': {
        if (typeof fh.readableWebStream !== 'function') return { ok: false, code: 'N/A' };
        const stream = fh.readableWebStream();
        const reader = stream.getReader();
        reader.closed.catch(() => {});
        let timer;
        try {
          const timeoutPromise = new Promise((resolve) => {
            timer = setTimeout(resolve, 50);
            if (typeof timer?.unref === 'function') timer.unref();
          });
          await Promise.race([reader.read(), timeoutPromise]);
          reader.releaseLock();
          await stream.cancel().catch(() => {});
          return { ok: true, code: null };
        } catch (e) {
          reader.releaseLock();
          await stream.cancel().catch(() => {});
          const errCode = extractErrorCode(e, isClosed);
          return { ok: false, code: errCode || e.code || e.name };
        } finally {
          clearTimeout(timer);
        }
      }
      case 'readFile':
        await fh.readFile();
        return { ok: true, code: null };
      case 'readLines': {
        if (typeof fh.readLines !== 'function') return { ok: false, code: 'N/A' };

        for await (const _line of fh.readLines()) {
          break;
        }
        return { ok: true, code: null };
      }
      case 'readv':
        await fh.readv([buf]);
        return { ok: true, code: null };
      case 'stat':
        await fh.stat();
        return { ok: true, code: null };
      case 'sync':
        await fh.sync();
        return { ok: true, code: null };
      case 'truncate':
        await fh.truncate(0);
        return { ok: true, code: null };
      case 'utimes':
        await fh.utimes(new Date(), new Date());
        return { ok: true, code: null };
      case 'write':
        await fh.write(buf, 0, 4, 0);
        return { ok: true, code: null };
      case 'writeFile':
        await fh.writeFile('write data\n');
        return { ok: true, code: null };
      case 'writer':
        if (typeof fh.writer !== 'function') return { ok: false, code: 'N/A' };
        await fh.writer();
        return { ok: true, code: null };
      case 'writev':
        await fh.writev([buf]);
        return { ok: true, code: null };
      case '[Symbol.asyncDispose]':
        if (typeof fh[Symbol.asyncDispose] !== 'function') return { ok: false, code: 'N/A' };
        await fh[Symbol.asyncDispose]();
        return { ok: true, code: null };
      default:
        return { ok: false, code: 'UNKNOWN_MEMBER' };
    }
  } catch (e) {
    const errCode = extractErrorCode(e, isClosed);
    return { ok: false, code: errCode || e.code || e.name };
  }
}

const MEMBERS = [
  'appendFile',
  'chmod',
  'chown',
  'close',
  'createReadStream',
  'createWriteStream',
  'datasync',
  'fd',
  'pull',
  'pullSync',
  'read',
  'readableWebStream',
  'readFile',
  'readLines',
  'readv',
  'stat',
  'sync',
  'truncate',
  'utimes',
  'write',
  'writeFile',
  'writer',
  'writev',
  '[Symbol.asyncDispose]',
];

const results = [];

try {
  for (const m of MEMBERS) {
    // 1. Closed Handle
    let closedRes;
    try {
      const fhClosed = await open(TMP_RO_FILE, 'r');
      await fhClosed.close();
      closedRes = await probeMember(fhClosed, m, true);
    } catch (e) {
      closedRes = { ok: false, code: extractErrorCode(e, true) || e.code || e.name };
    }

    // 2. Directory Handle
    let dirRes;
    let fhDir;
    try {
      fhDir = await open(TMP_SUBDIR, 'r');
      dirRes = await probeMember(fhDir, m, false);
    } catch (e) {
      dirRes = { ok: false, code: extractErrorCode(e, false) || e.code || e.name };
    } finally {
      await safeClose(fhDir, m);
    }

    // 3. Read-Only Handle (reseed file content to ensure valid bytes for readers)
    await writeFile(TMP_RO_FILE, 'x'.repeat(1024));
    let roRes;
    let fhRo;
    try {
      fhRo = await open(TMP_RO_FILE, 'r');
      roRes = await probeMember(fhRo, m, false);
    } catch (e) {
      roRes = { ok: false, code: extractErrorCode(e, false) || e.code || e.name };
    } finally {
      await safeClose(fhRo, m);
    }

    // 4. Write-Only Handle
    let woRes;
    let fhWo;
    try {
      fhWo = await open(TMP_WO_FILE, 'w');
      woRes = await probeMember(fhWo, m, false);
    } catch (e) {
      woRes = { ok: false, code: extractErrorCode(e, false) || e.code || e.name };
    } finally {
      await safeClose(fhWo, m);
    }

    // Failure set: collect unique non-null error codes
    const failureSet = new Set();
    for (const r of [closedRes, dirRes, roRes, woRes]) {
      if (!r.ok && r.code && r.code !== 'N/A' && r.code !== 'resolve') {
        failureSet.add(r.code);
      }
    }

    results.push({
      member: m,
      closed: closedRes.ok ? 'resolve' : closedRes.code,
      dir: dirRes.ok ? 'resolve' : dirRes.code,
      ro: roRes.ok ? 'resolve' : roRes.code,
      wo: woRes.ok ? 'resolve' : woRes.code,
      failures: Array.from(failureSet).sort(),
    });
  }
} finally {
  await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {});
}

// Print results table
console.log(`\nFileHandle Member Failure Sets (Runtime: ${rt})\n`);
console.log('| Member | Closed | Dir Handle | RO Handle | WO Handle | Failures |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');
for (const r of results) {
  const failuresStr = r.failures.length > 0 ? r.failures.join(', ') : '[]';
  console.log(`| \`${r.member}\` | ${r.closed} | ${r.dir} | ${r.ro} | ${r.wo} | ${failuresStr} |`);
}
console.log('');
