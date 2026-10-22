import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { cancAsync } from './coroutine';
import { cancGenAsync, cancGenAwait } from './coroutine-gen';

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

describe('coroutine with an already aborted signal', () => {
  it('cancAsync never runs the body and rejects with CancelError', async () => {
    let sideEffects = 0;
    let bodyCalls = 0;

    const co = cancAsync(
      function* () {
        bodyCalls++;
        try {
          sideEffects++;
          yield CancelablePromise.resolve(1);
          sideEffects++;
        } finally {
          sideEffects++;
        }
      },
      undefined,
      { signal: abortedSignal('early') },
    );

    const p = co();
    const settled = p.then(
      () => undefined,
      (e) => e,
    );
    expect(p.canceled).toBe(true);
    expect(isCancelError(await settled)).toBe(true);
    await macrotask();

    expect(bodyCalls).toBe(0);
    expect(sideEffects).toBe(0);
  });

  it('cancGenAsync never runs the body and rejects with CancelError', async () => {
    let bodyCalls = 0;
    let sideEffects = 0;

    const gen = cancGenAsync(
      function* () {
        bodyCalls++;
        sideEffects++;
        yield* cancGenAwait(CancelablePromise.resolve(1));
        sideEffects++;
        yield 'emitted';
      },
      { signal: abortedSignal('early') },
    );

    const it = gen();
    const error = await it.next().then(
      () => undefined,
      (e) => e,
    );
    await macrotask();

    expect(isCancelError(error)).toBe(true);
    expect(bodyCalls).toBe(0);
    expect(sideEffects).toBe(0);
  });

  it('strict mode returns a rejected promise instead of throwing', async () => {
    let bodyCalls = 0;
    const co = cancAsync(
      function* () {
        bodyCalls++;
        yield CancelablePromise.resolve(1);
      },
      undefined,
      { signal: abortedSignal('early'), strict: true },
    );

    let p: CancelablePromise<unknown> | undefined;
    expect(() => {
      p = co();
    }).not.toThrow();

    await expect(p).rejects.toBeInstanceOf(Error);
    expect(bodyCalls).toBe(0);
  });

  it('cancGenAsync strict mode returns a rejected step instead of throwing', async () => {
    const gen = cancGenAsync(
      function* () {
        yield 1;
      },
      { signal: abortedSignal('early'), strict: true },
    );

    const it = gen();
    let step: Promise<unknown> | undefined;
    expect(() => {
      step = it.next();
    }).not.toThrow();

    await expect(step).rejects.toBeInstanceOf(Error);
  });
});

describe('coroutine cancel settlement', () => {
  it('a cancel accepted inside the body settles even when the body then throws', async () => {
    let firstCancel: any;
    const bodyError = new Error('after self-cancel');

    const co = cancAsync(
      function* () {
        yield CancelablePromise.resolve(1);
        firstCancel = self.cancel('bye');
        throw bodyError;
      },
      undefined,
      { asyncCancel: true },
    );

    const self: CancelablePromise<unknown> = co();
    const outcome = self.then(
      () => undefined,
      (e) => e,
    );

    await macrotask();
    expect(firstCancel).toBeInstanceOf(CancelablePromise);

    let firstSettled = false;
    void firstCancel.then(() => {
      firstSettled = true;
    });

    const secondCancel = self.cancel('again');
    let secondSettled = secondCancel === undefined;
    if (secondCancel) {
      void secondCancel.then(() => {
        secondSettled = true;
      });
    }

    await macrotask();

    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(true);
    expect(await outcome).toBe(bodyError);
  });

  it('cancel handlers receive the raw reason', async () => {
    const reason = { code: 'stop' };
    const seen: unknown[] = [];

    const co = cancAsync(function* () {
      try {
        yield new CancelablePromise(() => undefined);
      } finally {
        yield CancelablePromise.resolve('cleanup');
      }
    });

    const p = co();
    p.handleCancel((r) => {
      seen.push(r);
    });

    await macrotask();
    p.cancel(reason);
    // the coroutine stays pending while its finally blocks drain
    expect(p.canceled).toBe(false);

    const error = await p.then(
      () => undefined,
      (e) => e,
    );

    expect(seen).toEqual([reason]);
    expect(error).toBeInstanceOf(CancelError);
    expect(error.cause).toBe(reason);
    expect(p.canceled).toBe(true);
  });

  it('a string reason reaches handlers as is and becomes the rejection message', async () => {
    const seen: unknown[] = [];

    const co = cancAsync(function* () {
      yield new CancelablePromise(() => undefined);
    });

    const p = co();
    p.handleCancel((r) => {
      seen.push(r);
    });

    await macrotask();
    p.cancel('stop');

    const error = await p.then(
      () => undefined,
      (e) => e,
    );

    expect(seen).toEqual(['stop']);
    expect(error.message).toBe('stop');
  });
});
