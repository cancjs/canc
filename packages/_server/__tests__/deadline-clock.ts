/**
 * Fakes only `setTimeout` and `clearTimeout`, the pair a request deadline is armed with, so real
 * sockets, immediates and microtasks keep running while the test moves the deadline by hand.
 */
export function useDeadlineClock(): void {
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: [
        'Date',
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });
}

/** Moves the clock to just before `ms` and checks the signal is untouched, then past it and checks it aborted. */
export function expectAbortAt(signal: AbortSignal, ms: number): void {
  jest.advanceTimersByTime(ms - 1);
  expect(signal.aborted).toBe(false);

  jest.advanceTimersByTime(1);
  expect(signal.aborted).toBe(true);
}
