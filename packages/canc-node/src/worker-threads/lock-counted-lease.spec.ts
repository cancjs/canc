import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { isNotImplementedError } from '../errors/classes';
import { features } from '../features';
import { requestLock } from './locks';

let serial = 0;
const lockName = () => `counted-lease-${process.pid}-${++serial}`;

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function outcome(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    (value) => value,
    (error: unknown) => error,
  );
}

function available(name: string) {
  return requestLock(name, { ifAvailable: true }, (lock) => lock !== null);
}

describe('native lock feature gate', () => {
  it('asserts the native capability or its branded absence', async () => {
    if (features.hasWorkerLocks) {
      await expect(requestLock(lockName(), () => 17)).resolves.toBe(17);
    } else {
      const error = await outcome(requestLock(lockName(), () => 17));
      expect(isNotImplementedError(error)).toBe(true);
      expect(error).toMatchObject({ feature: 'requestLock', required: '24' });
    }
  });
});

const describeLocks = features.hasWorkerLocks ? describe : describe.skip;
describeLocks('counted holder and original lock lease (requires native lock manager)', () => {
  it.each([true, false])('preserves original body when shared=%s (otherwise bubble:false)', async (shared) => {
    const name = lockName();
    const entered = gate();
    const source = CancelablePromise.withResolvers<number>({ bubble: shared });
    const side = shared ? source.promise.then((value) => value) : undefined;
    const sideOutcome = side && outcome(side);
    let signal: AbortSignal | undefined;
    const holder = requestLock(name, (_lock, bodySignal) => {
      signal = bodySignal;
      entered.open();
      return source.promise;
    });
    const holderOutcome = outcome(holder);
    try {
      await entered.promise;
      await holder.cancel('stop');
      expect(isCancelError(await holderOutcome)).toBe(true);
      expect(signal?.aborted).toBe(true);
      expect(source.promise.canceled).toBe(false);
      expect(side?.canceled ?? false).toBe(false);
      expect(await available(name)).toBe(false);
      source.resolve(41);
      if (sideOutcome) expect(await sideOutcome).toBe(41);
      expect(await requestLock(name, () => 17)).toBe(17);
    } finally {
      source.resolve(41);
      await holder.cancel();
      await holderOutcome;
      if (sideOutcome) await sideOutcome;
    }
  });

  it('rejects holder promptly but waits for the sole body cleanup before ordinary grant', async () => {
    const name = lockName();
    const entered = gate();
    const cleanupStarted = gate();
    const cleanup = gate();
    let cancels = 0;
    let cleanupEnded = false;
    const source = new CancelablePromise<void>((_resolve, _reject, { handleCancel }) => {
      handleCancel(async () => {
        cancels++;
        cleanupStarted.open();
        await cleanup.promise;
        cleanupEnded = true;
      });
    });
    const holder = requestLock(name, () => {
      entered.open();
      return source;
    });
    const holderOutcome = outcome(holder);
    try {
      await entered.promise;
      const drain = holder.cancel('stop');
      expect(isCancelError(await holderOutcome)).toBe(true);
      await cleanupStarted.promise;
      expect(source.canceled).toBe(true);
      expect(cleanupEnded).toBe(false);
      expect(await available(name)).toBe(false);
      const next = requestLock(name, () => {
        expect(cleanupEnded).toBe(true);
        return 17;
      });
      holder.cancel('again');
      cleanup.open();
      await drain;
      expect(await next).toBe(17);
      expect(cancels).toBe(1);
    } finally {
      cleanup.open();
      await holder.cancel();
      await holderOutcome;
    }
  });

  it('allows native steal while the old cleanup remains pending', async () => {
    const name = lockName();
    const entered = gate();
    const cleanup = gate();
    const cleanupStarted = gate();
    let cleanupEnded = false;
    const holder = requestLock(name, () => {
      entered.open();
      return new CancelablePromise<void>((_resolve, _reject, { handleCancel }) => {
        handleCancel(async () => {
          cleanupStarted.open();
          await cleanup.promise;
          cleanupEnded = true;
        });
      });
    });
    const holderOutcome = outcome(holder);
    try {
      await entered.promise;
      expect(
        await requestLock(name, { steal: true }, () => {
          expect(cleanupEnded).toBe(false);
          return 29;
        }),
      ).toBe(29);
      const error = await holderOutcome;
      expect(isCancelError(error)).toBe(true);
      expect((error as { cause?: { name?: string } }).cause?.name).toBe('AbortError');
      await cleanupStarted.promise;
      expect(cleanupEnded).toBe(false);
    } finally {
      cleanup.open();
      await holder.cancel();
      await holderOutcome;
    }
  });

  it('signals a foreign promise without invoking its cancel member', async () => {
    const name = lockName();
    const entered = gate();
    const finish = gate();
    const cancel = jest.fn();
    const body = Object.assign(finish.promise, { cancel });
    let signal: AbortSignal | undefined;
    const holder = requestLock(name, (_lock, bodySignal) => {
      signal = bodySignal;
      entered.open();
      return body;
    });
    const holderOutcome = outcome(holder);
    try {
      await entered.promise;
      await holder.cancel();
      expect(isCancelError(await holderOutcome)).toBe(true);
      expect(signal?.aborted).toBe(true);
      expect(cancel).not.toHaveBeenCalled();
      expect(await available(name)).toBe(false);
    } finally {
      finish.open();
      await holderOutcome;
      await requestLock(name, () => undefined);
    }
  });

  it('honors cancellation reentrantly from inside the body', async () => {
    const name = lockName();
    const controller = new AbortController();
    const entered = gate();
    const cleanup = gate();
    let count = 0;
    const source = new CancelablePromise<void>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        count++;
        return cleanup.promise;
      });
    });
    const holder = requestLock(name, { signal: controller.signal }, () => {
      controller.abort('inside body');
      entered.open();
      return source;
    });
    const holderOutcome = outcome(holder);
    try {
      await entered.promise;
      expect(isCancelError(await holderOutcome)).toBe(true);
      expect(await available(name)).toBe(false);
      expect(count).toBe(1);
    } finally {
      cleanup.open();
      await holder.cancel();
      // A baseline implementation may not have canceled the source at all.
      await source.cancel();
      await holderOutcome;
      await requestLock(name, () => undefined);
    }
  });

  it('preserves an exact synchronous body error', async () => {
    const name = lockName();
    const failure = new Error('body error');
    await expect(
      requestLock(name, () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await requestLock(name, () => 23)).toBe(23);
  });
});
