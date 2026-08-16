import { attachAbort, clone, mulberry32, sleep } from '@shared/util';

describe('@shared/util', () => {
  test('sleep resolves after ms', async () => {
    const start = Date.now();
    await sleep(10);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });

  test('mulberry32 produces deterministic floats', () => {
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(1);
    for (let i = 0; i < 5; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  test('clone deep copies a value', () => {
    const original = { a: 1, b: { c: 2 } };
    const cloned = clone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
  });

  test('attachAbort attaches listener to signal', () => {
    const abortHandler = jest.fn();
    const signal = new AbortController().signal as any;
    const detach = attachAbort(signal, abortHandler);
    expect(detach).toBeDefined();
    expect(typeof detach).toBe('function');
  });

  test('attachAbort returns undefined for missing signal', () => {
    const abortHandler = jest.fn();
    const detach = attachAbort(undefined, abortHandler);
    expect(detach).toBeUndefined();
  });
});
