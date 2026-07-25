import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { wrapAxios } from './base';
import { createStubAdapter } from './stub-adapter.helper';


// The floor supported version: the first one accepting `config.signal`. Everything the wrapper
// mirrors is feature-detected, so the members added later must simply be absent here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyAxios = require('axios-legacy');

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('axios 0.22', () => {
	it('is the version under test', () => {
		expect(String(legacyAxios.VERSION)).toMatch(/^0\.22\./);
	});

	it('cancels a request', async () => {
		const stub = createStubAdapter();
		const api = wrapAxios(legacyAxios.create({ adapter: stub.adapter }));

		const promise = api.get('/issues');
		await nextTick();
		promise.cancel('stop');

		const error = await promise.catch((reason: any) => reason);

		expect(promise).toBeInstanceOf(CancelablePromise);
		expect(isCancelError(error)).toBe(true);
		expect((error as CancelError).message).toBe('stop');
		expect(stub.aborted).toBe(true);
	});

	it('resolves with the whole response', async () => {
		const stub = createStubAdapter({ auto: true, data: { id: 1 } });
		const api = wrapAxios(legacyAxios.create({ adapter: stub.adapter }));

		const response = await api.get('/issues');

		expect(response.status).toBe(200);
		expect(response.data).toEqual({ id: 1 });
	});

	it('mirrors only what this version has', () => {
		const api = wrapAxios(legacyAxios) as any;

		expect(typeof api.get).toBe('function');
		expect(typeof api.post).toBe('function');
		expect(typeof api.create).toBe('function');
		expect(typeof api.isCancel).toBe('function');
		expect(typeof api.CancelToken).toBe('function');
		expect(api.postForm).toBeUndefined();
		expect(api.query).toBeUndefined();
		expect(api.AxiosHeaders).toBeUndefined();
		expect(api.interceptors.clear).toBeUndefined();
	});

	it('carries the cancel context into interceptors', async () => {
		const stub = createStubAdapter({ auto: true });
		const api = wrapAxios(legacyAxios.create({ adapter: stub.adapter }));

		let seenSignal: any;

		api.interceptors.request.use((config: any, ctx: any) => {
			seenSignal = ctx.signal;
			return config;
		});

		const response = await api.get('/issues');

		expect(seenSignal).toBeDefined();
		expect(seenSignal).toBe(response.config.signal);
	});
});
