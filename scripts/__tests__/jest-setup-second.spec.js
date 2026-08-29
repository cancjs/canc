/* global describe, it, expect */

describe('jest.setup.js second suite', () => {
  it('has 1 listener after multiple suites in worker', () => {
    expect(process.listenerCount('unhandledRejection')).toBe(1);
  });
});
