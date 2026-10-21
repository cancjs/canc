import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { isCancelError } from '@cancjs/promise';

import { cancelableFetchFactory, ICancelableFetchConfig } from './base';

// The server never answers, so every request stays in flight until it is aborted
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Stub implementations that ignore signal.reason and reject with their own abort error
const stubFetch =
  (makeError: () => unknown) =>
  (_input: unknown, init?: { signal?: AbortSignal }): Promise<never> =>
    new Promise<never>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(makeError());
        return;
      }
      signal?.addEventListener('abort', () => reject(makeError()));
    });

const nodeFetchAbort = () =>
  Object.assign(new Error('The user aborted a request.'), { name: 'AbortError', type: 'aborted' });
const whatwgAbort = () => new DOMException('Aborted', 'AbortError');

const impls: Array<[string, () => ICancelableFetchConfig]> = [
  ['undici', () => ({})],
  ['node-fetch shaped', () => ({ fetch: stubFetch(nodeFetchAbort) })],
  ['whatwg-fetch shaped', () => ({ fetch: stubFetch(whatwgAbort) })],
];

const controllers: Array<[string, ICancelableFetchConfig]> = [
  ['own signal', {}],
  ['injected controller', { AbortController }],
];

const rejectionOf = (promise: Promise<unknown>): Promise<any> =>
  promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );

describe.each(impls)('abort shapes: %s', (_impl, makeConfig) => {
  describe.each(controllers)('%s', (_controller, controllerConfig) => {
    const cancelableFetch = () => cancelableFetchFactory({ ...makeConfig(), ...controllerConfig });

    it('cancel(reason) rejects with a CancelError caused by that reason', async () => {
      const reason = { why: 'user' };
      const promise = cancelableFetch()(baseUrl);
      void promise.cancel(reason);

      const error = await rejectionOf(promise);
      expect(isCancelError(error)).toBe(true);
      expect(error.cause).toBe(reason);
      expect(error.timedOut).toBe(false);
    });

    it('caller abort rejects with a CancelError caused by the caller reason', async () => {
      const reason = { why: 'caller' };
      const controller = new AbortController();
      const promise = cancelableFetch()(baseUrl, { signal: controller.signal });
      controller.abort(reason);

      const error = await rejectionOf(promise);
      expect(isCancelError(error)).toBe(true);
      expect(error.cause).toBe(reason);
      expect(error.timedOut).toBe(false);
    });

    it('caller AbortSignal.timeout rejects with a timed-out CancelError', async () => {
      const signal = AbortSignal.timeout(20);
      const error = await rejectionOf(cancelableFetch()(baseUrl, { signal }));

      expect(isCancelError(error)).toBe(true);
      expect(error.cause).toBe(signal.reason);
      expect(error.timedOut).toBe(true);
    });
  });
});

describe('abort-shaped rejection without an own abort', () => {
  it.each([
    ['AbortError name', () => nodeFetchAbort(), false],
    ['DOMException AbortError', () => whatwgAbort(), false],
    ['DOMException TimeoutError', () => new DOMException('Timed out', 'TimeoutError'), true],
    ['legacy code 20', () => ({ code: 20 }), false],
    ['legacy code 23', () => ({ code: 23 }), false],
  ])('%s becomes a CancelError', async (_label, makeError, timedOut) => {
    const rejection = makeError();
    const cancelableFetch = cancelableFetchFactory({ fetch: () => Promise.reject(rejection) });

    const error = await rejectionOf(cancelableFetch(baseUrl));
    expect(isCancelError(error)).toBe(true);
    expect(error.cause).toBe(rejection);
    expect(error.timedOut).toBe(timedOut);
  });

  it('leaves a network TypeError raw', async () => {
    const failure = new TypeError('fetch failed');
    const cancelableFetch = cancelableFetchFactory({ fetch: () => Promise.reject(failure) });

    expect(await rejectionOf(cancelableFetch(baseUrl))).toBe(failure);
  });
});

describe('reason on the fetch-side signal', () => {
  it.each(controllers)('cancel(reason) reaches signal.reason (%s)', async (_label, config) => {
    let seen: AbortSignal | undefined;
    const fetch = (_input: unknown, init?: { signal?: AbortSignal }) => {
      seen = init?.signal;
      return stubFetch(whatwgAbort)(_input, init);
    };
    const reason = { why: 'user' };
    const promise = cancelableFetchFactory({ fetch, ...config })(baseUrl);
    void promise.cancel(reason);
    await rejectionOf(promise);

    const signalReason = seen!.reason;
    expect(isCancelError(signalReason) ? signalReason.cause : signalReason).toBe(reason);
  });
});
