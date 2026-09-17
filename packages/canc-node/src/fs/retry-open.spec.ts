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
        const err = new Error('too many open files');
        (err as any).code = 'EMFILE';
        throw err;
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
        const err = new Error('file table overflow');
        (err as any).code = 'ENFILE';
        throw err;
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
      const err = new Error('permission denied');
      (err as any).code = 'EACCES';
      throw err;
    };

    let caught: any;
    try {
      await retryOpen(fakeOpen, { minTimeout: 1 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('EACCES');
    expect(caught.message).toBe('permission denied');
    expect(attempts).toBe(1);
  });

  it('is bounded and rejects after configured maximum attempts when EMFILE persists', async () => {
    setFs(honestFake, { retryOpen: true });

    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      const err = new Error('too many open files');
      (err as any).code = 'EMFILE';
      throw err;
    };

    let caught: any;
    try {
      await retryOpen(fakeOpen, { retries: 4, minTimeout: 1, factor: 1 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('EMFILE');
    expect(attempts).toBe(4);
  });

  it('rejects CancelError and stops retrying when canceled during retry sleep', async () => {
    setFs(honestFake, { retryOpen: true });

    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      const err = new Error('too many open files');
      (err as any).code = 'EMFILE';
      throw err;
    };

    // Long enough minTimeout so cancel lands during the backoff sleep
    const p = retryOpen(fakeOpen, { minTimeout: 100, factor: 1 });

    // Wait for attempt 1 to fail and enter timer wait
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(attempts).toBe(1);

    p.cancel('operation canceled');

    let caught: any;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(isCancelError(caught)).toBe(true);

    // Wait longer than the backoff timer to confirm no further attempts fired
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(attempts).toBe(1);
  });

  it('performs zero retries when retryOpen is false (the default)', async () => {
    // retryOpen is false by default
    let attempts = 0;
    const fakeOpen = () => {
      attempts++;
      const err = new Error('too many open files');
      (err as any).code = 'EMFILE';
      throw err;
    };

    let caught: any;
    try {
      await retryOpen(fakeOpen);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('EMFILE');
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
            const err = new Error('too many files');
            (err as any).code = 'EMFILE';
            throw err;
          }
          return Promise.resolve(fakeHandle);
        }),
      },
    };

    setFs(fakeFs, { retryOpen: true });

    const fh = await open('test.txt');
    expect(fh).toBeDefined();
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
            const err = new Error('too many files');
            (err as any).code = 'EMFILE';
            throw err;
          }
          return Promise.resolve(fakeDir);
        }),
      },
    };

    setFs(fakeFs, { retryOpen: true });

    const dir = await opendir('some-dir');
    expect(dir).toBeDefined();
    expect(attempts).toBe(2);
  });
});
