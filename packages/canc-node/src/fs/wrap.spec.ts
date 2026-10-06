import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { NotImplementedError } from '../errors/classes';
import {
  acceptsSignal,
  adopted,
  gatedWrapped,
  IManifestEntry,
  passthrough,
  promisifySignalWrapped,
  promisifyWrapped,
  signalWrapped,
  teardownWrapped,
} from './wrap';

const isAbortError = (err: any) => err?.name === 'AbortError';

// Signal availability is read off the manifest, never off a version string, so these fixtures state
// the two cases that matter: support older than every supported release line, and support confined
// to release lines this runtime is not on.
const alwaysSignal: IManifestEntry = {
  name: 'fake',
  nodeSignal: { documented: true, since: 'v15.2.0', sinceByMajor: null, probed: 'reject:AbortError' },
};

const neverSignal: IManifestEntry = {
  name: 'fake',
  nodeSignal: { documented: true, since: 'v999.0.0', sinceByMajor: { '999': 'v999.0.0' }, probed: null },
};

// stat and lstat gained the option partway through release line 26, which is the case a comparison
// of majors alone gets wrong
const backportedSignal: IManifestEntry = {
  name: 'stat',
  nodeSignal: { documented: true, since: 'v26.8.0', sinceByMajor: { '26': 'v26.8.0' }, probed: 'resolve' },
};

describe('wrap', () => {
  describe('acceptsSignal', () => {
    it('compares the whole version against the release this line gained the option in', () => {
      expect(acceptsSignal(backportedSignal, '26.7.9')).toBe(false);
      expect(acceptsSignal(backportedSignal, '26.8.0')).toBe(true);
      expect(acceptsSignal(backportedSignal, '26.9.1')).toBe(true);
    });

    it('answers for a line the map does not name from the newest line below it', () => {
      expect(acceptsSignal(backportedSignal, '24.20.0')).toBe(false);
      expect(acceptsSignal(backportedSignal, '27.0.0')).toBe(true);
    });

    it('takes a missing map to mean support older than every line this package runs on', () => {
      expect(acceptsSignal(alwaysSignal, '18.20.8')).toBe(true);
      expect(acceptsSignal(undefined, '26.8.0')).toBe(false);
    });
  });

  describe('signalWrapped', () => {
    it('gives node a signal that aborts when the caller aborts theirs, and cancels with CancelError', async () => {
      let receivedSignal: AbortSignal | undefined;
      const fake = jest.fn((options: any) => {
        receivedSignal = options.signal;
        return new Promise(() => {}); // hang
      });
      const wrapped = signalWrapped(fake as any, alwaysSignal);

      const controller = new AbortController();
      const p = wrapped({ signal: controller.signal, someOpt: true });

      // the caller's signal is theirs to abort, ours is the one node is watching
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).not.toBe(controller.signal);
      expect(fake.mock.calls[0][0].someOpt).toBe(true);

      controller.abort();

      let error: any;
      try {
        await p;
      } catch (err) {
        error = err;
      }
      expect(isCancelError(error)).toBe(true);
      expect(receivedSignal?.aborted).toBe(true);
    });

    it('aborts the signal the fake received when returned promise is canceled, and promise rejects CancelError, not AbortError', async () => {
      let receivedSignal: AbortSignal | undefined;
      const fake = jest.fn((options: any) => {
        receivedSignal = options.signal;
        return new Promise(() => {}); // hang
      });
      const wrapped = signalWrapped(fake as any, alwaysSignal);

      const p = wrapped({ someOpt: true });
      p.cancel('reason');

      await expect(p).rejects.toThrow(CancelError);
      let error: any;
      try {
        await p;
      } catch (err) {
        error = err;
      }
      expect(isCancelError(error)).toBe(true);
      expect(isAbortError(error)).toBe(false);

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(true);
    });

    it('calls the underlying fn with no signal key at all when the running release line has none', async () => {
      let receivedOptions: any;
      const fake = jest.fn((options: any) => {
        receivedOptions = options;
        return Promise.resolve();
      });
      const wrapped = signalWrapped(fake as any, neverSignal);

      const controller = new AbortController();
      const p = wrapped({ signal: controller.signal, someOpt: true });
      await p;

      expect(receivedOptions).toBeDefined();
      expect('signal' in receivedOptions).toBe(false);
      expect(receivedOptions.someOpt).toBe(true);
    });

    it('places the signal at the options position instead of merging into whatever came last', async () => {
      let received: any[] = [];
      const fake = jest.fn((...args: any[]) => {
        received = args;
        return Promise.resolve();
      });
      // writeFile shape: the trailing string is data, not an encoding
      const wrapped = signalWrapped(fake as any, alwaysSignal, 2);

      await wrapped('file.txt', 'contents');

      expect(received[0]).toBe('file.txt');
      expect(received[1]).toBe('contents');
      expect(received[2].signal).toBeDefined();
      expect(received[2].encoding).toBeUndefined();
    });

    it('merges the signal into the encoding shorthand node accepts in place of options', async () => {
      let received: any[] = [];
      const fake = jest.fn((...args: any[]) => {
        received = args;
        return Promise.resolve();
      });
      const wrapped = signalWrapped(fake as any, alwaysSignal, 1);

      await wrapped('file.txt', 'utf8');

      expect(received[1].encoding).toBe('utf8');
      expect(received[1].signal).toBeDefined();
    });
  });

  describe('promisifySignalWrapped', () => {
    it('passes the signal to a callback api in one promise, and aborts it on cancel', async () => {
      let receivedSignal: AbortSignal | undefined;
      const fake = jest.fn((_path: string, options: any, _cb: (err: unknown) => void) => {
        receivedSignal = options.signal;
      });
      const wrapped = promisifySignalWrapped(fake as any, alwaysSignal, 1);

      const p = wrapped('file.txt');
      p.cancel();

      await expect(p).rejects.toThrow(CancelError);
      expect(receivedSignal?.aborted).toBe(true);
    });

    it('leaves the arguments alone when the running release line takes no signal', async () => {
      const fake = jest.fn((_path: string, cb: (err: unknown, value: string) => void) => {
        cb(null, 'done');
      });
      const wrapped = promisifySignalWrapped(fake as any, neverSignal, 1);

      await expect(wrapped('file.txt')).resolves.toBe('done');
      expect(fake.mock.calls[0].length).toBe(2);
    });

    it('gives node a signal that aborts when the caller aborts theirs', async () => {
      let receivedOptions: any;
      const fake = jest.fn((_path: string, options: any, _cb: (err: unknown) => void) => {
        receivedOptions = options;
      });
      const wrapped = promisifySignalWrapped(fake as any, alwaysSignal, 1);

      const controller = new AbortController();
      const p = wrapped('file.txt', { signal: controller.signal, encoding: 'utf8' });

      expect(receivedOptions.signal).toBeDefined();
      expect(receivedOptions.signal).not.toBe(controller.signal);
      expect(receivedOptions.encoding).toBe('utf8');

      controller.abort();

      await expect(p).rejects.toThrow(CancelError);
      expect(receivedOptions.signal.aborted).toBe(true);
    });
  });

  describe('promisifyWrapped', () => {
    it('gives the promise a signal that aborts when caller aborts theirs, and strips signal from options', async () => {
      let receivedOptions: any;
      const fake = jest.fn((_path: string, options: any, _cb: (err: unknown) => void) => {
        receivedOptions = options;
      });
      const wrapped = promisifyWrapped(fake as any, 1);

      const controller = new AbortController();
      const p = wrapped('file.txt', { signal: controller.signal, encoding: 'utf8' });

      expect(receivedOptions).toBeDefined();
      expect('signal' in receivedOptions).toBe(false);
      expect(receivedOptions.encoding).toBe('utf8');

      controller.abort();

      await expect(p).rejects.toThrow(CancelError);
    });
  });

  describe('adopted', () => {
    it('gives the promise a signal that aborts when caller aborts theirs, and strips signal from options', async () => {
      let receivedOptions: any;
      const fake = jest.fn((_path: string, options: any) => {
        receivedOptions = options;
        return new Promise(() => {}); // hang
      });
      const wrapped = adopted(fake as any, 1);

      const controller = new AbortController();
      const p = wrapped('file.txt', { signal: controller.signal, recursive: true });

      expect(receivedOptions).toBeDefined();
      expect('signal' in receivedOptions).toBe(false);
      expect(receivedOptions.recursive).toBe(true);

      controller.abort();

      await expect(p).rejects.toThrow(CancelError);
    });
  });

  describe('passthrough', () => {
    it('hands back what node returned, so an async iterable is still iterable', async () => {
      async function* fake(): AsyncGenerator<string> {
        yield 'one';
        yield 'two';
      }
      const wrapped = passthrough(fake as any);

      const seen: string[] = [];
      for await (const value of wrapped() as AsyncIterable<string>) {
        seen.push(value);
      }

      expect(seen).toEqual(['one', 'two']);
    });
  });

  describe.each([
    ['CancelablePromise', (r: (v: unknown) => void) => new CancelablePromise(r)],
    ['native Promise', (r: (v: unknown) => void) => new Promise(r)],
  ])('teardownWrapped (%s inner)', (_name, makeInner) => {
    it('runs the teardown exactly once if canceled before settling, zero times if canceled after settling', async () => {
      const teardown = jest.fn();
      let resolveInner: any;
      const fake = () =>
        makeInner((r) => {
          resolveInner = r;
        });
      const wrapped = teardownWrapped(fake, teardown);

      const p1 = wrapped();
      p1.cancel();
      resolveInner('val');
      await expect(p1).rejects.toThrow(CancelError);
      // teardown runs in microtask after resolveInner, so wait
      await new Promise((r) => setTimeout(r, 0));
      expect(teardown).toHaveBeenCalledTimes(1);
      expect(teardown).toHaveBeenCalledWith('val', []);

      teardown.mockClear();
      const p2 = wrapped();
      resolveInner('val2');
      await p2;
      p2.cancel();
      await new Promise((r) => setTimeout(r, 0));
      expect(teardown).not.toHaveBeenCalled();
    });

    it('does not turn CancelError into something else if teardown throws', async () => {
      const teardown = jest.fn(() => {
        throw new Error('teardown fail');
      });
      let resolveInner: any;
      const fake = () =>
        makeInner((r) => {
          resolveInner = r;
        });
      const wrapped = teardownWrapped(fake, teardown);

      const p = wrapped();
      p.cancel();
      resolveInner('val');

      let error: any;
      try {
        await p;
      } catch (err) {
        error = err;
      }
      expect(isCancelError(error)).toBe(true);
      expect(error.message).not.toContain('teardown fail');
    });
  });

  describe('gatedWrapped', () => {
    it('throws NotImplementedError naming the feature and version when false', () => {
      const wrapped = gatedWrapped(false, 'testFeature', 'v99.0.0', () => () => {});
      let err: any;
      try {
        wrapped();
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(NotImplementedError);
      expect(err.message).toMatch(/testFeature/);
      expect((err as any).required).toBe('v99.0.0');
    });
  });
});
