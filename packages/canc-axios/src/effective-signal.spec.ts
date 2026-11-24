import { CancelablePromise, CancelError } from '@cancjs/promise';
import axios from 'axios';
import { getEventListeners } from 'events';
import { PassThrough } from 'stream';

import { wrapAxios } from './base';
import { createStubAdapter } from './stub-adapter.helper';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Older Node 18 releases have AbortController but not AbortSignal.any.
const anySignal = (signals: AbortSignal[]): AbortSignal => {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  const detach: (() => void)[] = [];
  for (const signal of signals) {
    const abort = () => {
      controller.abort(signal.reason);
      for (const remove of detach) remove();
    };

    if (signal.aborted) {
      abort();
      break;
    }

    signal.addEventListener('abort', abort, { once: true });
    detach.push(() => signal.removeEventListener('abort', abort));
  }

  return controller.signal;
};

describe('Axios effective signal semantics', () => {
  it('A abort during gated native interceptor is ignored when B becomes final', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const stub = createStubAdapter({ auto: true });
    const raw = axios.create({ adapter: stub.adapter, signal: a.signal });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    raw.interceptors.request.use(async (config) => {
      await gate;
      return { ...config, signal: b.signal };
    });
    const cp = wrapAxios(raw).get('/rewrite');
    a.abort('obsolete');
    release();
    await expect(cp).resolves.toMatchObject({ status: 200 });
    expect(stub.calls).toHaveLength(1);
  });

  it('retained caller signal aborts the cooperative adapter', async () => {
    const c = new AbortController();
    const stub = createStubAdapter();
    const cp = wrapAxios(axios.create({ adapter: stub.adapter })).get('/held', { signal: c.signal });
    await tick();
    c.abort();
    await expect(cp).rejects.toBeInstanceOf(CancelError);
    expect(stub.aborted).toBe(true);

    const original = jest.fn();
    const polyfilled = { aborted: false, onabort: original, reason: undefined as any };
    // Use structural requests to avoid Axios cloning a plain-object polyfill.
    const pending: Array<{ config: any; resolve: (response: any) => void }> = [];
    const polyfillApi = wrapAxios({
      defaults: {},
      interceptors: axios.create().interceptors,
      request: (config: any) =>
        new Promise((resolve) => {
          pending.push({ config, resolve });
        }),
    } as any);
    const first = polyfillApi.request({ signal: polyfilled });
    const second = polyfillApi.request({ signal: polyfilled });
    await tick();
    expect(pending).toHaveLength(2);
    pending[0].resolve({ data: 'done', config: pending[0].config });
    await first;
    expect(polyfilled.onabort).not.toBe(original);
    expect(pending[1].config.signal.aborted).toBe(false);
    polyfilled.aborted = true;
    polyfilled.reason = 'effective';
    polyfilled.onabort({ type: 'abort' });
    expect(pending[1].config.signal.aborted).toBe(true);
    expect(original).toHaveBeenCalledTimes(1);
    expect(polyfilled.onabort).toBe(original);
    second.cancel();
    await expect(second).rejects.toBeInstanceOf(CancelError);
  });

  it('cancel before async native dispatch vetoes adapter if composed signal is retained', async () => {
    const stub = createStubAdapter();
    const raw = axios.create({ adapter: stub.adapter });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    raw.interceptors.request.use(async (cfg) => {
      await gate;
      return cfg;
    });
    const cp = wrapAxios(raw).get('/gate');
    cp.cancel('primary');
    await expect(cp).rejects.toBeInstanceOf(CancelError);
    release();
    await tick();
    await tick();
    expect(stub.calls).toHaveLength(0);
  });

  it('explicit replacement permits transport to proceed after outer CancelError', async () => {
    let dispatches = 0;
    const raw = axios.create();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    raw.interceptors.request.use(async (cfg) => {
      await gate;
      return {
        ...cfg,
        signal: new AbortController().signal,
        adapter: async (config: any) => {
          dispatches++;
          return { config, data: 'allowed', status: 200, statusText: 'OK', headers: {} };
        },
      } as any;
    });
    const cp = wrapAxios(raw).get('/override');
    cp.cancel('primary');
    await expect(cp).rejects.toBeInstanceOf(CancelError);
    release();
    await tick();
    await tick();
    expect(dispatches).toBe(1);
  });

  it('composes rather than replaces the existing transport signal in an interceptor', async () => {
    const additional = new AbortController();
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    api.interceptors.request.use((config) => {
      const existing = config.signal;
      config.signal = existing ? anySignal([existing, additional.signal]) : additional.signal;
      return config;
    });
    const cp = api.get('/composed');
    await tick();
    additional.abort('other');
    await expect(cp).rejects.toBeInstanceOf(CancelError);
    expect(stub.aborted).toBe(true);
  });

  it('still aborts transport on CP.cancel after the interceptor composes signals', async () => {
    const additional = new AbortController();
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    api.interceptors.request.use((config) => {
      const existing = config.signal;
      config.signal = existing ? anySignal([existing, additional.signal]) : additional.signal;
      return config;
    });
    const cp = api.get('/composed-primary');
    await tick();
    cp.cancel('owner');
    await expect(cp).rejects.toBeInstanceOf(CancelError);
    expect(stub.aborted).toBe(true);
    expect(additional.signal.aborted).toBe(false);
  });

  it('automatically cancels Canc promise returned from interceptor preparation', async () => {
    let releaseEntered: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      releaseEntered = resolve;
    });
    let canceled = 0;
    const prepare = new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        canceled++;
      });
    });
    const api = wrapAxios(axios.create({ adapter: createStubAdapter().adapter }));
    api.interceptors.request.use((config) => {
      releaseEntered();
      return prepare.then((token) => {
        config.headers.Authorization = token;
        return config;
      });
    });
    const job = api.get('/canc-first');
    await entered;
    job.cancel('cancel preparation');
    await expect(job).rejects.toBeInstanceOf(CancelError);
    await tick();
    expect(canceled).toBe(1);
  });

  it('links separately started Canc work through ctx.link', async () => {
    let linkedCancels = 0;
    const linked = new CancelablePromise<void>((_resolve, _reject, { handleCancel }) => {
      handleCancel(() => {
        linkedCancels++;
      });
    });
    const api = wrapAxios(axios.create({ adapter: createStubAdapter().adapter }));
    api.interceptors.request.use((config, ctx) => {
      ctx.link(linked);
      return config;
    });
    const job = api.get('/linked');
    await tick();
    job.cancel('cancel linked work');
    await expect(job).rejects.toBeInstanceOf(CancelError);
    await tick();
    expect(linkedCancels).toBe(1);
  });

  it('per-request external B overrides default A, JS null also clears it', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter, signal: a.signal }));
    const explicit = api.get('/b', { signal: b.signal });
    const nulled = api.get('/null', { signal: null } as any);
    a.abort('obsolete');
    await expect(explicit).resolves.toMatchObject({ status: 200 });
    await expect(nulled).resolves.toMatchObject({ status: 200 });
  });

  it('omitted and undefined signals still inherit default', async () => {
    const a = new AbortController();
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter, signal: a.signal }));
    const omitted = api.get('/omitted');
    const undefinedSignal = api.get('/undefined', { signal: undefined });
    await tick();
    a.abort('effective');
    await expect(omitted).rejects.toBeInstanceOf(CancelError);
    await expect(undefinedSignal).rejects.toBeInstanceOf(CancelError);
  });

  it('read-only native manager still lets Axios honor interceptor-selected signal', async () => {
    const chosen = new AbortController();
    const stub = createStubAdapter();
    const raw = axios.create({ adapter: stub.adapter });
    raw.interceptors.request.use((config) => ({ ...config, signal: chosen.signal }), undefined, { synchronous: true });
    const manager = raw.interceptors.request as any;
    Object.defineProperty(manager, 'forEach', { value: manager.forEach, writable: false, configurable: false });
    const cp = wrapAxios(raw).get('/readonly');
    await tick();
    chosen.abort('effective');
    await expect(cp).rejects.toBeInstanceOf(CancelError);
    expect(stub.aborted).toBe(true);
  });

  it('external effective signal destroys a stream after response headers', async () => {
    for (const mode of ['retained', 'replaced', 'scope', 'quiet', 'ordinary']) {
      const c = new AbortController();
      const chosen = new AbortController();
      const stream = new PassThrough();
      const originalEmit = stream.emit;
      const raw = axios.create({
        adapter: async (config) => {
          // Model the native HTTP adapter's earlier, synchronous error emission.
          const signal = config.signal as AbortSignal;
          const abort = () => {
            stream.emit('error', Object.assign(new axios.CanceledError(), { config }));
            stream.destroy();
          };
          signal.addEventListener('abort', abort);
          stream.once('close', () => signal.removeEventListener('abort', abort));
          return { config, data: stream, status: 200, statusText: 'OK', headers: {} };
        },
      });
      if (mode === 'replaced') {
        raw.interceptors.request.use((config) => ({ ...config, signal: chosen.signal }));
      }

      const response = await wrapAxios(raw).get('/stream', { signal: c.signal, responseType: 'stream' });
      expect(response.data).toBe(stream);
      expect(stream.destroyed).toBe(false);
      const errors: Error[] = [];
      if (mode !== 'quiet') {
        stream.on('error', (error) => errors.push(error));
      }

      const closed = new Promise((resolve) => stream.once('close', resolve));
      const reason = new DOMException('after headers', mode === 'replaced' ? 'TimeoutError' : 'AbortError');
      if (mode === 'ordinary') {
        const failure = new Error('ordinary body failure');
        stream.destroy(failure);
        await closed;
        expect(errors).toEqual([failure]);
        expect(errors[0]).toBe(failure);
      } else {
        if (mode === 'scope') {
          (response.config as any).cancelScope.cancel(reason);
        } else if (mode === 'replaced') {
          chosen.abort(reason);
        } else {
          c.abort(reason);
        }

        await closed;
        if (mode === 'quiet') {
          expect(errors).toHaveLength(0);
          expect(stream.errored).toBeNull();
        } else {
          expect(errors).toHaveLength(1);
          expect(errors[0]).toBeInstanceOf(CancelError);
          const cancellation = errors[0] as CancelError;
          expect(cancellation.cause).toBe(reason);
          expect(cancellation.aborted).toBe(mode !== 'replaced');
          expect(cancellation.timedOut).toBe(mode === 'replaced');
        }
      }

      expect(stream.destroyed).toBe(true);
      expect(stream.emit).toBe(originalEmit);
      expect(getEventListeners(c.signal, 'abort')).toHaveLength(0);
      expect(getEventListeners(response.config.signal as AbortSignal, 'abort')).toHaveLength(0);
    }
  });

  for (const terminal of ['end', 'close']) {
    it('releases signals when a response interceptor already reached ' + terminal, async () => {
      for (const replaced of [false, true]) {
        const external = new AbortController();
        const final = new AbortController();
        const stream = new PassThrough();
        const raw = axios.create({
          adapter: async (config) => ({ config, data: stream, status: 200, statusText: 'OK', headers: {} }),
        });
        if (replaced) {
          raw.interceptors.request.use((config) => ({ ...config, signal: final.signal }));
        }

        raw.interceptors.response.use(async (response) => {
          const closed = new Promise((resolve) => stream.once('close', resolve));
          if (terminal === 'end') {
            stream.resume();
            stream.end('done');
          } else {
            stream.destroy();
          }

          await closed;
          return response;
        });

        const response = await wrapAxios(raw).get('/terminal', {
          responseType: 'stream',
          signal: external.signal,
        });
        expect(response.data).toBe(stream);
        expect(stream.closed).toBe(true);
        expect(stream.readableEnded).toBe(terminal === 'end');
        expect(getEventListeners(external.signal, 'abort')).toHaveLength(0);
        expect(getEventListeners(response.config.signal as AbortSignal, 'abort')).toHaveLength(0);
        external.abort();
        final.abort();
      }
    });
  }

  it('never attributes an obsolete entry timeout to final B cancellation without native config', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const stub = createStubAdapter({ abortError: 'canceled' });
    const raw = axios.create({ adapter: stub.adapter, signal: a.signal });
    raw.interceptors.request.use((config) => ({ ...config, signal: b.signal }));
    const cp = wrapAxios(raw).get('/last-B');
    await tick();
    a.abort(new DOMException('obsolete', 'TimeoutError'));
    await tick();
    expect(stub.aborted).toBe(false);
    b.abort();
    const error = await cp.catch((reason) => reason);
    expect(error).toBeInstanceOf(CancelError);
    expect(error.cause).not.toBe(a.signal.reason);
    expect(error.timedOut).toBe(false);
  });

  it('opaque structural ignores external signal but CP.cancel remains prompt', async () => {
    const manager = () => ({
      handlers: [] as any[],
      use(fn: any) {
        this.handlers.push(fn);
        return this.handlers.length - 1;
      },
      eject(id: number) {
        this.handlers[id] = null;
      },
      forEach(fn: any) {
        for (const x of this.handlers) fn(x);
      },
    });
    const structural = {
      defaults: {},
      interceptors: { request: manager(), response: manager() },
      request(_cfg: any): Promise<any> {
        this.interceptors.request.forEach(() => {});
        return new Promise(() => {});
      },
    };
    const c = new AbortController();
    const cp = wrapAxios(structural).request({ url: '/opaque', signal: c.signal });
    c.abort();
    let state = 'pending';
    cp.then(
      () => {
        state = 'fulfilled';
      },
      () => {
        state = 'rejected';
      },
    );
    await tick();
    expect(state).toBe('pending');
    cp.cancel('canc');
    await expect(cp).rejects.toBeInstanceOf(CancelError);
  });
});
