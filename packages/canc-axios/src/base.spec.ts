import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import axios from 'axios';
import { getEventListeners } from 'events';
import { PassThrough } from 'stream';

import { wrapAxios } from './base';
import { createStubAdapter } from './stub-adapter.helper';

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('wrapAxios', () => {
  it('resolves with the whole axios response, not just data', async () => {
    const stub = createStubAdapter({ auto: true, data: { id: 1 } });
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    const response = await api.get('/issues');

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ id: 1 });
    expect(response.config.url).toBe('/issues');
  });

  it('returns a cancelable promise from every mirrored method', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter })) as any;

    const promises = [
      api('/call-form'),
      api('/url-form', { method: 'get' }),
      api.request({ url: '/request' }),
      api.get('/get'),
      api.delete('/delete'),
      api.head('/head'),
      api.options('/options'),
      api.post('/post', { a: 1 }),
      api.put('/put', { a: 1 }),
      api.patch('/patch', { a: 1 }),
    ];

    for (const promise of promises) {
      expect(promise).toBeInstanceOf(CancelablePromise);
    }

    await Promise.all(promises);

    expect(stub.calls.map((config) => config.url + ':' + config.method)).toEqual([
      '/call-form:get',
      '/url-form:get',
      '/request:get',
      '/get:get',
      '/delete:delete',
      '/head:head',
      '/options:options',
      '/post:post',
      '/put:put',
      '/patch:patch',
    ]);
    expect(stub.calls[7].data).toBe(JSON.stringify({ a: 1 }));
  });

  it('mirrors the form aliases with the multipart header when axios has them', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter })) as any;

    if (!api.postForm) {
      return;
    }

    await api.postForm('/upload', { a: 1 });

    expect(String(stub.calls[0].headers['Content-Type'])).toContain('multipart/form-data');
  });

  it('cancels the in-flight request and rejects with a CancelError', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    const promise = api.get('/issues');
    await nextTick();
    promise.cancel('stop');

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    await nextTick();
    expect(stub.aborted).toBe(true);
  });

  it('maps an adapter abort rejection to a CancelError even without our own cancel', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    const controller = new AbortController();
    const promise = api.get('/issues', { signal: controller.signal });
    await nextTick();
    controller.abort();

    const error = await promise.catch((reason) => reason);

    expect(isCancelError(error)).toBe(true);
    expect((error as unknown as CancelError).aborted).toBe(true);
  });

  it('aborts a pending request when the instance default signal aborts', async () => {
    const stub = createStubAdapter();
    const controller = new AbortController();
    const api = wrapAxios(axios.create({ adapter: stub.adapter, signal: controller.signal }));

    const promise = api.get('/issues');
    await nextTick();
    controller.abort();

    const error = await promise.catch((reason) => reason);

    expect(isCancelError(error)).toBe(true);
    expect(stub.aborted).toBe(true);
  });

  it('aborts on a defaults signal assigned after wrapping', async () => {
    const stub = createStubAdapter();
    const controller = new AbortController();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    api.defaults.signal = controller.signal;

    const promise = api.get('/issues');
    await nextTick();
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(stub.aborted).toBe(true);
  });

  it('honors the default signal and a per-call signal together', async () => {
    const stub = createStubAdapter();
    const defaultController = new AbortController();
    const callController = new AbortController();
    const api = wrapAxios(axios.create({ adapter: stub.adapter, signal: defaultController.signal }));

    const promise = api.get('/issues', { signal: callController.signal });
    await nextTick();
    callController.abort();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(stub.aborted).toBe(true);

    const second = api.get('/again', { signal: new AbortController().signal });
    await nextTick();
    defaultController.abort();

    await expect(second).rejects.toBeInstanceOf(CancelError);
  });

  it('rejects a pre-aborted request before it reaches the adapter', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    const controller = new AbortController();
    controller.abort();

    const error = await api.get('/issues', { signal: controller.signal }).catch((reason) => reason);

    expect(isCancelError(error)).toBe(true);
    expect(stub.calls).toHaveLength(0);
  });

  it('leaves a caller signal without listeners once the request settles', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    const controller = new AbortController();
    const removeEventListener = jest.spyOn(controller.signal, 'removeEventListener');

    await api.get('/issues', { signal: controller.signal });

    expect(removeEventListener).toHaveBeenCalled();
  });

  it('passes non-cancel failures through untouched', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    const promise = api.get('/issues');
    await nextTick();
    stub.fail(500);

    const error = await promise.catch((reason: any) => reason);

    expect(isCancelError(error)).toBe(false);
    expect(error.response.status).toBe(500);
  });

  it('aggregates with all() into a cancelable promise', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter })) as any;

    const first = api.get('/a');
    const second = api.get('/b');
    const aggregate = api.all([first, second]);

    expect(aggregate).toBeInstanceOf(CancelablePromise);

    // Canceling one request rejects the aggregate, unlike axios.all which is a native Promise.all.
    first.cancel();

    await expect(aggregate).rejects.toBeInstanceOf(CancelError);
    await expect(first).rejects.toBeInstanceOf(CancelError);

    second.cancel();
    await expect(second).rejects.toBeInstanceOf(CancelError);
  });

  it('cancels only the sole-consumer requests when the aggregate is canceled', async () => {
    const stubA = createStubAdapter();
    const stubB = createStubAdapter();
    const apiA = wrapAxios(axios.create({ adapter: stubA.adapter }));
    const apiB = wrapAxios(axios.create({ adapter: stubB.adapter }));

    const first = apiA.get('/a');
    const second = apiB.get('/b');
    const other = first.then((response) => response.status);
    const aggregate = (apiA as any).all([first, second]);
    await nextTick();

    aggregate.cancel();

    await expect(aggregate).rejects.toBeInstanceOf(CancelError);
    await expect(second).rejects.toBeInstanceOf(CancelError);
    expect(stubB.aborted).toBe(true);
    expect(stubA.aborted).toBe(false);

    stubA.respond();

    await expect(first).resolves.toMatchObject({ status: 200 });
    await expect(other).resolves.toBe(200);
  });

  it('does not wrap an already wrapped instance', () => {
    const api = wrapAxios(axios.create());

    expect(wrapAxios(api as any)).toBe(api);
  });
});

describe('wrapAxios caller abort lifecycle', () => {
  it('rejects on caller abort within a macrotask when the adapter ignores the signal', async () => {
    const calls: any[] = [];
    const api = wrapAxios(
      axios.create({
        adapter: (config: any) => {
          calls.push(config);
          return new Promise(() => {});
        },
      }),
    );
    const controller = new AbortController();

    const promise = api.get('/issues', { signal: controller.signal });
    await nextTick();
    controller.abort();

    const outcome = await Promise.race([promise.catch((reason) => reason), nextTick().then(() => 'pending')]);

    expect(isCancelError(outcome)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('leaves no listeners on a long-lived signal after many canceled requests', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const controller = new AbortController();

    for (let i = 0; i < 100; i += 1) {
      const promise = api.get('/issues', { signal: controller.signal });
      promise.cancel();
      await promise.catch(() => undefined);
    }

    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(0);
  });

  it('rejects when the abort happens while a response interceptor awaits', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const controller = new AbortController();
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });

    api.interceptors.response.use((response) => {
      entered();
      return new Promise((resolve) => setTimeout(() => resolve(response), 50));
    });

    const promise = api.get('/issues', { signal: controller.signal });
    await inside;
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });

  it('rejects when the abort lands after the adapter succeeded', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const controller = new AbortController();

    api.interceptors.response.use((response) => {
      controller.abort();
      return response;
    });

    await expect(api.get('/issues', { signal: controller.signal })).rejects.toBeInstanceOf(CancelError);
  });

  it('keeps a stream response abortable until it closes', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const controller = new AbortController();
    const stream = new PassThrough();

    const promise = api.get('/events', {
      signal: controller.signal,
      responseType: 'stream',
    });
    await nextTick();
    stub.respond(stream);

    const response = await promise;

    expect(response.data).toBe(stream);
    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(1);

    controller.abort();

    expect(stream.destroyed).toBe(true);
    await new Promise((resolve) => stream.once('close', resolve));
    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(0);
  });

  it('destroys a stream response through the scope on the response config', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const stream = new PassThrough();

    const promise = api.get('/events', { responseType: 'stream' });
    await nextTick();
    stub.respond(stream);

    const response = await promise;

    (response.config as any).cancelScope.cancel();

    expect(stream.destroyed).toBe(true);
  });

  it('removes the watcher when a stream closes on its own', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const controller = new AbortController();
    const stream = new PassThrough();

    const promise = api.get('/events', {
      signal: controller.signal,
      responseType: 'stream',
    });
    await nextTick();
    stub.respond(stream);
    await promise;

    stream.destroy();
    await new Promise((resolve) => stream.once('close', resolve));

    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(0);
  });
});

describe('wrapAxios timeouts and linked cancels', () => {
  it('marks a caller AbortSignal.timeout as a timeout with the signal reason as cause', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const signal = AbortSignal.timeout(5);

    const error = (await api.get('/issues', { signal }).catch((reason) => reason)) as unknown as CancelError;

    expect(isCancelError(error)).toBe(true);
    expect(error.timedOut).toBe(true);
    expect(error.cause).toBe(signal.reason);
    expect((error.cause as Error).name).toBe('TimeoutError');
  });

  it('keeps a caller abort reason that is not a timeout from reading as one', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const controller = new AbortController();

    const promise = api.get('/issues', { signal: controller.signal });
    controller.abort();

    const error = (await promise.catch((reason) => reason)) as unknown as CancelError;

    expect(error.timedOut).toBe(false);
    expect(error.aborted).toBe(true);
  });

  it('cancels every linked promise even when one cancel throws', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));
    const canceled: string[] = [];
    const linked = (name: string, fail?: boolean) =>
      Object.assign(new CancelablePromise<void>(() => undefined), {
        cancel: () => {
          canceled.push(name);

          if (fail) {
            throw new Error('cancel failed ' + name);
          }
        },
      });

    api.interceptors.request.use((config, ctx) => {
      ctx.link(linked('first'));
      ctx.link(linked('second', true));
      ctx.link(linked('third'));
      return config;
    });

    const promise = api.get('/issues');
    await nextTick();
    const scope = stub.calls[0].cancelScope;

    expect(() => scope.cancel()).toThrow('cancel failed second');
    expect(canceled).toEqual(['first', 'second', 'third']);
    await expect(promise).rejects.toBeInstanceOf(CancelError);
  });
});

describe('wrapAxios instances', () => {
  it('creates wrapped instances that keep their own defaults', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios);
    const instance = api.create({
      baseURL: 'https://example.test',
      adapter: stub.adapter,
    });

    instance.defaults.headers.common['X-Token'] = 'instance-only';

    expect(instance.defaults.baseURL).toBe('https://example.test');
    expect(api.defaults.baseURL).toBeUndefined();
    expect(axios.defaults.headers.common['X-Token']).toBeUndefined();

    const response = await instance.get('/issues');

    expect(String(response.config.headers['X-Token'])).toBe('instance-only');
  });

  it('reads and writes the defaults of the wrapped instance', () => {
    const instance = axios.create();
    const api = wrapAxios(instance);

    api.defaults.timeout = 1234;

    expect(instance.defaults.timeout).toBe(1234);
    expect(api.defaults).toBe(instance.defaults);
  });

  it('exposes the wrapped instance and mirrors its statics', () => {
    const api = wrapAxios(axios) as any;

    expect(api.axios).toBe(axios);
    expect(api.isAxiosError).toBe(axios.isAxiosError);
    expect(api.isCancel).toBe(axios.isCancel);
    expect(api.Axios).toBe(axios.Axios);
    expect(api.VERSION).toBe(axios.VERSION);
    expect(typeof api.getUri({ url: '/x', params: { a: 1 } })).toBe('string');
  });
});
