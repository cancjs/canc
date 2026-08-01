import { ITimers, MAX_TIMEOUT, startTimer, stopTimer } from './timers';

const TIMER_BRAND = Symbol.for('@cancjs/toolbox:Timer');

function isBranded(handle: unknown): boolean {
  return handle != null && (handle as Record<PropertyKey, unknown>)[TIMER_BRAND] === true;
}

describe('startTimer / stopTimer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('short delays', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('returns the raw platform handle and fires once', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, 10);

      expect(isBranded(handle)).toBe(false);

      jest.advanceTimersByTime(9);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(handler).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(10_000);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires at the boundary value without chunking', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, MAX_TIMEOUT);

      expect(isBranded(handle)).toBe(false);

      jest.advanceTimersByTime(MAX_TIMEOUT);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('treats a negative delay as zero', () => {
      const handler = jest.fn();
      startTimer(handler, -5);

      jest.advanceTimersByTime(0);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('treats NaN as zero', () => {
      const handler = jest.fn();
      startTimer(handler, NaN);

      jest.advanceTimersByTime(0);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('long delays', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('does not fire when the platform limit is reached, only at the full duration', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, MAX_TIMEOUT + 1000);

      expect(isBranded(handle)).toBe(true);

      jest.advanceTimersByTime(MAX_TIMEOUT);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(999);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(handler).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(MAX_TIMEOUT);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('spans three chunks and fires at the exact total', () => {
      const handler = jest.fn();
      const total = MAX_TIMEOUT * 2 + 500;
      startTimer(handler, total);

      jest.advanceTimersByTime(total - 1);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(handler).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(total);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('stops during the first chunk', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, MAX_TIMEOUT * 2 + 500);

      jest.advanceTimersByTime(1000);
      stopTimer(handle);

      jest.advanceTimersByTime(MAX_TIMEOUT * 3);
      expect(handler).not.toHaveBeenCalled();
    });

    it('stops during a later chunk', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, MAX_TIMEOUT * 2 + 500);

      jest.advanceTimersByTime(MAX_TIMEOUT + 1);
      expect(handler).not.toHaveBeenCalled();

      stopTimer(handle);

      jest.advanceTimersByTime(MAX_TIMEOUT * 3);
      expect(handler).not.toHaveBeenCalled();
    });

    it('never fires for an infinite delay and stops without throwing', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, Infinity);

      jest.advanceTimersByTime(MAX_TIMEOUT * 3);
      expect(handler).not.toHaveBeenCalled();

      expect(() => stopTimer(handle)).not.toThrow();
    });

    it('never fires past the safe integer range', () => {
      const handler = jest.fn();
      startTimer(handler, Number.MAX_SAFE_INTEGER + 1e6);

      jest.advanceTimersByTime(MAX_TIMEOUT * 3);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('stopTimer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('clears a short timer', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, 50);

      stopTimer(handle);

      jest.advanceTimersByTime(1000);
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores a missing handle', () => {
      expect(() => stopTimer(undefined)).not.toThrow();
      expect(() => stopTimer(null)).not.toThrow();
    });
  });

  describe('injected timers', () => {
    interface IScheduled {
      id: number;
      handler: () => void;
      ms?: number;
    }

    let scheduled: IScheduled[];
    let nextId: number;
    let timers: ITimers;
    let globalSetTimeout: jest.SpyInstance;
    let globalClearTimeout: jest.SpyInstance;

    beforeEach(() => {
      scheduled = [];
      nextId = 1;
      timers = {
        setTimeout: jest.fn((handler: () => void, ms?: number) => {
          const id = nextId++;
          scheduled.push({ id, handler, ms });
          return id;
        }),
        clearTimeout: jest.fn(),
      };
      globalSetTimeout = jest.spyOn(globalThis, 'setTimeout');
      globalClearTimeout = jest.spyOn(globalThis, 'clearTimeout');
    });

    it('schedules through the injected timers and leaves the globals untouched', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, 10, timers);

      expect(timers.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalSetTimeout).not.toHaveBeenCalled();
      expect(handle).toBe(scheduled[0].id);

      scheduled[0].handler();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('chunks a long delay through the injected timers', () => {
      const handler = jest.fn();
      startTimer(handler, MAX_TIMEOUT + 1000, timers);

      expect(timers.setTimeout).toHaveBeenCalledTimes(1);
      expect(scheduled[0].ms).toBe(MAX_TIMEOUT);
      expect(globalSetTimeout).not.toHaveBeenCalled();
    });

    it('clears through the injected timers and leaves the globals untouched', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, 10, timers);

      stopTimer(handle, timers);

      expect(timers.clearTimeout).toHaveBeenCalledTimes(1);
      expect(timers.clearTimeout).toHaveBeenCalledWith(scheduled[0].id);
      expect(globalClearTimeout).not.toHaveBeenCalled();
    });

    it('clears a chunked timer through the injected timers', () => {
      const handler = jest.fn();
      const handle = startTimer(handler, MAX_TIMEOUT + 1000, timers);

      stopTimer(handle, timers);

      expect(timers.clearTimeout).toHaveBeenCalledTimes(1);
      expect(globalClearTimeout).not.toHaveBeenCalled();
    });
  });
});
