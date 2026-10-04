import { isCancelError, isCancelSignal } from '@cancjs/promise';

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

  it('cancels at mint time for an already aborted request', () => {
    const controller = new AbortController();
    controller.abort();

    expect(createWebRequestSignal({ signal: controller.signal }).signal.aborted).toBe(true);
  });
});
