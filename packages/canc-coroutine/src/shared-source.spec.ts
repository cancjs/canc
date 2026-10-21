import { CancelablePromise } from '@cancjs/promise';

import { cancAsync, cancAwait } from './coroutine';

// a counted release cancels the source two jobs later, a few extra turns cover any hop
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

function sharedSource() {
  let resolve!: (value: string) => void;
  let sourceCanceled = 0;
  const promise = new CancelablePromise<string>((res, _reject, { handleCancel }) => {
    resolve = res;
    handleCancel(() => {
      sourceCanceled++;
    });
  });
  return { promise, resolve, sourceCanceledCount: () => sourceCanceled };
}

describe('a source yielded by several coroutines', () => {
  it('keeps running for the others when one coroutine is canceled', async () => {
    const { promise, resolve, sourceCanceledCount } = sharedSource();
    const read = cancAsync(function* () {
      return yield* cancAwait(promise);
    });

    const a = read();
    const b = read();
    a.catch(() => {});

    a.cancel();
    await flush();

    expect(a.canceled).toBe(true);
    expect(promise.canceled).toBe(false);
    expect(sourceCanceledCount()).toBe(0);

    resolve('value');
    await expect(b).resolves.toBe('value');
    expect(promise.canceled).toBe(false);
  });

  it('is canceled once every coroutine awaiting it is canceled', async () => {
    const { promise, sourceCanceledCount } = sharedSource();
    const read = cancAsync(function* () {
      return yield* cancAwait(promise);
    });

    const a = read();
    const b = read();
    a.catch(() => {});
    b.catch(() => {});

    a.cancel();
    await flush();
    expect(promise.canceled).toBe(false);

    b.cancel();
    await flush();

    expect(promise.canceled).toBe(true);
    expect(sourceCanceledCount()).toBe(1);
    await expect(b).rejects.toMatchObject({ name: 'CancelError' });
  });

  it('is still canceled when the coroutine was its only consumer', async () => {
    const { promise, sourceCanceledCount } = sharedSource();
    const co = cancAsync(function* () {
      return yield* cancAwait(promise);
    })();
    co.catch(() => {});

    co.cancel();
    await flush();

    expect(promise.canceled).toBe(true);
    expect(sourceCanceledCount()).toBe(1);
  });

  it('stays alive while a plain then consumer still holds it', async () => {
    const { promise, resolve } = CancelablePromise.withResolvers<string>();
    const other = promise.then((value) => value.toUpperCase());
    const co = cancAsync(function* () {
      return yield* cancAwait(promise);
    })();
    co.catch(() => {});

    co.cancel();
    await flush();
    expect(promise.canceled).toBe(false);

    resolve('value');
    await expect(other).resolves.toBe('VALUE');
  });

  it('is canceled directly by a promise copy that cannot count consumers', async () => {
    const { promise, sourceCanceledCount } = sharedSource();
    // an older peer copy has no counted ref, the drain falls back to a direct cancel
    Object.defineProperty(promise, '_retainRef', { value: undefined });
    const read = cancAsync(function* () {
      return yield* cancAwait(promise);
    });

    const a = read();
    const b = read();
    a.catch(() => {});
    b.catch(() => {});

    a.cancel();

    expect(promise.canceled).toBe(true);
    expect(sourceCanceledCount()).toBe(1);
    b.cancel();
    await flush();
  });
});
