import { CancelablePromise, CancelError, isCancelError, isCancelSignal } from '@cancjs/promise';

import type { IAbortSignalLike } from '../../_toolbox';
import { createAbortSignal, toAbortSignal, withSignal } from './abort';
import { AbortError, isAbortError } from './errors';
import { fromAbortSignal, timeout } from './prebound';

/** A fake signal that counts listener attach and detach, so removal can be asserted directly. */
function spySignal(): IAbortSignalLike & { addCalls: number; removeCalls: number; fire(): void } {
  let listener: (() => void) | undefined;
  let aborted = false;

  return {
    get aborted() {
      return aborted;
    },
    reason: undefined,
    addCalls: 0,
    removeCalls: 0,
    addEventListener(_type: 'abort', fn: () => void) {
      this.addCalls++;
      listener = fn;
    },
    removeEventListener(_type: 'abort', fn: () => void) {
      if (listener === fn) {
        this.removeCalls++;
        listener = undefined;
      }
    },
    fire() {
      aborted = true;
      listener?.();
    },
  };
}

function abortReason(controller = new AbortController()): Error {
  controller.abort();
  return controller.signal.reason as Error;
}

/** Deterministic microtask flush for cancel-cascade settlement (mirrors the core promise suite). */
async function drain(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

const platformDomException = (globalThis as unknown as { DOMException?: new (...args: any[]) => object }).DOMException;

describe('AbortError / isAbortError', () => {
  it('AbortError is named AbortError and carries a default message', () => {
    const error = new AbortError();
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('The operation was aborted');
    // Backed by the platform DOMException where one exists (shared with the platform's own
    // AbortError), which is not an instance of Error there; falls back to Error otherwise.
    expect(error).toBeInstanceOf(platformDomException ?? Error);
  });

  it('detects a bare DOMException AbortError', () => {
    expect(isAbortError(abortReason())).toBe(true);
  });

  it('detects an AbortError instance', () => {
    expect(isAbortError(new AbortError())).toBe(true);
  });

  it('rejects a CancelError, an ordinary Error, and non-objects', () => {
    expect(isAbortError(new CancelError('canceled'))).toBe(false);
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('createAbortSignal (plain convenience)', () => {
  it('returns a signal and a bound abort with no CancelError wiring', () => {
    const { signal, abort } = createAbortSignal();
    expect(signal.aborted).toBe(false);
    abort();
    expect(signal.aborted).toBe(true);
    // A plain abort reason is a DOMException AbortError, not a CancelError.
    expect(isCancelError(signal.reason)).toBe(false);
    expect(isAbortError(signal.reason)).toBe(true);
  });

  it('forwards an explicit abort reason', () => {
    const { signal, abort } = createAbortSignal();
    const reason = new Error('stop');
    abort(reason);
    expect(signal.reason).toBe(reason);
  });
});

// A single timeout call now composes a deadline and an external signal without a dedicated
// helper since deadline is its argument and signal is an option so assertions are kept here
describe('timeout with an external signal: deadline and signal in one call', () => {
  it('the external signal aborting first wins the race', async () => {
    const controller = new AbortController();
    const promise = timeout(new Promise(() => {}), 10_000, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });

  it('the deadline wins when no external signal aborts', async () => {
    jest.useFakeTimers();
    const promise = timeout(new Promise(() => {}), 5);
    jest.advanceTimersByTime(5);
    await expect(promise).rejects.toBeDefined();
  });

  it('adopts the underlying settlement when neither the signal nor the deadline fires', async () => {
    const controller = new AbortController();
    await expect(timeout(Promise.resolve('ok'), 10_000, { signal: controller.signal })).resolves.toBe('ok');
  });

  it('cancels a cancelable underlying operation when the external signal aborts', async () => {
    const controller = new AbortController();
    let canceled = false;
    const underlying = new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        canceled = true;
      });
    });
    const promise = timeout(underlying, 10_000, { signal: controller.signal }).catch(() => undefined);
    controller.abort();
    await promise;
    expect(canceled).toBe(true);
  });
});

describe('toAbortSignal: inverse interop (promise cancels -> signal fires)', () => {
  it('fires the signal when the source promise cancels', async () => {
    const source = new CancelablePromise<void>(() => {});
    const signal = toAbortSignal(source);
    expect(signal.aborted).toBe(false);
    source.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(signal.aborted).toBe(true);
  });

  it('composes with AbortSignal.any', async () => {
    const source = new CancelablePromise<void>(() => {});
    const other = new AbortController();
    const anyOf = (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any;
    const combined = anyOf([toAbortSignal(source), other.signal]);
    expect(combined.aborted).toBe(false);
    source.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(combined.aborted).toBe(true);
  });

  it('never fires for a fulfilled promise', async () => {
    const signal = toAbortSignal(Promise.resolve('done'));
    await Promise.resolve();
    await Promise.resolve();
    expect(signal.aborted).toBe(false);
  });
});

// A canc input is wired through handleCancel rather than .then so taking a signal off a bubble
// capable promise must not change its own cancellation semantics while thenables remain untouched
describe('toAbortSignal: canc promises take the cancel path, not the rejection path', () => {
  it('does not suppress bubble-cancel (fails on the old .then-based wiring)', async () => {
    const parent = new CancelablePromise<number>(() => {
      /**/
    });
    const child = parent.then((v) => v);
    // Silence the child's own rejection; it is the node being canceled directly, not the one
    // expected to bubble-cancel from below.
    child.then(undefined, () => {
      /**/
    });

    toAbortSignal(parent);

    expect((parent as any)._chainsCount).toBe(1);

    child.cancel();
    await drain();

    expect(parent.isCanceled).toBe(true);
  });

  it('returns a branded cancel signal', () => {
    const p = new CancelablePromise<void>(() => {
      /**/
    });
    expect(isCancelSignal(toAbortSignal(p))).toBe(true);
  });

  it('aborts with a CancelError carrying the cancel message', async () => {
    const p = new CancelablePromise<void>(() => {
      /**/
    });
    const signal = toAbortSignal(p);
    p.cancel('stop');
    await drain();
    expect(isCancelError(signal.reason)).toBe(true);
    expect((signal.reason as CancelError).message).toBe('stop');
  });

  it('a plain-Error rejection (not a cancel) leaves the signal unaborted', async () => {
    const p = new CancelablePromise<void>((_resolve, reject) => reject(new Error('boom')));
    const signal = toAbortSignal(p);
    await p.catch(() => undefined);
    await drain();
    expect(signal.aborted).toBe(false);
  });

  it('a fulfilled canc promise never aborts the signal', async () => {
    const p = new CancelablePromise<string>((resolve) => resolve('done'));
    const signal = toAbortSignal(p);
    await p;
    await drain();
    expect(signal.aborted).toBe(false);
  });

  it('an already-canceled canc input aborts after one microtask, strict does not throw', async () => {
    const p = new CancelablePromise<void>(
      () => {
        /**/
      },
      { strict: true },
    );
    p.cancel('already gone');
    await drain();

    let signal: AbortSignal | undefined;
    expect(() => {
      signal = toAbortSignal(p);
    }).not.toThrow();

    await Promise.resolve();

    expect(signal!.aborted).toBe(true);
    expect(isCancelError(signal!.reason)).toBe(true);
    expect((signal!.reason as CancelError).message).toBe('already gone');
  });
});

describe('toAbortSignal: plain thenable regression (untouched branch)', () => {
  it('still aborts with the exact rejection reason', async () => {
    const reason = new Error('x');
    const signal = toAbortSignal(Promise.reject(reason));
    await Promise.resolve();
    await Promise.resolve();
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
  });
});

describe('withSignal (p-signal-shaped)', () => {
  it('rejects with the abort reason when the signal aborts first', async () => {
    const controller = new AbortController();
    const promise = withSignal(controller.signal, new Promise(() => {}));
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withSignal(controller.signal, Promise.resolve('never'))).rejects.toBeDefined();
  });

  it('resolves the value when the promise wins', async () => {
    const controller = new AbortController();
    await expect(withSignal(controller.signal, Promise.resolve('v'))).resolves.toBe('v');
  });

  it('passes an undefined signal straight through (optional-cancellation signature)', async () => {
    await expect(withSignal(undefined, Promise.resolve('v'))).resolves.toBe('v');
  });

  it('accepts a function receiving the signal', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const promise = withSignal(controller.signal, (signal) => {
      received = signal;
      return Promise.resolve('fn');
    });
    await expect(promise).resolves.toBe('fn');
    expect(received).toBe(controller.signal);
  });

  it('passes undefined to the function when no signal is given', async () => {
    let received: AbortSignal | undefined = {} as AbortSignal;
    await withSignal(undefined, (signal) => {
      received = signal;
      return 'v';
    });
    expect(received).toBeUndefined();
  });
});

describe('fromAbortSignal: awaitable abort event', () => {
  it('aborting the controller fulfills the promise with undefined', async () => {
    const controller = new AbortController();
    const promise = fromAbortSignal(controller.signal);
    controller.abort();
    await expect(promise).resolves.toBeUndefined();
  });

  it('a pre-aborted signal fulfills asynchronously, not synchronously', async () => {
    const controller = new AbortController();
    controller.abort();

    let settledSync = false;
    const promise = fromAbortSignal(controller.signal);
    void promise.then(() => {
      settledSync = true;
    });

    // No microtask has run yet at this point, so a synchronous resolve would already show here.
    expect(settledSync).toBe(false);
    await promise;
    expect(settledSync).toBe(true);
  });

  describe('listener removal', () => {
    it('removes the real signal listener once it fulfills', async () => {
      const controller = new AbortController();
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
      const promise = fromAbortSignal(controller.signal);
      controller.abort();
      await promise;
      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });

    it('removes the real signal listener on cancel', async () => {
      const controller = new AbortController();
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
      const promise = fromAbortSignal(controller.signal);
      promise.cancel();
      await promise.catch(() => undefined);
      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });

    it('fake signal: add and remove counts match on the fulfilled path', async () => {
      const fake = spySignal();
      const promise = fromAbortSignal(fake);
      fake.fire();
      await promise;
      expect(fake.addCalls).toBe(1);
      expect(fake.removeCalls).toBe(1);
    });

    it('fake signal: add and remove counts match on the canceled path', async () => {
      const fake = spySignal();
      const promise = fromAbortSignal(fake);
      promise.cancel();
      await promise.catch(() => undefined);
      expect(fake.addCalls).toBe(1);
      expect(fake.removeCalls).toBe(1);
    });

    it('a pre-aborted signal never attaches a listener', async () => {
      const fake = spySignal();
      fake.fire();
      await fromAbortSignal(fake);
      expect(fake.addCalls).toBe(0);
      expect(fake.removeCalls).toBe(0);
    });
  });

  it('cancel rejects with a CancelError', async () => {
    const controller = new AbortController();
    const promise = fromAbortSignal(controller.signal);
    promise.cancel();
    const error = await promise.catch((e: unknown) => e);
    expect(isCancelError(error)).toBe(true);
  });

  it('a race loser removes its listener without an explicit cancel', async () => {
    // The signal never fires on its own here, so fromAbortSignal would never settle by itself;
    // the other participant winning is what proves the loser's listener still comes off.
    const fake = spySignal();
    const winner = await CancelablePromise.race([CancelablePromise.resolve('fast'), fromAbortSignal(fake)]);
    expect(winner).toBe('fast');
    expect(fake.addCalls).toBe(1);
    expect(fake.removeCalls).toBe(1);
  });

  it('type: the return is exactly CancelablePromise<void>, nothing wider', () => {
    // A wrong return type makes the annotation below a compile error.
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
    type TReturnIsVoidCancelable =
      Equal<ReturnType<typeof fromAbortSignal>, CancelablePromise<void>> extends true ? true : never;
    const check: TReturnIsVoidCancelable = true;
    expect(check).toBe(true);
  });
});
