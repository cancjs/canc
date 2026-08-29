/* global describe, it, expect, beforeAll, afterAll, jest */

describe('leaks', () => {
  it('test A', () => {
    setTimeout(() => Promise.reject(new Error('leak from A')), 60);
  });

  it('test B', async () => {
    await new Promise((r) => setTimeout(r, 200));
  });

  it('test C leaks two', () => {
    Promise.reject(new Error('leak 1'));
    Promise.reject(new Error('leak 2'));
  });
});
