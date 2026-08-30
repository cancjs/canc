import * as fs from 'node:fs/promises';

import { CancelError } from '@cancjs/promise';
import { describe, expect, jest, test } from '@jest/globals';

import { __resetCancProtoForTest, decorate } from './file-handle';

describe('FileHandle', () => {
  test('fh instanceof native class, fd getter works, override reaches native', async () => {
    const fh = await fs.open('package.json', 'r');
    const NativeClass = fh.constructor;
    decorate(fh);

    expect(fh instanceof NativeClass).toBe(true);
    expect(typeof fh.fd).toBe('number');

    const stat = await fh.stat();
    expect(stat).toBeDefined();
    expect(stat.size).toBeGreaterThan(0);

    await fh.close();
  });

  test('readFile(decoratedHandle) still works', async () => {
    const fh = await fs.open('package.json', 'r');
    decorate(fh);

    const content = await fs.readFile(fh, 'utf8');
    expect(typeof content).toBe('string');
    expect(content.includes('name')).toBe(true);

    await fh.close();
  });

  test('await using routes through our close override', async () => {
    let overrideRan = false;
    const fh = await fs.open('package.json', 'r');
    decorate(fh);

    const origClose = fh.close;
    fh.close = function (...args: any[]) {
      overrideRan = true;
      return (origClose as any).apply(this, args);
    };

    await (async () => {
      await using _handle = fh;
    })();

    expect(overrideRan).toBe(true);
  });

  test('own-member scan uses Object.getOwnPropertyNames', async () => {
    const fh = await fs.open('package.json', 'r');
    const spy = jest.spyOn(Object, 'getOwnPropertyNames');

    decorate(fh);

    expect(spy).toHaveBeenCalledWith(fh);
    spy.mockRestore();

    await fh.close();
  });

  test('Capture-time skip: diagnostic on missing member', async () => {
    __resetCancProtoForTest();
    const fakeProto = {
      read: jest.fn(),
      // missing stat
    };
    const fakeFh = Object.create(fakeProto);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    decorate(fakeFh);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing members'));
    expect(fakeFh.read).not.toBe(fakeProto.read);

    warnSpy.mockRestore();
    __resetCancProtoForTest(); // reset again so we don't break next tests
  });

  test('fh.writeFile(asyncIterable) canceled mid-stream calls return()', async () => {
    const fh = await fs.open('test-async-iter.tmp', 'w');
    decorate(fh);

    let started = false;
    let returned = false;
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        try {
          started = true;
          yield 'chunk 1\n';
          await new Promise((r) => setTimeout(r, 1000));
          yield 'chunk 2\n';
        } finally {
          returned = true;
        }
      },
    };

    const p = fh.writeFile(asyncIterable as any, {}) as any;

    // wait until the iterator starts before canceling
    await new Promise((r) => {
      const check = () => (started ? r(undefined) : setTimeout(check, 5));
      check();
    });
    p.cancel();
    await expect(p).rejects.toThrow(CancelError);
    await new Promise((r) => setTimeout(r, 10)); // wait for finally
    expect(returned).toBe(true);

    await fh.close();
    try {
      await fs.unlink('test-async-iter.tmp');
    } catch (_e) {
      // ignore
    }
  });

  test('close cannot be canceled, fd is still closed', async () => {
    const fh = await fs.open('package.json', 'r');
    decorate(fh);

    const p = fh.close() as any;
    p.cancel();

    await p;

    try {
      await fh.stat();
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.code === 'EBADF' || e.message.includes('closed')).toBe(true);
    }
  });
});
