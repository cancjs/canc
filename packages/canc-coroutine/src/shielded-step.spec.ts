import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { cancAsync, cancAwait } from './coroutine';
import { cancGenAsync, cancGenAwait } from './coroutine-gen';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

function controlled<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  let canceledCount = 0;
  const promise = new CancelablePromise<T>((res, rej, { handleCancel }) => {
    resolve = res;
    reject = rej;
    handleCancel(() => {
      canceledCount++;
    });
  });
  return { promise, resolve, reject, canceledCount: () => canceledCount };
}

function checkoutFixture(shield: boolean) {
  const stock = controlled<{ id: string }>();
  const charge = controlled<string>();
  const release = controlled<void>();
  const log: string[] = [];

  const reserveStock = (_orderId: string) => stock.promise;
  const chargeCard = (_orderId: string) => charge.promise;
  const releaseReservation = (_id: string) => release.promise;

  const checkout = cancAsync(function* (orderId: string) {
    const reservation = yield* cancAwait(reserveStock(orderId));

    try {
      return yield* cancAwait(chargeCard(orderId));
    } finally {
      if (shield) {
        yield* cancAwait(CancelablePromise.resolve(releaseReservation(reservation.id), { shield: true }));
      } else {
        yield* cancAwait(releaseReservation(reservation.id));
      }
      log.push('after release');
    }
  });

  return { stock, charge, release, log, checkout };
}

describe('a cancel landing on a shielded step in cancAsync', () => {
  it('lets a finally reached by return finish its cleanup, then settles canceled', async () => {
    const { stock, charge, release, log, checkout } = checkoutFixture(true);
    const p = checkout('order-1');
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );

    stock.resolve({ id: 'r1' });
    await flush();
    charge.resolve('paid');
    await flush();

    p.cancel();
    await flush();
    expect(log).toEqual([]);
    expect(release.canceledCount()).toBe(0);

    release.resolve();
    expect(isCancelError(await settled)).toBe(true);
    expect(log).toEqual(['after release']);
    expect(release.canceledCount()).toBe(0);
    expect(p.canceled).toBe(true);
  });

  it('lets a finally reached by throw finish its cleanup, then rejects with the body error', async () => {
    const { stock, charge, release, log, checkout } = checkoutFixture(true);
    const p = checkout('order-1');
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    const declined = new Error('declined');

    stock.resolve({ id: 'r1' });
    await flush();
    charge.reject(declined);
    await flush();

    p.cancel();
    await flush();
    expect(log).toEqual([]);

    release.resolve();
    expect(await settled).toBe(declined);
    expect(log).toEqual(['after release']);
    expect(release.canceledCount()).toBe(0);
  });

  it('still interrupts an unshielded cleanup step', async () => {
    const { stock, charge, release, log, checkout } = checkoutFixture(false);
    const p = checkout('order-1');
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );

    stock.resolve({ id: 'r1' });
    await flush();
    charge.resolve('paid');
    await flush();

    p.cancel();
    expect(isCancelError(await settled)).toBe(true);
    await flush();
    expect(release.canceledCount()).toBe(1);
    expect(log).toEqual([]);
  });

  it('resumes a try body after a shielded step and applies the cancel at the next unshielded one', async () => {
    const shielded = controlled<number>();
    const next = controlled<number>();
    let reached = 0;
    let finallyRuns = 0;

    const body = cancAsync(function* () {
      try {
        const a = yield* cancAwait(CancelablePromise.resolve(shielded.promise, { shield: true }));
        reached++;
        const b = yield* cancAwait(next.promise);
        reached++;
        return a + b;
      } finally {
        finallyRuns++;
      }
    });

    const p = body();
    const settled = p.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await flush();

    p.cancel();
    await flush();
    expect(reached).toBe(0);

    shielded.resolve(1);
    expect(isCancelError(await settled)).toBe(true);
    expect(reached).toBe(1);
    expect(finallyRuns).toBe(1);
    await flush();
    expect(shielded.canceledCount()).toBe(0);
    expect(next.canceledCount()).toBe(1);
  });

  it('settles canceled when the body returns before any unshielded step', async () => {
    const shielded = controlled<number>();

    const body = cancAsync(function* () {
      return yield* cancAwait(CancelablePromise.resolve(shielded.promise, { shield: true }));
    });

    const p = body();
    const settled = p.then(
      (value) => value,
      (error: unknown) => error,
    );
    await flush();

    p.cancel();
    shielded.resolve(5);
    expect(isCancelError(await settled)).toBe(true);
    expect(p.canceled).toBe(true);
  });
});

describe('a cancel landing on a shielded step in cancGenAsync', () => {
  function genFixture(shield: boolean) {
    const charge = controlled<string>();
    const release = controlled<void>();
    const log: string[] = [];

    const checkout = cancGenAsync(function* () {
      try {
        yield yield* cancGenAwait(charge.promise);
      } finally {
        if (shield) {
          yield* cancGenAwait(CancelablePromise.resolve(release.promise, { shield: true }));
        } else {
          yield* cancGenAwait(release.promise);
        }
        log.push('after release');
      }
    });

    return { charge, release, log, checkout };
  }

  it('lets a finally reached by return finish its cleanup', async () => {
    const { charge, release, log, checkout } = genFixture(true);
    const it = checkout();

    const first = it.next() as CancelablePromise<any>;
    charge.resolve('paid');
    await expect(first).resolves.toEqual({ value: 'paid', done: false });

    const second = it.next() as CancelablePromise<any>;
    const settled = second.catch((error: unknown) => error);
    await flush();
    second.cancel();
    await flush();
    expect(log).toEqual([]);
    expect(second.cancelable).toBe(true);

    release.resolve();
    expect(isCancelError(await settled)).toBe(true);
    expect(log).toEqual(['after release']);
    expect(release.canceledCount()).toBe(0);
    await expect(it.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('lets a finally reached by throw finish its cleanup', async () => {
    const { charge, release, log, checkout } = genFixture(true);
    const it = checkout();

    const first = it.next() as CancelablePromise<any>;
    const settled = first.catch((error: unknown) => error);
    const declined = new Error('declined');
    await flush();
    charge.reject(declined);
    await flush();
    first.cancel();
    await flush();
    expect(log).toEqual([]);

    release.resolve();
    expect(await settled).toBe(declined);
    expect(log).toEqual(['after release']);
    expect(release.canceledCount()).toBe(0);
  });

  it('still interrupts an unshielded cleanup step', async () => {
    const { charge, release, log, checkout } = genFixture(false);
    const it = checkout();

    const first = it.next() as CancelablePromise<any>;
    charge.resolve('paid');
    await first;

    const second = it.next() as CancelablePromise<any>;
    await flush();
    second.cancel();
    expect(isCancelError(await second.catch((error: unknown) => error))).toBe(true);
    await flush();
    expect(release.canceledCount()).toBe(1);
    expect(log).toEqual([]);
  });

  it('resumes the body after a shielded step and applies the cancel at the next unshielded one', async () => {
    const shielded = controlled<number>();
    const next = controlled<number>();
    let reached = 0;
    let finallyRuns = 0;

    const producer = cancGenAsync(function* () {
      try {
        yield* cancGenAwait(CancelablePromise.resolve(shielded.promise, { shield: true }));
        reached++;
        yield* cancGenAwait(next.promise);
        reached++;
      } finally {
        finallyRuns++;
      }
    });

    const it = producer();
    const first = it.next() as CancelablePromise<any>;
    const settled = first.catch((error: unknown) => error);
    await flush();
    first.cancel();
    await flush();
    expect(reached).toBe(0);

    shielded.resolve(1);
    expect(isCancelError(await settled)).toBe(true);
    expect(reached).toBe(1);
    expect(finallyRuns).toBe(1);
    expect(shielded.canceledCount()).toBe(0);
    expect(next.canceledCount()).toBe(1);
  });
});
