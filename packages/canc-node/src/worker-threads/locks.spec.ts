import { CancelablePromise, CancelError } from '@cancjs/promise';

import { isNotImplementedError } from '../errors/classes';
import { features } from '../features';
import { requestLock } from './locks';

let nextName = 0;

// the lock manager is process-wide, so a name shared with another suite would serialize against it
function lockName(): string {
  nextName += 1;
  return `canc-node-test-${process.pid}-${nextName}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const describeLocks = features.hasWorkerLocks ? describe : describe.skip;

describeLocks('requestLock', () => {
  it('resolves what the body returns, with the lock it was granted', async () => {
    const name = lockName();

    await expect(requestLock(name, (lock) => `${lock?.name}:${lock?.mode}`)).resolves.toBe(`${name}:exclusive`);
  });

  it('serializes two holders of the same lock', async () => {
    const name = lockName();
    const order: string[] = [];
    let releaseFirst = (): void => undefined;

    const first = requestLock(name, () => {
      order.push('first-in');
      return new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    });
    await sleep(50);

    const second = requestLock(name, () => {
      order.push('second-in');
    });
    await sleep(50);

    expect(order).toEqual(['first-in']);

    releaseFirst();
    await first;
    await second;

    expect(order).toEqual(['first-in', 'second-in']);
  });

  it('canceling a waiter aborts the acquisition and leaves the holder alone', async () => {
    const name = lockName();
    let waiterRan = false;
    let releaseHolder = (): void => undefined;

    const holder = requestLock(name, () => {
      return new Promise<string>((resolve) => {
        releaseHolder = () => resolve('held to the end');
      });
    });
    await sleep(50);

    const waiter = requestLock(name, () => {
      waiterRan = true;
    });
    await sleep(50);

    waiter.cancel();
    await expect(waiter).rejects.toThrow(CancelError);
    expect(waiterRan).toBe(false);

    releaseHolder();
    await expect(holder).resolves.toBe('held to the end');
  });

  it('canceling a holder cancels the body, releases the lock and lets the next waiter in', async () => {
    const name = lockName();
    let bodyCanceled = false;
    let nextRan = false;

    const holder = requestLock(
      name,
      () =>
        new CancelablePromise<void>((_resolve, _reject, { handleCancel }) => {
          handleCancel(() => {
            bodyCanceled = true;
          });
        }),
    );
    await sleep(50);

    const next = requestLock(name, () => {
      nextRan = true;
      return 'acquired after the cancel';
    });
    await sleep(50);

    expect(nextRan).toBe(false);

    await holder.cancel();
    await expect(holder).rejects.toThrow(CancelError);

    await expect(next).resolves.toBe('acquired after the cancel');
    expect(bodyCanceled).toBe(true);
  });

  it('hands the body null instead of queueing when ifAvailable meets a held lock', async () => {
    const name = lockName();
    let releaseHolder = (): void => undefined;

    const holder = requestLock(name, () => {
      return new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });
    });
    await sleep(50);

    await expect(requestLock(name, { ifAvailable: true }, (lock) => lock)).resolves.toBeNull();

    releaseHolder();
    await holder;
  });

  it("aborts the acquisition from the caller's own signal", async () => {
    const name = lockName();
    const controller = new AbortController();
    let waiterRan = false;
    let releaseHolder = (): void => undefined;

    const holder = requestLock(name, () => {
      return new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });
    });
    await sleep(50);

    const waiter = requestLock(name, { signal: controller.signal }, () => {
      waiterRan = true;
    });
    await sleep(50);
    controller.abort();

    await expect(waiter).rejects.toThrow(CancelError);
    expect(waiterRan).toBe(false);

    releaseHolder();
    await holder;
  });
});

describe('requestLock gate', () => {
  it('throws NotImplementedError naming node 24 where there is no lock manager', () => {
    jest.isolateModules(() => {
      jest.doMock('../features', () => ({
        features: { ...jest.requireActual('../features').features, hasWorkerLocks: false },
      }));

      const gatedLocks = require('./locks');

      let error: unknown;
      try {
        gatedLocks.requestLock('any-name', () => undefined);
      } catch (err) {
        error = err;
      }

      expect(isNotImplementedError(error)).toBe(true);
      expect((error as { required?: string }).required).toBe('24');
      expect((error as { feature?: string }).feature).toBe('requestLock');
    });
  });
});
