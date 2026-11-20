import { isCancelError, isCancelSignal } from '@cancjs/promise';
import { getEventListeners } from 'events';

import { CLIENT_DISCONNECTED } from './reasons';
import { createWebRequestSignal } from './web-signal';

describe('web request signal', () => {
  it('is a branded cancel signal', () => {
    expect(isCancelSignal(createWebRequestSignal().signal)).toBe(true);
  });

  it('cancels when the platform request signal aborts', () => {
    const controller = new AbortController();
    const { signal } = createWebRequestSignal({ signal: controller.signal });

    controller.abort();

    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.message).toBe(CLIENT_DISCONNECTED);
  });

  it('detaches from a shared request signal on release', () => {
    const shared = new AbortController();
    const requests = Array.from({ length: 1000 }, () => createWebRequestSignal({ signal: shared.signal }));

    expect(getEventListeners(shared.signal, 'abort')).toHaveLength(1000);

    for (const request of requests) {
      request.release();
    }

    expect(getEventListeners(shared.signal, 'abort')).toHaveLength(0);
  });

  it('detaches by itself once the minted signal aborts for another reason', () => {
    const shared = new AbortController();
    const { cancel, signal } = createWebRequestSignal({ signal: shared.signal });

    cancel('deadline');

    expect(getEventListeners(shared.signal, 'abort')).toHaveLength(0);

    shared.abort();

    expect(signal.reason.message).toBe('deadline');
  });

  it('release is harmless after the request signal aborted', () => {
    const shared = new AbortController();
    const { release, signal } = createWebRequestSignal({ signal: shared.signal });

    shared.abort();

    expect(() => release()).not.toThrow();
    expect(signal.aborted).toBe(true);
    expect(signal.reason.message).toBe(CLIENT_DISCONNECTED);
  });

  it('cancels at mint time for an already aborted request', () => {
    const controller = new AbortController();
    controller.abort();

    expect(createWebRequestSignal({ signal: controller.signal }).signal.aborted).toBe(true);
  });
});
