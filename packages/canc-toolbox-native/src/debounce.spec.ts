import { debounce } from './debounce';

describe('debounce (native)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('trailing: invokes fn once after quiet period', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = (x: number) => {
      callCount++;
      return Promise.resolve(x);
    };
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(2);
    debounced(3);

    expect(callCount).toBe(0);
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('trailing: resolves with last call args', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => Promise.resolve(x * 10);
    const debounced = debounce(fn, 50);

    debounced(1);
    debounced(2);
    const p = debounced(3);

    jest.advanceTimersByTime(50);
    const result = await p;
    expect(result).toBe(30);
  });

  it('leading: invokes immediately on first call', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced();
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('maxWait: forces invocation', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100, { maxWait: 150 });

    debounced();
    jest.advanceTimersByTime(80);
    debounced();
    jest.advanceTimersByTime(70);

    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  it('.cancel() clears timer', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(1);
    };
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(callCount).toBe(0);
  });

  it('.flush() invokes immediately', async () => {
    jest.useFakeTimers();
    const fn = (x: number) => Promise.resolve(x * 2);
    const debounced = debounce(fn, 100);

    debounced(5);
    const p = debounced.flush();

    expect(p).toBeDefined();
    const result = await p!;
    expect(result).toBe(10);
  });

  it('.isPending reflects timer state', () => {
    jest.useFakeTimers();
    const fn = () => Promise.resolve(1);
    const debounced = debounce(fn, 100);

    expect(debounced.isPending).toBe(false);
    debounced();
    expect(debounced.isPending).toBe(true);
    jest.advanceTimersByTime(100);
    expect(debounced.isPending).toBe(false);
  });

  it('returns a plain native Promise', () => {
    const fn = () => Promise.resolve(1);
    const debounced = debounce(fn, 100);
    const p = debounced();
    expect(p).toBeInstanceOf(Promise);
    expect('cancel' in p).toBe(false);
  });
});
