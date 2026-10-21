import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { cancelableFetchFactory } from './base';

// endless NDJSON; `closed` resolves on the server-side close, no sleeps
interface IStream {
  started: Promise<void>;
  closed: Promise<void>;
}

let server: Server;
let baseUrl: string;
const streams: IStream[] = [];

const handle = (_req: IncomingMessage, res: ServerResponse): void => {
  let onStarted!: () => void;
  let onClosed!: () => void;
  streams.push({
    started: new Promise<void>((resolve) => (onStarted = resolve)),
    closed: new Promise<void>((resolve) => (onClosed = resolve)),
  });

  res.writeHead(200, { 'content-type': 'application/x-ndjson' });
  let line = 0;
  res.write(`{"line":${line++}}\n`, () => onStarted());
  const timer = setInterval(() => res.write(`{"line":${line++}}\n`), 5);

  res.on('close', () => {
    clearInterval(timer);
    onClosed();
  });
};

const lastStream = (): IStream => streams[streams.length - 1];

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const settleOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error('expected the body read to be aborted');
    },
    (error: unknown) => error,
  );

describe('body phase', () => {
  describe.each([
    ['merged signal', {}],
    ['injected AbortController', { AbortController }],
  ])('caller signal after headers (%s)', (_label, extra) => {
    it('AbortSignal.timeout aborts the text() read with a CancelError', async () => {
      const cancelableFetch = cancelableFetchFactory(extra);
      const started = Date.now();
      const signal = AbortSignal.timeout(100);

      const error: any = await settleOf(cancelableFetch(baseUrl, { signal }).then((r) => r.text()));
      const elapsed = Date.now() - started;

      expect(isCancelError(error)).toBe(true);
      expect(elapsed).toBeLessThan(200);
      await lastStream().closed;
    });
  });

  it('a caller timeout reaching the body read sets timedOut', async () => {
    const cancelableFetch = cancelableFetchFactory();
    const error: any = await settleOf(
      cancelableFetch(baseUrl, { signal: AbortSignal.timeout(50) }).then((r) => r.text()),
    );

    expect(isCancelError(error)).toBe(true);
    expect(error.timedOut).toBe(true);
    await lastStream().closed;
  });

  it('canceling the chain child reading the body drops the socket', async () => {
    const cancelableFetch = cancelableFetchFactory();
    const request = cancelableFetch(baseUrl);
    const child = request.then((r) => r.text());

    await request;
    await lastStream().started;
    void child.cancel();

    expect(isCancelError(await settleOf(child))).toBe(true);
    await lastStream().closed;
  });

  it('canceling the body reader returned by the response drops the socket', async () => {
    const cancelableFetch = cancelableFetchFactory();
    const response = await cancelableFetch(baseUrl);
    const read = response.json() as CancelablePromise<unknown>;

    await lastStream().started;
    void read.cancel();

    expect(isCancelError(await settleOf(read))).toBe(true);
    await lastStream().closed;
  });

  it('canceling the settled request stops an endless NDJSON stream read through body', async () => {
    const cancelableFetch = cancelableFetchFactory();
    const request = cancelableFetch(baseUrl);
    const response = await request;
    const reader = response.body.getReader();

    await reader.read();
    void request.cancel();

    let error: unknown;
    for (;;) {
      try {
        const { done } = await reader.read();
        if (done) break;
      } catch (e) {
        error = e;
        break;
      }
    }

    expect(isCancelError(error)).toBe(true);
    await lastStream().closed;
  });

  it('keeps the readers off the enumerable keys of the response', async () => {
    const cancelableFetch = cancelableFetchFactory();
    const request = cancelableFetch(baseUrl);
    const response = await request;

    expect(Object.keys(response)).toEqual([]);
    void request.cancel();
    await lastStream().closed;
  });

  it('a caller abort after the headers ends a raw body stream with the caller reason', async () => {
    const cancelableFetch = cancelableFetchFactory();
    const controller = new AbortController();
    const reason = new Error('caller stop');
    const response = await cancelableFetch(baseUrl, { signal: controller.signal });
    const reader = response.body.getReader();

    await reader.read();
    controller.abort(reason);

    let error: unknown;
    for (;;) {
      try {
        const { done } = await reader.read();
        if (done) break;
      } catch (e) {
        error = e;
        break;
      }
    }

    expect(error).toBe(reason);
    await lastStream().closed;
  });
});
