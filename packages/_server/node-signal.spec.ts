import { isCancelError, isCancelSignal } from '@cancjs/promise';
import { once } from 'events';
import { connect, createServer } from 'http2';
import { AddressInfo } from 'net';

import { createExchange, FakeRequest, FakeResponse, flush } from './__tests__/fakes';
import { getLiveRequests, getRequestState, LIVE_REQUESTS, REQUEST_CANCEL_STATE } from './holder';
import { ensureRequestCancelState, getNodeRequestSignal } from './node-signal';
import { CLIENT_DISCONNECTED } from './reasons';
import { createTimeoutError } from './timeout';
import { IRequestLike, IResponseLike } from './types';

describe('node request signal', () => {
  it('is a branded cancel signal', () => {
    const { req, res } = createExchange();

    expect(isCancelSignal(getNodeRequestSignal(req, res))).toBe(true);
  });

  it('caches one signal per request', () => {
    const { req, res } = createExchange();

    expect(getNodeRequestSignal(req, res)).toBe(getNodeRequestSignal(req, res));
    expect(res.listenerCount('close')).toBe(1);
  });

  it('stores the state under the shared registry symbol', () => {
    const { req, res } = createExchange();
    ensureRequestCancelState(req, res);

    expect((req as unknown as Record<symbol, unknown>)[REQUEST_CANCEL_STATE]).toBe(getRequestState(req));
  });

  it('keeps the state off enumerable request properties', () => {
    const { req, res } = createExchange();
    ensureRequestCancelState(req, res);

    expect(Object.getOwnPropertySymbols({ ...req })).not.toContain(REQUEST_CANCEL_STATE);
  });

  it('does not cancel when the request stream closes', () => {
    const { req, res } = createExchange();
    const signal = getNodeRequestSignal(req, res);

    req.emit('close');

    expect(signal.aborted).toBe(false);
  });

  it('cancels when the response closes before it ended', () => {
    const { req, res } = createExchange();
    const signal = getNodeRequestSignal(req, res);

    res.disconnect();

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.message).toBe(CLIENT_DISCONNECTED);
    expect(signal.reason.timedOut).toBe(false);
  });

  it('does not cancel when the response closes after it ended', () => {
    const { req, res } = createExchange();
    const signal = getNodeRequestSignal(req, res);

    res.end();

    expect(signal.aborted).toBe(false);
  });

  it('cancels at wrap time for a client that already went away', () => {
    const { req, res } = createExchange();
    res.destroyed = true;

    const signal = getNodeRequestSignal(req, res);

    expect(signal.aborted).toBe(true);
    expect(isCancelError(signal.reason)).toBe(true);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('does not cancel when only the request stream was destroyed', () => {
    // a consumed body auto-destroys the request stream, so a POST wrapped a tick after the body
    // parser arrives here with req.destroyed already true and the client still connected
    const { req, res } = createExchange();
    req.destroyed = true;

    const signal = getNodeRequestSignal(req, res);

    expect(signal.aborted).toBe(false);
    expect(res.listenerCount('close')).toBe(1);
  });

  it('removes the close listener once the response is over', () => {
    const { req, res } = createExchange();
    getNodeRequestSignal(req, res);

    expect(res.listenerCount('close')).toBe(1);

    res.end();

    expect(res.listenerCount('close')).toBe(0);
  });

  it('merges later options into the holder', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { bubble: false, timeout: 100 });
    ensureRequestCancelState(req, res, { timeout: 200 });

    expect(state.options).toEqual({ bubble: false, timeout: 200 });
  });

  it('tracks the request on the server it arrived on and drops it when the response closes', () => {
    const server = {};
    const { req, res } = createExchange(server);
    const state = ensureRequestCancelState(req, res);

    expect(getLiveRequests(server)).toEqual(new Set([state]));

    res.end();

    expect(getLiveRequests(server)?.size).toBe(0);
  });

  it('works without a server to track against', () => {
    const req = new FakeRequest();
    const res = new FakeResponse();

    expect(() => ensureRequestCancelState(req, res)).not.toThrow();
    expect((req as unknown as Record<symbol, unknown>)[LIVE_REQUESTS]).toBeUndefined();
  });
});

describe('lifecycle hook failures', () => {
  let errorSpy: jest.SpyInstance;
  let uncaught: jest.Mock;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    uncaught = jest.fn();
    process.on('uncaughtException', uncaught);
  });

  afterEach(() => {
    process.removeListener('uncaughtException', uncaught);
    errorSpy.mockRestore();
  });

  it('logs a throwing onDisconnect with the package tag instead of crashing', async () => {
    const failure = new Error('metrics bug');
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, {
      onDisconnect: () => {
        throw failure;
      },
    });

    res.disconnect();
    await flush();

    expect(state.signal.aborted).toBe(true);
    expect(uncaught).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[@cancjs/server]'), failure);
  });

  it('logs a throwing onTimeout with the package tag instead of crashing', async () => {
    const failure = new Error('metrics bug');
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, {
      onTimeout: () => {
        throw failure;
      },
    });

    state.cancel(createTimeoutError({ message: 'late', ms: 1, status: 503 }));
    await flush();

    expect(uncaught).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[@cancjs/server]'), failure);
  });
});

describe('request deadline edge values', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not fire a deadline past the timer ceiling early', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: 2 ** 31 });

    jest.advanceTimersByTime(60 * 60 * 1000);

    expect(state.signal.aborted).toBe(false);
  });

  it('arms no timer for an infinite deadline', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: Infinity });

    jest.advanceTimersByTime(60 * 60 * 1000);

    expect(jest.getTimerCount()).toBe(0);
    expect(state.signal.aborted).toBe(false);
  });

  it('keeps a zero deadline immediate', () => {
    const { req, res } = createExchange();
    const state = ensureRequestCancelState(req, res, { timeout: 0 });

    jest.advanceTimersByTime(1);

    expect(state.signal.aborted).toBe(true);
  });
});

describe('http2 compat server', () => {
  it('drops a request from the live set once its response is over', async () => {
    const closed = deferredVoid();
    let during = -1;
    const server = createServer((req, res) => {
      ensureRequestCancelState(req as unknown as IRequestLike, res as unknown as IResponseLike);
      during = getLiveRequests(server)?.size ?? -1;
      res.once('close', () => closed.resolve());
      res.end('ok');
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const client = connect(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);

    try {
      const stream = client.request({ ':path': '/' });

      stream.resume();
      await once(stream, 'close');
      await closed.promise;
      await flush();

      expect(during).toBe(1);
      expect(getLiveRequests(server)?.size).toBe(0);
    } finally {
      client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function deferredVoid(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}
