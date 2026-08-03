import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { cancelify } from './cancelify';

// A minimal AbortController stand-in that records construction and abort calls, so tests can assert
// that reading (or not reading) the injected signal controls whether a controller is ever built.
function makeSpyControllerCtor() {
  const instances: Array<{ aborted: boolean; reason: any; signal: any }> = [];
  const ctor = jest.fn(function SpyController(this: any) {
    const state = { aborted: false, reason: undefined as any };
    const listeners: Array<(this: any, ev: any) => void> = [];
    const signal = {
      get aborted() {
        return state.aborted;
      },
      get reason() {
        return state.reason;
      },
      addEventListener(_type: string, cb: (this: any, ev: any) => void) {
        listeners.push(cb);
      },
      removeEventListener() {
        /* noop */
      },
    };
    this.signal = signal;
    this.abort = (reason?: any) => {
      state.aborted = true;
      state.reason = reason;
      for (const cb of listeners) cb.call(signal, {});
    };
    instances.push({
      get aborted() {
        return state.aborted;
      },
      get reason() {
        return state.reason;
      },
      signal,
    });
  }) as unknown as new () => { abort(reason?: any): void; signal: any };

  return { ctor, instances };
}

describe('cancelify', () => {
  it('materializes the ambient AbortController when getSignal() is called', async () => {
    let aborted: boolean | undefined;
    const wrapped = cancelify(({ getSignal }) => {
      aborted = getSignal().aborted;
      return new Promise<never>(() => {});
    });

    const promise = wrapped() as CancelablePromise<never>;
    await Promise.resolve();
    expect(aborted).toBe(false);

    promise.cancel();
    const reason = await promise.catch((e) => e);
    expect(isCancelError(reason)).toBe(true);
  });

  it('passes the getSignal thunk and the call args to fn', async () => {
    let received: { signal: any; args: any[] } | undefined;
    const wrapped = cancelify(({ getSignal }, ...args: any[]) => {
      received = { signal: getSignal(), args };
      return 'ok';
    });

    await expect(wrapped('a', 1, true)).resolves.toBe('ok');
    expect(received).toBeDefined();
    expect(received!.args).toEqual(['a', 1, true]);
    expect(received!.signal).toBeDefined();
  });

  it('aborts the injected signal with a CancelError reason when the promise is canceled', async () => {
    const { ctor, instances } = makeSpyControllerCtor();
    let captured: any;
    const wrapped = cancelify(
      ({ getSignal }) => {
        // Call getSignal() the way a real consumer (fetch) would, materializing the controller.
        captured = getSignal();
        expect(captured.aborted).toBe(false);
        // Never settle, so the cancel window stays open.
        return new Promise<never>(() => {});
      },
      { AbortController: ctor },
    );

    const promise = wrapped() as CancelablePromise<never>;
    // Let the executor run and read the signal.
    await Promise.resolve();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(captured.aborted).toBe(false);

    promise.cancel();

    expect(instances[0].aborted).toBe(true);
    expect(isCancelError(instances[0].reason)).toBe(true);
    expect(captured.aborted).toBe(true);

    const reason = await promise.catch((e) => e);
    expect(isCancelError(reason)).toBe(true);
  });

  it('wires an imperative cancel handle via ctx.handleCancel', async () => {
    const cancel = jest.fn();
    let handlerRan = false;
    const wrapped = cancelify(({ handleCancel }) => {
      const promise = new Promise<never>(() => {}); // never settles
      handleCancel(() => {
        handlerRan = true;
        cancel();
      });
      return promise;
    });
    const p = wrapped() as CancelablePromise<never>;
    await Promise.resolve();
    p.cancel();
    const err = await p.catch((e) => e);
    expect(isCancelError(err)).toBe(true); // the returned promise rejects a branded CancelError
    expect(cancel).toHaveBeenCalledTimes(1); // the imperative cancel handle ran exactly once
    expect(handlerRan).toBe(true);
    expect(p.isCanceled).toBe(true);
  });

  it('allocates NO controller when fn never calls getSignal (lazy thunk)', async () => {
    const { ctor } = makeSpyControllerCtor();
    const wrapped = cancelify(() => 'value', { AbortController: ctor });

    await expect(wrapped()).resolves.toBe('value');
    expect(ctor).not.toHaveBeenCalled();
  });

  it('rejects when fn rejects (reject passthrough)', async () => {
    const error = new Error('boom');
    const wrapped = cancelify(() => Promise.reject(error));
    await expect(wrapped()).rejects.toBe(error);
  });

  it('uses the injected AbortController ctor, not the global', async () => {
    const { ctor } = makeSpyControllerCtor();
    let sig: any;
    const wrapped = cancelify(
      ({ getSignal }) => {
        sig = getSignal();
        return 'x';
      },
      { AbortController: ctor },
    );

    await wrapped();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(sig).toBeDefined();
  });

  describe('against a real fetch-shaped call', () => {
    it('cancels the returned promise and aborts the underlying signal with a CancelError reason', async () => {
      let capturedInit: { signal?: AbortSignal } | undefined;

      // A fetch-shaped mock: takes (url, init) and rejects when init.signal aborts, exactly like
      // the platform fetch does.
      const fetchLike = (signal: AbortSignal, args: [string, { signal?: AbortSignal }?]) => {
        const [, init] = args;
        capturedInit = { signal: init?.signal ?? signal };
        const abortSignal = init?.signal ?? signal;

        return new Promise((resolve, reject) => {
          abortSignal.addEventListener('abort', () => {
            reject(abortSignal.reason);
          });
        });
      };

      const cancelableFetch = cancelify(({ getSignal }, url: string, init?: { signal?: AbortSignal }) => {
        const signal = getSignal();
        return fetchLike(signal, [url, { signal: init?.signal ?? signal }]);
      });

      const promise = cancelableFetch('https://example.test/resource');
      await Promise.resolve();

      promise.cancel();

      const reason = await promise.catch((e) => e);

      expect(isCancelError(reason)).toBe(true);
      expect(promise.isCanceled).toBe(true);
      expect(capturedInit?.signal?.aborted).toBe(true);
      expect(isCancelError(capturedInit?.signal?.reason)).toBe(true);
    });
  });

  describe('displayName', () => {
    it('names the wrapper bare `cancelify` when the source callback is anonymous (the common case: an inline arrow)', () => {
      const wrapped = cancelify((_ctx, arg: number) => Promise.resolve(arg));

      expect((wrapped as any).displayName).toBe('cancelify');
    });

    it('names the wrapper `cancelify: <name>` from a named source callback', () => {
      function loadUser(_ctx: any, arg: number) {
        return Promise.resolve(arg);
      }

      const wrapped = cancelify(loadUser);

      expect((wrapped as any).displayName).toBe('cancelify: loadUser');
    });

    it('an explicit displayName option wins verbatim, no prefix', () => {
      function loadEverything(_ctx: any, arg: number) {
        return Promise.resolve(arg);
      }

      const wrapped = cancelify(loadEverything, { displayName: 'loadUser' });

      expect((wrapped as any).displayName).toBe('loadUser');
    });

    it('also sets the wrapper name where the name slot is configurable', () => {
      function loadUser(_ctx: any, arg: number) {
        return Promise.resolve(arg);
      }

      const wrapped = cancelify(loadUser);

      expect((wrapped as any).name).toBe((wrapped as any).displayName);
    });
  });
});
