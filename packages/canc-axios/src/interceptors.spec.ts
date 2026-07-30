import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';
import axios from 'axios';

import { wrapAxios } from './base';
import { createStubAdapter } from './stub-adapter.helper';

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('interceptors', () => {
  it('hands a request interceptor the cancel context', async () => {
    const stub = createStubAdapter({ auto: true });
    const instance = axios.create({ adapter: stub.adapter });
    const api = wrapAxios(instance);

    let seenSignal: any;
    let seenCanceled: boolean | undefined;

    api.interceptors.request.use((config, ctx) => {
      seenSignal = ctx.signal;
      seenCanceled = ctx.isCanceled();
      return config;
    });

    const response = await api.get('/issues');

    expect(seenSignal).toBe(response.config.signal);
    expect(seenCanceled).toBe(false);
  });

  it('cancels a pending promise returned by a request interceptor', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    let inner!: CancelablePromise<any>;

    api.interceptors.request.use((config) => {
      inner = new CancelablePromise<any>((resolve, reject, { handleCancel }) => {
        handleCancel!(() => {});
      }).then(() => config) as CancelablePromise<any>;

      return inner;
    });

    const promise = api.get('/issues');
    await nextTick();

    expect(stub.calls).toHaveLength(0);

    promise.cancel();

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    await expect(inner).rejects.toBeInstanceOf(CancelError);
    expect(stub.calls).toHaveLength(0);
  });

  it('resolves the context from the response and from the error', async () => {
    const stub = createStubAdapter();
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    let responseSignal: any;
    let errorSignal: any;

    api.interceptors.response.use(
      (response, ctx) => {
        responseSignal = ctx.signal;
        return response;
      },
      (error, ctx) => {
        errorSignal = ctx.signal;
        throw error;
      },
    );

    const ok = api.get('/ok');
    await nextTick();
    stub.respond();
    const response = await ok;

    expect(responseSignal).toBe(response.config.signal);

    const bad = api.get('/bad');
    await nextTick();
    stub.fail(500);
    const error = await bad.catch((reason) => reason);

    expect(errorSignal).toBe(error.config.signal);
    expect(isCancelError(error)).toBe(false);
  });

  it('lets an interceptor cancel its own request', async () => {
    const stub = createStubAdapter({ auto: true });
    const api = wrapAxios(axios.create({ adapter: stub.adapter }));

    api.interceptors.request.use((config, ctx) => {
      ctx.cancel('not allowed');
      return config;
    });

    const error = await api.get('/issues').catch((reason) => reason);

    expect(isCancelError(error)).toBe(true);
  });

  it('registers on the wrapped instance and stays ejectable', async () => {
    const stub = createStubAdapter({ auto: true });
    const instance = axios.create({ adapter: stub.adapter });
    const api = wrapAxios(instance);

    let calls = 0;
    const id = api.interceptors.request.use((config) => {
      calls++;
      return config;
    });

    expect(api.interceptors.request.handlers).toBe(instance.interceptors.request.handlers);

    await api.get('/first');
    api.interceptors.request.eject(id);
    await api.get('/second');

    expect(calls).toBe(1);
  });

  it('runs interceptors added straight on the underlying instance', async () => {
    const stub = createStubAdapter({ auto: true });
    const instance = axios.create({ adapter: stub.adapter });
    const api = wrapAxios(instance);

    instance.interceptors.request.use((config) => {
      config.headers.set('X-Direct', 'yes');
      return config;
    });

    const response = await api.get('/issues');

    expect(String(response.config.headers['X-Direct'])).toBe('yes');
  });
});
