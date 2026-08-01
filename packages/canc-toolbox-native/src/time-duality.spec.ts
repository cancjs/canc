import { MAX_TIMEOUT } from '../../_toolbox';
import { delay, isTimeoutError, timeout } from './index';

// The native twin of `time-duality.spec.ts` in @cancjs/toolbox. Same call syntax, same
// assertions, minus anything cancellation-specific - proof the factory recipe kept both
// packages' public signatures identical. `delay`/`timeout` here settle plain native Promises.
describe('time helper duality (native)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }
  }

  it('delay and timeout are duals: delay(200) resolves, timeout(200) rejects isTimeoutError, both at ~200ms', async () => {
    jest.useFakeTimers();

    const resolves = delay(200);
    const rejects = timeout(200);
    rejects.catch(() => undefined);

    let resolved = false;
    let rejected = false;
    resolves.then(() => {
      resolved = true;
    });
    rejects.catch(() => {
      rejected = true;
    });

    jest.advanceTimersByTime(199);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(rejected).toBe(false);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(rejected).toBe(true);

    await expect(resolves).resolves.toBeUndefined();
    const reason: unknown = await rejects.catch((error: unknown) => error);
    expect(isTimeoutError(reason)).toBe(true);
  });

  it('delay(work, ms) matches Promise.all([work, delay(ms)]) in settle time', async () => {
    jest.useFakeTimers();

    const makeWork = (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve('work'), 300);
      });

    const viaDelay = delay(makeWork(), 200);
    const viaAll = Promise.all([makeWork(), delay(200)]);

    let delaySettled = false;
    let allSettled = false;
    viaDelay.then(() => {
      delaySettled = true;
    });
    viaAll.then(() => {
      allSettled = true;
    });

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(delaySettled).toBe(false);
    expect(allSettled).toBe(false);

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(delaySettled).toBe(false);
    expect(allSettled).toBe(false);

    jest.advanceTimersByTime(1);
    await viaDelay;
    await viaAll;
    expect(delaySettled).toBe(true);
    expect(allSettled).toBe(true);
  });

  it('timeout(work, ms) matches Promise.race([work, timeout(ms)]) - work wins', async () => {
    jest.useFakeTimers();

    const makeWork = (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve('work'), 100);
      });

    const viaTimeout = timeout(makeWork(), 200);
    const viaRace = Promise.race([makeWork(), timeout(200)]);

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    let a = false;
    let b = false;
    viaTimeout.then(() => {
      a = true;
    });
    viaRace.then(() => {
      b = true;
    });
    await Promise.resolve();
    expect(a).toBe(false);
    expect(b).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(viaTimeout).resolves.toBe('work');
    await expect(viaRace).resolves.toBe('work');
  });

  it('timeout(work, ms) matches Promise.race([work, timeout(ms)]) - the deadline wins', async () => {
    jest.useFakeTimers();

    const makeWork = (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve('work'), 300);
      });

    const viaTimeout = timeout(makeWork(), 200);
    const viaRace = Promise.race([makeWork(), timeout(200)]);
    viaTimeout.catch(() => undefined);
    viaRace.catch(() => undefined);

    jest.advanceTimersByTime(199);
    await Promise.resolve();
    let aSettled = false;
    let bSettled = false;
    viaTimeout.catch(() => {
      aSettled = true;
    });
    viaRace.catch(() => {
      bSettled = true;
    });
    await Promise.resolve();
    expect(aSettled).toBe(false);
    expect(bSettled).toBe(false);

    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(aSettled).toBe(true);
    expect(bSettled).toBe(true);

    const reasonA: unknown = await viaTimeout.catch((error: unknown) => error);
    const reasonB: unknown = await viaRace.catch((error: unknown) => error);
    expect(isTimeoutError(reasonA)).toBe(true);
    expect(isTimeoutError(reasonB)).toBe(true);
  });

  it('a delay longer than the platform timer limit does not fire early', async () => {
    jest.useFakeTimers();

    const promise = delay(MAX_TIMEOUT + 1);

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(MAX_TIMEOUT);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(settled).toBe(true);
  });
});
