import nodeFs from 'node:fs';
import path from 'node:path';

import { CancelablePromise, isCancelError } from '@cancjs/promise';

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
});
