import http from 'node:http';
import type { AddressInfo } from 'node:net';

import axios from 'axios';
import { CancelError, isCancelError } from '@cancjs/promise';

import { wrapAxios } from './base';


const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Axios pipes our signal through its own signal composition before handing it to fetch, and the
// composed signal carries a freshly minted axios error rather than ours. These cover that the
// rejection still comes back as a CancelError on every real adapter.
describe('real adapters', () => {
	it('cancels through the fetch adapter', async () => {
		const original = (globalThis as any).fetch;
		let sawAbort = false;

		// Axios builds a Request object when the environment supports it, so the signal arrives on the
		// input rather than in init.
		(globalThis as any).fetch = (input: any, init: any) =>
			new Promise((_resolve, reject) => {
				const signal = (input?.signal) || (init?.signal);

				signal.addEventListener('abort', () => {
					sawAbort = true;
					const error = new Error('This operation was aborted');
					error.name = 'AbortError';
					reject(error);
				});
			});

		try {
			const api = wrapAxios(axios.create({ adapter: 'fetch' }));
			const promise = api.get('https://example.test/issues');
			await nextTick();
			promise.cancel('stop');

			const error = await promise.catch((reason) => reason);

			expect(isCancelError(error)).toBe(true);
			expect((error as CancelError).message).toBe('stop');
			expect(sawAbort).toBe(true);
		} finally {
			(globalThis as any).fetch = original;
		}
	});

	it('resolves through the fetch adapter', async () => {
		const original = (globalThis as any).fetch;

		(globalThis as any).fetch = () =>
			Promise.resolve(
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			);

		try {
			const api = wrapAxios(axios.create({ adapter: 'fetch' }));
			const response = await api.get('https://example.test/issues');

			expect(response.status).toBe(200);
			expect(response.data).toEqual({ ok: true });
		} finally {
			(globalThis as any).fetch = original;
		}
	});

	it('cancels through the http adapter', async () => {
		const sockets: any[] = [];
		const server = http.createServer((_request, response) => {
			// Never answer, so the request is still in flight when the cancel lands.
			sockets.push(response);
		});

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as AddressInfo).port;

		try {
			const api = wrapAxios(axios.create({ adapter: 'http' }));
			const promise = api.get('http://127.0.0.1:' + port + '/issues');
			await nextTick();
			promise.cancel();

			const error = await promise.catch((reason) => reason);

			expect(isCancelError(error)).toBe(true);
		} finally {
			for (const response of sockets) {
				response.destroy();
			}
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
});
