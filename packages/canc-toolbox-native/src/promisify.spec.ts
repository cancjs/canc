import { promisify, promisifyAll } from './index';

const kCustom = Symbol.for('nodejs.util.promisify.custom');

describe('promisify', () => {
  it('resolves the value of an errfirst callback (happy path)', async () => {
    const fn = (a: number, cb: (err: any, value: number) => void) => cb(null, a * 2);
    const wrapped = promisify(fn);
    await expect(wrapped(21)).resolves.toBe(42);
  });

  it('rejects when the errfirst callback receives an error', async () => {
    const error = new Error('boom');
    const fn = (cb: (err: any) => void) => cb(error);
    await expect(promisify(fn)()).rejects.toBe(error);
  });

  it('honors errorFirst:false (value-first callback)', async () => {
    const fn = (cb: (value: number) => void) => cb(7);
    await expect(promisify(fn, { errorFirst: false })()).resolves.toBe(7);
  });

  it('multiArgs:true resolves the array of callback values', async () => {
    const fn = (cb: (err: any, a: number, b: number) => void) => cb(null, 1, 2);
    await expect(promisify(fn, { multiArgs: true })()).resolves.toEqual([1, 2]);
  });

  it('honors the promisify.custom symbol (cb path NOT used)', async () => {
    const cbPath = jest.fn();
    const fn: any = (cb: any) => {
      cbPath();
      cb(null, 'wrong');
    };
    fn[kCustom] = () => Promise.resolve('custom');

    await expect(promisify(fn)()).resolves.toBe('custom');
    expect(cbPath).not.toHaveBeenCalled();
  });

  it('preserves this when the wrapped method is called on an object', async () => {
    const obj = {
      base: 10,
      add(this: any, n: number, cb: (err: any, value: number) => void) {
        cb(null, this.base + n);
      },
    };
    const add = promisify(obj.add);
    await expect(add.call(obj, 5)).resolves.toBe(15);
  });

  it('returns a plain native Promise, not a cancelable one', () => {
    const fn = (cb: (err: any, value: number) => void) => cb(null, 1);
    const promise = promisify(fn)();
    expect(promise).toBeInstanceOf(Promise);
    expect('cancel' in promise).toBe(false);
  });

  it('cancel is a detach no-op: a native promise cannot be canceled, callback still resolves it', async () => {
    const fn = (cb: (err: any, value: string) => void) => setTimeout(() => cb(null, 'done'), 0);
    const promise = promisify(fn)();
    expect(typeof (promise as any).cancel).toBe('undefined');
    await expect(promise).resolves.toBe('done');
  });
});

describe('promisifyAll', () => {
  function makeSource() {
    return {
      base: 3,
      readFile(this: any, name: string, cb: (err: any, value: string) => void) {
        cb(null, `${name}:${this.base}`);
      },
      readFileSync(name: string) {
        return name;
      },
      openStream() {
        return 'stream';
      },
    };
  }

  it('clone (default): new object with promisified methods only, Sync/Stream excluded', async () => {
    const source = makeSource();
    const out = promisifyAll(source);

    expect(out).not.toBe(source);
    expect(typeof out.readFile).toBe('function');
    expect((out as any).readFileSync).toBeUndefined();
    expect((out as any).openStream).toBeUndefined();

    await expect((out.readFile as any).call(source, 'f')).resolves.toBe('f:3');
  });

  it('merge: writes onto the source, keeps originals, requires a name change', async () => {
    const source = makeSource();
    const out = promisifyAll(source, { mode: 'merge', suffix: 'Async' });

    expect(out).toBe(source);
    expect(typeof (source as any).readFile).toBe('function');
    expect(typeof (source as any).readFileAsync).toBe('function');
    await expect((source as any).readFileAsync('g')).resolves.toBe('g:3');
  });

  it('honors include/exclude selection', () => {
    const source = makeSource();
    const out = promisifyAll(source, { include: ['readFile'] });
    expect(typeof out.readFile).toBe('function');
    expect((out as any).openStream).toBeUndefined();
  });

  it('names each produced method `promisify: <method name>`', () => {
    const source = makeSource();
    const out = promisifyAll(source, { include: ['readFile'] });

    expect((out.readFile as any).displayName).toBe('promisify: readFile');
  });
});

describe('promisify displayName', () => {
  it('names the wrapper `promisify: <name>` from a named source function', () => {
    function readFile(cb: (err: any, value: string) => void) {
      cb(null, 'ok');
    }

    const wrapped = promisify(readFile);

    expect((wrapped as any).displayName).toBe('promisify: readFile');
  });

  it('also sets the wrapper name where the name slot is configurable', () => {
    function readFile(cb: (err: any, value: string) => void) {
      cb(null, 'ok');
    }

    const wrapped = promisify(readFile);

    expect((wrapped as any).name).toBe((wrapped as any).displayName);
  });

  it('prefers a source whose displayName is set over its name', () => {
    const fn: any = (cb: (err: any, value: string) => void) => cb(null, 'ok');
    Object.defineProperty(fn, 'name', { value: 'rawFnName', configurable: true });
    fn.displayName = 'friendlyName';

    const wrapped = promisify(fn);

    expect((wrapped as any).displayName).toBe('promisify: friendlyName');
  });

  it('an explicit displayName option wins verbatim, no prefix', () => {
    function readFile(cb: (err: any, value: string) => void) {
      cb(null, 'ok');
    }

    const wrapped = promisify(readFile, { displayName: 'loadFile' });

    expect((wrapped as any).displayName).toBe('loadFile');
  });
});
