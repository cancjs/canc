import { isCancelError, isCancelSignal } from '@cancjs/promise';

import { CLIENT_DISCONNECTED } from './reasons';
import { anySignal, createWebRequestSignal } from './web-signal';

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

  it('forwards the reason of an extra signal', () => {
    const controller = new AbortController();
    const { signal } = createWebRequestSignal(undefined, [controller.signal, new AbortController().signal]);

    controller.abort(new Error('gone'));

    expect(isCancelError(signal.reason)).toBe(true);
    expect(signal.reason.cause.message).toBe('gone');
  });

  it('folds several signals into one', () => {
    const first = new AbortController();
    const second = new AbortController();
    const composed = anySignal([first.signal, second.signal, null]);

    second.abort();

    expect(composed?.aborted).toBe(true);
  });

  it('passes a lone signal straight through', () => {
    const controller = new AbortController();

    expect(anySignal([undefined, controller.signal])).toBe(controller.signal);
  });

  it('has nothing to fold without signals', () => {
    expect(anySignal([undefined, null])).toBeUndefined();
  });

  describe('on a runtime without AbortSignal.any', () => {
    const platformAny = AbortSignal.any;

    beforeEach(() => {
      delete (AbortSignal as Partial<typeof AbortSignal>).any;
    });

    afterEach(() => {
      AbortSignal.any = platformAny;
    });

    it('folds through a controller instead', () => {
      const first = new AbortController();
      const second = new AbortController();
      const composed = anySignal([first.signal, second.signal]);

      second.abort(new Error('second went first'));

      expect(composed?.aborted).toBe(true);
      expect((composed?.reason as Error).message).toBe('second went first');
    });

    it('starts aborted when a source already was', () => {
      const first = new AbortController();
      first.abort(new Error('gone before we looked'));

      const composed = anySignal([first.signal, new AbortController().signal]);

      expect(composed?.aborted).toBe(true);
      expect((composed?.reason as Error).message).toBe('gone before we looked');
    });
  });
});
