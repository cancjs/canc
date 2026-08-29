/* global describe, it, expect, beforeAll, afterAll, jest */

describe('fake timers in beforeAll', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('test 1', () => {
    expect(() => jest.getTimerCount()).not.toThrow();
  });

  it('test 2', () => {
    expect(() => jest.getTimerCount()).not.toThrow();
  });
});
