import { isCancelError } from '@cancjs/promise';

import { open, opendir } from './index';
import { IFsLike, resetFs, setFs } from './registry';
import { retryOpen, withRetryOpen } from './retry-open';

describe('retry-open EMFILE and ENFILE retry logic', () => {
  const honestFake: IFsLike = {
    promises: {
      open: jest.fn(),
    },
  };

  afterEach(() => {
    resetFs();
  });

  it('retries on EMFILE and succeeds when operation eventually succeeds', async () => {
    setFs(honestFake, { retryOpen: true });

    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      if (attempts < 3) {
        throw Object.assign(new Error('too many open files'), { code: 'EMFILE' });
      }
      return 'handle-ok';
    };

    const result = await retryOpen(fakeOpen, { minTimeout: 1, factor: 1 });
    expect(result).toBe('handle-ok');
    expect(attempts).toBe(3);
  });

  it('retries on ENFILE and succeeds when operation eventually succeeds', async () => {
    setFs(honestFake, { retryOpen: true });

    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      if (attempts < 2) {
        throw Object.assign(new Error('file table overflow'), { code: 'ENFILE' });
      }
      return 'handle-enfile-ok';
    };

    const wrapped = withRetryOpen(fakeOpen, { minTimeout: 1, factor: 1 });
    const result = await wrapped();
    expect(result).toBe('handle-enfile-ok');
    expect(attempts).toBe(2);
  });

  it('does not retry on EACCES and propagates error unchanged after one attempt', async () => {
    setFs(honestFake, { retryOpen: true });

    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    };

    let caught: { code?: string; message?: string } | undefined;
    try {
      await retryOpen(fakeOpen, { minTimeout: 1 });
    } catch (err) {
      caught = err as { code?: string; message?: string };
    }

    expect(caught?.code).toBe('EACCES');
    expect(caught?.message).toBe('permission denied');
    expect(attempts).toBe(1);
  });

  it('is bounded and rejects after configured maximum attempts when EMFILE persists', async () => {
    setFs(honestFake, { retryOpen: true });

    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      throw Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    };

    let caught: { code?: string } | undefined;
    try {
      await retryOpen(fakeOpen, { retries: 4, minTimeout: 1, factor: 1 });
    } catch (err) {
      caught = err as { code?: string };
    }

    expect(caught?.code).toBe('EMFILE');
    expect(attempts).toBe(4);
  });

  it('rejects CancelError and stops retrying when canceled during retry sleep', async () => {
    jest.useFakeTimers();
    try {
      setFs(honestFake, { retryOpen: true });

      let attempts = 0;
      const fakeOpen = () => {
        attempts++;
        throw Object.assign(new Error('too many open files'), { code: 'EMFILE' });
      };

      // Long enough minTimeout so cancel lands during the backoff sleep
      const p = retryOpen(fakeOpen, { minTimeout: 100, factor: 1 });

      // Drain microtasks for attempt 1 to fail and enter timer wait
      await Promise.resolve();
      expect(attempts).toBe(1);

      p.cancel('operation canceled');

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(isCancelError(caught)).toBe(true);

      // Advance fake timers past backoff timer to confirm no further attempts fired
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      expect(attempts).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('performs zero retries when retryOpen is false (the default)', async () => {
    // retryOpen is false by default
    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      throw Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    };

    let caught: { code?: string } | undefined;
    try {
      await retryOpen(fakeOpen);
    } catch (err) {
      caught = err as { code?: string };
    }

    expect(caught?.code).toBe('EMFILE');
    expect(attempts).toBe(1);
  });

  it('open from /fs routes through retryOpen when enabled', async () => {
    let attempts = 0;
    const fakeHandle = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    const fakeFs = {
      promises: {
        open: jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 2) {
            throw Object.assign(new Error('too many files'), { code: 'EMFILE' });
          }
          return Promise.resolve(fakeHandle);
        }),
      },
    };

    setFs(fakeFs, { retryOpen: true });

    const fh = await open('test.txt');
    expect(typeof fh.close).toBe('function');
    expect(attempts).toBe(2);
  });

  it('opendir from /fs routes through retryOpen when enabled', async () => {
    let attempts = 0;
    const fakeDir = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    const fakeFs = {
      promises: {
        opendir: jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 2) {
            throw Object.assign(new Error('too many files'), { code: 'EMFILE' });
          }
          return Promise.resolve(fakeDir);
        }),
      },
    };

    setFs(fakeFs, { retryOpen: true });

    const dir = await opendir('some-dir');
    expect(typeof dir.close).toBe('function');
    expect(attempts).toBe(2);
  });
});
