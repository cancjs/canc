import { CancelError, isCancelError } from '@cancjs/promise';

import { NotImplementedError } from '../errors/classes';
import { gatedWrapped, signalWrapped, teardownWrapped } from './wrap';

const isAbortError = (err: any) => err?.name === 'AbortError';

describe('wrap', () => {
  describe('signalWrapped', () => {
    it('aborts the signal the fake received when returned promise is canceled, and promise rejects CancelError, not AbortError', async () => {
      let receivedSignal: AbortSignal | undefined;
      const fake = jest.fn((options: any) => {
        receivedSignal = options.signal;
        return new Promise(() => {}); // hang
      });
      const entry = {
        nodeSignal: { sinceByMajor: { '24': 'v24', '20': 'v20', '22': 'v22', '18': 'v18', '26': 'v26' } },
      };
      // Force it to match any major
      const wrapped = signalWrapped(fake, entry, parseInt(process.versions.node.split('.')[0], 10));

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

    it('calls the underlying fn with no signal key at all when sinceByMajor omits the running major', async () => {
      let receivedOptions: any;
      const fake = jest.fn((options: any) => {
        receivedOptions = options;
        return Promise.resolve();
      });
      const entry = { nodeSignal: { sinceByMajor: { '999': 'v999' } } }; // missing current major
      const wrapped = signalWrapped(fake, entry);

      const p = wrapped({ someOpt: true });
      await p;

      expect(receivedOptions).toBeDefined();
      expect('signal' in receivedOptions).toBe(false);
      expect(receivedOptions.someOpt).toBe(true);
    });
  });

  describe('teardownWrapped', () => {
    it('runs the teardown exactly once if canceled before settling, zero times if canceled after settling', async () => {
      const teardown = jest.fn();
      let resolveInner: any;
      const fake = () =>
        new Promise((r) => {
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
        new Promise((r) => {
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
      const wrapped = gatedWrapped(false, 'testFeature', 'v99.0.0', () => {});
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
