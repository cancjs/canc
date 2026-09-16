import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import fsJson from '../../surface/fs.json';
import { isNotFoundError } from '../errors/errno';
import * as fsExports from './index';
import { resetFs, setFs } from './registry';

describe('@cancjs/node/fs module exports', () => {
  afterEach(() => {
    resetFs();
  });

  it('exports every name in surface/fs.json and nothing else', () => {
    const manifestNames = fsJson.exports.map((e: any) => e.name);
    // Add exists manually since it's built on util.promisify.custom
    const expectedNames = new Set(manifestNames);

    // Add extra things from reexports.md
    expectedNames.add('Dirent');
    expectedNames.add('Dir');
    expectedNames.add('Stats');
    expectedNames.add('exists');

    const actualNames = new Set(Object.keys(fsExports));

    const missing = [...expectedNames].filter((x) => !actualNames.has(x));
    const extra = [...actualNames].filter((x) => !expectedNames.has(x));

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('readFile cancellation rejects CancelError, not AbortError', async () => {
    // Wait for the next tick so the file read actually starts
    const p = fsExports.readFile(__filename);
    p.cancel('stop');

    let caught: any;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(isCancelError(caught)).toBe(true);
    expect(caught.name).not.toBe('AbortError');
  });

  it('readFile on missing path rejects node error, matches isNotFoundError, has ENOENT', async () => {
    let caught: any;
    try {
      await fsExports.readFile(path.join(__dirname, 'does-not-exist.txt'));
    } catch (err) {
      caught = err;
    }

    expect(isNotFoundError(caught)).toBe(true);
    expect(caught.code).toBe('ENOENT');
  });

  it('setFs routes callback-path exports but not promises-path exports', async () => {
    let fakeReadFileCalled = false;
    let fakeMkdirCalled = false;

    const fakeFs = {
      ...nodeFs,
      readFile: (...args: any[]) => {
        fakeReadFileCalled = true;
        const cb = args[args.length - 1];
        cb(null, Buffer.from('fake'));
      },
      mkdir: (...args: any[]) => {
        fakeMkdirCalled = true;
        const cb = args[args.length - 1];
        cb(null);
      },
    };

    setFs(fakeFs);

    await fsExports.readFile(__filename);
    expect(fakeReadFileCalled).toBe(true);

    try {
      await fsExports.mkdir(path.join(__dirname, 'does-not-exist'));
    } catch (_e) {
      // ignore
    }
    expect(fakeMkdirCalled).toBe(false);
  });

  it('rename (cat D) returns a CancelablePromise', () => {
    const p = fsExports.rename('a', 'b');
    expect(p).toBeInstanceOf(CancelablePromise);
    (p as CancelablePromise<any>).cancel();
  });

  it('readFile honors a caller signal instead of dropping it', async () => {
    let nodeSignal: AbortSignal | undefined;
    const fakeFs = {
      ...nodeFs,
      // never calls back, so only the caller's abort can settle this
      readFile: (...args: any[]) => {
        nodeSignal = args[1]?.signal;
      },
    };

    setFs(fakeFs);

    const controller = new AbortController();
    const p = fsExports.readFile(__filename, { signal: controller.signal });

    expect(nodeSignal).toBeDefined();
    expect(nodeSignal).not.toBe(controller.signal);

    controller.abort();

    let caught: any;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(isCancelError(caught)).toBe(true);
    expect(nodeSignal?.aborted).toBe(true);
  });

  it('watch returns the async iterable node returns, and a signal ends the loop', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-watch-'));
    const target = path.join(dir, 'touched.txt');
    const controller = new AbortController();

    const events = fsExports.watch(dir, { signal: controller.signal });
    expect(typeof (events as any)[Symbol.asyncIterator]).toBe('function');

    // the watcher starts listening asynchronously, so keep touching until it reports something
    const touch = setInterval(() => nodeFs.writeFileSync(target, String(Date.now())), 20);
    const seen: unknown[] = [];

    try {
      for await (const event of events) {
        seen.push(event);
        controller.abort();
      }
    } catch (err: any) {
      // node ends an aborted watch by throwing, which is node's own behavior and not ours
      if (err?.name !== 'AbortError') {
        throw err;
      }
    } finally {
      clearInterval(touch);
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }

    expect(seen.length).toBeGreaterThanOrEqual(1);
  });

  it('copyFile cancellation leaves the destination where it is', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-copy-'));
    const src = path.join(dir, 'src.txt');
    const dest = path.join(dir, 'dest.txt');
    nodeFs.writeFileSync(src, 'from the source');
    nodeFs.writeFileSync(dest, 'the file that was already there');

    // a real copy that reports back in the same tick, which puts the cancel in the window where the
    // copy is done and the promise has not adopted it yet. Nothing here waits on a clock
    const fakeFs = {
      ...nodeFs,
      copyFile: (...args: any[]) => {
        const cb = args[args.length - 1];
        nodeFs.copyFileSync(args[0], args[1]);
        cb(null);
      },
    };

    setFs(fakeFs);

    const p = fsExports.copyFile(src, dest);
    p.cancel('stop');

    // cancel may or may not beat a copy this quick, and either way it must not delete the target
    await p.catch(() => undefined);
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(nodeFs.existsSync(dest)).toBe(true);

    nodeFs.rmSync(dir, { recursive: true, force: true });
  });

  it('closes the descriptor when a pending open is canceled', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-open-'));
    const file = path.join(dir, 'test.txt');
    nodeFs.writeFileSync(file, 'hello');

    const realPromises = (nodeFs as any).promises;
    const closeSpy = jest.fn();
    const fakeFs = {
      ...nodeFs,
      promises: {
        ...realPromises,
        open: async (...args: any[]) => {
          await new Promise((r) => setTimeout(r, 20));
          const fh = await realPromises.open(...args);
          const origClose = fh.close.bind(fh);
          fh.close = async () => {
            closeSpy();
            return origClose();
          };
          return fh;
        },
      },
    };

    setFs(fakeFs);

    try {
      const p = fsExports.open(file, 'r');
      p.cancel('canceled while pending');
      await expect(p).rejects.toThrow(CancelError);

      await new Promise((r) => setTimeout(r, 50));
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('closes the directory handle when a pending opendir is canceled', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-opendir-'));

    const realPromises = (nodeFs as any).promises;
    const closeSpy = jest.fn();
    const fakeFs = {
      ...nodeFs,
      promises: {
        ...realPromises,
        opendir: async (...args: any[]) => {
          await new Promise((r) => setTimeout(r, 20));
          const dirHandle = await realPromises.opendir(...args);
          const origClose = dirHandle.close.bind(dirHandle);
          dirHandle.close = async () => {
            closeSpy();
            return origClose();
          };
          return dirHandle;
        },
      },
    };

    setFs(fakeFs);

    try {
      const p = fsExports.opendir(dir);
      p.cancel('canceled while pending');
      await expect(p).rejects.toThrow(CancelError);

      await new Promise((r) => setTimeout(r, 50));
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canceling open after settle closes nothing and handle still works', async () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'canc-open-settle-'));
    const file = path.join(dir, 'test.txt');
    nodeFs.writeFileSync(file, 'hello');

    try {
      const p = fsExports.open(file, 'r');
      const fh = await p;
      p.cancel('after settle');
      await new Promise((r) => setImmediate(r));
      const stats = await fh.stat();
      expect(stats.size).toBe(5);
      await fh.close();
    } finally {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects when the caller aborts a signal node does not accept', async () => {
    const fakeFs = {
      ...nodeFs,
      stat: () => {
        // never calls back so only caller abort can settle it
      },
    };
    setFs(fakeFs);

    const controller = new AbortController();
    const p = fsExports.stat(__filename, { signal: controller.signal } as any);
    controller.abort();

    await expect(
      Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: stat ignored caller signal')), 100)),
      ]),
    ).rejects.toThrow(CancelError);
  });

  it('rejects when the caller aborts an adopted export (mkdir) or promisifyWrapped export (rename)', async () => {
    const fakeFs = {
      ...nodeFs,
      rename: () => {
        // never calls back so only caller abort can settle it
      },
    };
    setFs(fakeFs);

    const controllerRename = new AbortController();
    const pRename = (fsExports.rename as any)('old.txt', 'new.txt', { signal: controllerRename.signal });
    controllerRename.abort();

    await expect(
      Promise.race([
        pRename,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: rename ignored caller signal')), 100)),
      ]),
    ).rejects.toThrow(CancelError);

    // mkdir (adopted export)
    const controllerMkdir = new AbortController();
    controllerMkdir.abort();
    const pMkdir = fsExports.mkdir(path.join(os.tmpdir(), 'canc-mkdir-never'), {
      signal: controllerMkdir.signal,
    } as any);

    await expect(pMkdir).rejects.toThrow(CancelError);
  });

  it('works through viaFs when setFs uses a class instance with this', async () => {
    class ClassFs {
      readonly greeting = 'hello';
      stat(_path: string, _options: any, cb: any) {
        const callback = typeof _options === 'function' ? _options : cb;
        if (this.greeting !== 'hello') {
          throw new Error('lost this');
        }
        callback(null, { isFile: () => true });
      }
    }

    setFs(new ClassFs() as any);
    await expect(fsExports.stat('some-file')).resolves.toBeDefined();
  });

  it('routes exists through setFs', async () => {
    const realExists = await fsExports.exists(__filename);
    expect(realExists).toBe(true);

    setFs({
      ...nodeFs,
      exists: (_p: string, cb: (exists: boolean) => void) => {
        cb(false);
      },
    });

    const fakeExists = await fsExports.exists(__filename);
    expect(fakeExists).toBe(false);
  });
});
