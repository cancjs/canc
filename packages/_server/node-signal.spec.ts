import { isCancelError, isCancelSignal } from '@cancjs/promise';

import { createExchange, FakeRequest, FakeResponse } from './__tests__/fakes';
import { getLiveRequests, getRequestState, LIVE_REQUESTS, REQUEST_CANCEL_STATE } from './holder';
import { ensureRequestCancelState, getNodeRequestSignal } from './node-signal';
import { CLIENT_DISCONNECTED } from './reasons';

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
