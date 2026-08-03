/**
 * @jest-environment jsdom
 */
import { CancelError } from '@cancjs/promise';

import { registerBrowser, setWarn, unregister } from './index';

function dispatchRejection(reason: unknown): { defaultPrevented: boolean } {
  const event = new Event('unhandledrejection', { cancelable: true });
  (event as any).reason = reason;
  (globalThis as any).dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented };
}

describe('event target handler', () => {
  beforeEach(() => {
    setWarn(false);
  });

  afterEach(() => {
    unregister();
    setWarn(true);
  });

  it('prevents the default reporting of a CancelError', () => {
    registerBrowser();

    expect(dispatchRejection(new CancelError()).defaultPrevented).toBe(true);
  });

  it('leaves a real error to the default reporting', () => {
    registerBrowser();

    expect(dispatchRejection(new Error('real failure')).defaultPrevented).toBe(false);
  });

  it('routes a real error to the callback', () => {
    const onUnhandledRejection = jest.fn();
    registerBrowser({ onUnhandledRejection });
    const reason = new Error('real failure');

    expect(dispatchRejection(reason).defaultPrevented).toBe(true);
    expect(onUnhandledRejection).toHaveBeenCalledWith(reason, undefined);
  });

  it('does not call the callback for a CancelError', () => {
    const onUnhandledRejection = jest.fn();
    registerBrowser({ onUnhandledRejection });

    expect(dispatchRejection(new CancelError()).defaultPrevented).toBe(true);
    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });

  it('stops handling once unregistered', () => {
    const onUnhandledRejection = jest.fn();
    registerBrowser({ onUnhandledRejection });
    unregister();

    expect(dispatchRejection(new CancelError()).defaultPrevented).toBe(false);
    expect(dispatchRejection(new Error('real failure')).defaultPrevented).toBe(false);
    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });
});
