import axios from 'axios';
import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

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
		expect((error as CancelError).aborted).toBe(true);
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

		const error = await promise.catch((reason) => reason);

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

	it('does not wrap an already wrapped instance', () => {
		const api = wrapAxios(axios.create());

		expect(wrapAxios(api as any)).toBe(api);
	});
});

describe('wrapAxios instances', () => {
	it('creates wrapped instances that keep their own defaults', async () => {
		const stub = createStubAdapter({ auto: true });
		const api = wrapAxios(axios);
		const instance = api.create({ baseURL: 'https://example.test', adapter: stub.adapter });

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
