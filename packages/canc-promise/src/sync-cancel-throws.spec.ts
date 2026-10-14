import { CancelError } from './cancel-error';
import { CancelablePromise } from './cancelable-promise';

const syncMode = { asyncCancel: false };

function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// three handlers, the second throws; `ran` records which ones were called
function throwingHandlers(failure: Error): { ran: number[]; handlers: Array<() => void> } {
  const ran: number[] = [];
  return {
    ran,
    handlers: [
      () => {
        ran.push(1);
      },
      () => {
        ran.push(2);
        throw failure;
      },
      () => {
        ran.push(3);
      },
    ],
  };
}

function register(promise: CancelablePromise<unknown, unknown>, handlers: Array<() => void>): void {
  for (const handler of handlers) {
    promise.handleCancel(handler);
  }
}

let uncaught: unknown[];
const onUncaught = (error: unknown): void => {
  uncaught.push(error);
};

beforeEach(() => {
  uncaught = [];
  process.on('uncaughtException', onUncaught);
});

afterEach(() => {
  process.off('uncaughtException', onUncaught);
});

describe('sync-mode cancel handler that throws', () => {
  describe('direct cancel()', () => {
    it('runs every handler and rethrows the first error', () => {
      const failure = new Error('cleanup failed');
      const { ran, handlers } = throwingHandlers(failure);
      const promise = new CancelablePromise(() => {
        /**/
      }, syncMode);
      register(promise, handlers);

      expect(() => promise.cancel()).toThrow(failure);
      expect(ran).toEqual([1, 2, 3]);
      expect(promise.canceled).toBe(true);
    });

    it('rethrows only the first error when several handlers throw', () => {
      const first = new Error('first');
      const ran: number[] = [];
      const promise = new CancelablePromise(() => {
        /**/
      }, syncMode);
      promise.handleCancel(() => {
        ran.push(1);
        throw first;
      });
      promise.handleCancel(() => {
        ran.push(2);
        throw new Error('second');
      });

      expect(() => promise.cancel()).toThrow(first);
      expect(ran).toEqual([1, 2]);
    });
  });

  describe('abort signal', () => {
    it('runs every handler and raises no uncaught exception', async () => {
      const { ran, handlers } = throwingHandlers(new Error('cleanup failed'));
      const controller = new AbortController();
      const promise = new CancelablePromise(
        () => {
          /**/
        },
        { ...syncMode, signal: controller.signal },
      );
      register(promise, handlers);

      controller.abort();
      await flushMacrotask();

      expect(ran).toEqual([1, 2, 3]);
      expect(promise.canceled).toBe(true);
      expect(uncaught).toEqual([]);
    });
  });

  describe('bubble to the parent', () => {
    it('runs every parent handler and does not throw from the child cancel', async () => {
      const { ran, handlers } = throwingHandlers(new Error('parent cleanup failed'));
      const parent = new CancelablePromise(() => {
        /**/
      }, syncMode);
      register(parent, handlers);
      const child = parent.then();

      expect(() => child.cancel()).not.toThrow();
      await flushMacrotask();

      expect(ran).toEqual([1, 2, 3]);
      expect(parent.canceled).toBe(true);
      expect(uncaught).toEqual([]);
    });
  });

  describe('parent to child propagation', () => {
    it('runs every child handler and raises no uncaught exception', async () => {
      const { ran, handlers } = throwingHandlers(new Error('child cleanup failed'));
      const parent = new CancelablePromise(() => {
        /**/
      }, syncMode);
      const child = parent.then();
      register(child, handlers);

      parent.cancel();
      await flushMacrotask();

      expect(ran).toEqual([1, 2, 3]);
      expect(child.canceled).toBe(true);
      expect(uncaught).toEqual([]);
    });
  });

  describe('executor rejecting with a CancelError', () => {
    it('runs every handler and returns from reject', () => {
      const { ran, handlers } = throwingHandlers(new Error('cleanup failed'));
      let reject!: (reason: unknown) => void;
      const promise = new CancelablePromise((_resolve, rejectFn) => {
        reject = rejectFn;
      }, syncMode);
      register(promise, handlers);

      expect(() => reject(new CancelError())).not.toThrow();
      expect(ran).toEqual([1, 2, 3]);
      expect(promise.canceled).toBe(true);
    });

    it('runs every handler registered before a synchronous reject', () => {
      const { ran, handlers } = throwingHandlers(new Error('cleanup failed'));

      const create = () =>
        new CancelablePromise((_resolve, reject, { handleCancel }) => {
          for (const handler of handlers) {
            handleCancel(handler);
          }
          reject(new CancelError());
        }, syncMode);

      expect(create).not.toThrow();
      expect(ran).toEqual([1, 2, 3]);
    });
  });

  describe('combinator loser', () => {
    it('cancels every loser and settles the result when a loser handler throws', async () => {
      const failure = new Error('boom');
      const { ran, handlers } = throwingHandlers(new Error('loser cleanup failed'));
      const thrower = new CancelablePromise(() => {
        /**/
      }, syncMode);
      register(thrower, handlers);
      const other = new CancelablePromise(() => {
        /**/
      }, syncMode);
      const result = CancelablePromise.all([thrower, other, CancelablePromise.reject(failure)]);

      await expect(result).rejects.toBe(failure);
      expect(ran).toEqual([1, 2, 3]);
      expect(other.canceled).toBe(true);
      expect(uncaught).toEqual([]);
    });
  });
});
