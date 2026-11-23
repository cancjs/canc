import nodeFs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

import * as cfs from './index';

type Handle = FileHandle | nodeFs.Dir;
type OpenName = 'open' | 'opendir';
type Schedule = 'before' | 'microtask' | 'observer' | 'delivered' | 'double';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function accessible(handle: Handle): boolean {
  if ('fd' in handle) {
    return handle.fd !== -1 && nodeFs.fstatSync(handle.fd).isFile();
  }
  try {
    handle.readSync();
    return true;
  } catch (error) {
    expect(error).toMatchObject({ code: 'ERR_DIR_CLOSED' });
    return false;
  }
}

async function withHandle(name: OpenName, run: (handle: Handle, closeNative: () => Promise<void>) => Promise<void>) {
  const handle =
    name === 'open' ? await nodeFs.promises.open(__filename, 'r') : await nodeFs.promises.opendir(__dirname);
  const closeNative = handle.close.bind(handle) as () => Promise<void>;
  try {
    await run(handle, closeNative);
  } finally {
    cfs.resetFs();
    if (accessible(handle)) await closeNative();
  }
}

function start(name: OpenName, raw: Promise<Handle>) {
  cfs.setFs({ ...nodeFs, promises: { ...nodeFs.promises, [name]: () => raw } });
  return name === 'open' ? cfs.open(__filename, 'r') : cfs.opendir(__dirname);
}

describe.each<OpenName>(['open', 'opendir'])('%s native handoff', (name) => {
  it.each<Schedule>(['before', 'microtask', 'observer', 'delivered', 'double'])(
    'preserves ownership with %s cancellation',
    async (schedule) => {
      await withHandle(name, async (handle, closeNative) => {
        let closed: Promise<void> | undefined;
        const close = jest.fn(() => (closed = closeNative()));
        Object.defineProperty(handle, 'close', { value: close, configurable: true, writable: true });
        const raw = deferred<Handle>();
        const result = start(name, raw.promise);

        if (schedule === 'before') result.cancel();
        if (schedule === 'observer')
          void raw.promise.then(() => {
            result.cancel();
          });
        raw.resolve(handle);
        if (schedule === 'microtask' || schedule === 'double') {
          queueMicrotask(() => {
            result.cancel();
            if (schedule === 'double') result.cancel();
          });
        }

        if (schedule === 'delivered') {
          await expect(result).resolves.toBe(handle);
          result.cancel();
        } else {
          await expect(result).rejects.toMatchObject({ name: 'CancelError' });
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        await closed;
        expect({ closes: close.mock.calls.length, accessible: accessible(handle) }).toEqual(
          schedule === 'delivered' ? { closes: 0, accessible: true } : { closes: 1, accessible: false },
        );
      });
    },
  );

  it.each(['throw', 'reject'] as const)('preserves cancellation if native close %s fails', async (mode) => {
    await withHandle(name, async (handle) => {
      const error = new Error('close failed');
      const close = jest.fn(() => {
        if (mode === 'throw') throw error;
        return Promise.reject(error);
      });
      Object.defineProperty(handle, 'close', { value: close, configurable: true, writable: true });
      const raw = deferred<Handle>();
      const result = start(name, raw.promise);
      result.cancel();
      raw.resolve(handle);
      await expect(result).rejects.toMatchObject({ name: 'CancelError' });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});

it('closes a native file handle if decoration fails', async () => {
  await withHandle('open', async (handle, closeNative) => {
    let closed: Promise<void> | undefined;
    const close = jest.fn(() => (closed = closeNative()));
    Object.defineProperty(handle, 'close', { value: close, configurable: true, writable: true });
    Object.preventExtensions(handle);
    const result = start('open', Promise.resolve(handle));
    await expect(result).rejects.toBeInstanceOf(TypeError);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await closed;
    expect({ closes: close.mock.calls.length, accessible: accessible(handle) }).toEqual({
      closes: 1,
      accessible: false,
    });
  });
});

it('closes the native handle acquired by an EMFILE retry after cancellation', async () => {
  await withHandle('open', async (handle, closeNative) => {
    let closed: Promise<void> | undefined;
    const close = jest.fn(() => (closed = closeNative()));
    Object.defineProperty(handle, 'close', { value: close, configurable: true, writable: true });
    const raw = deferred<Handle>();
    const secondAttempt = deferred<void>();
    const open = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('too many files'), { code: 'EMFILE' }))
      .mockImplementationOnce(() => {
        secondAttempt.resolve();
        return raw.promise;
      });
    cfs.setFs({ ...nodeFs, promises: { ...nodeFs.promises, open } }, { retryOpen: true });
    const result = cfs.open(__filename, 'r');
    await secondAttempt.promise;
    result.cancel();
    raw.resolve(handle);
    await expect(result).rejects.toMatchObject({ name: 'CancelError' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await closed;
    expect(open).toHaveBeenCalledTimes(2);
    expect({ closes: close.mock.calls.length, accessible: accessible(handle) }).toEqual({
      closes: 1,
      accessible: false,
    });
  });
});
