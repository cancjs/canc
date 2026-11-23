import { isCancelError, isTimeoutError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';

import { fetchInventoryWithTimeout as fetchInventoryCanc } from './inventory-timeout-canc';
import {
  fetchInventoryWithTimeout as fetchInventoryVanilla,
  fetchInventoryWithTimeoutAbortable,
} from './inventory-timeout-vanilla';
import { chargeWithRetry as chargeCanc } from './retry-payment-canc';
import { chargeWithRetry as chargeVanilla, chargeWithRetryAbortable } from './retry-payment-vanilla';

const options = (latency: number) => ({ seedMode: false, latency, jitter: 0 });

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function capture<T>(promise: PromiseLike<T>): Promise<{ value?: T; error?: unknown }> {
  return Promise.resolve(promise).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
}

describe('toolbox transport cancellation against the native mock API', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('aborts inventory work at the 500ms deadline, unlike a plain Promise.race', async () => {
    const canc = createMockApi(options(630));
    const vanilla = createMockApi(options(630));
    const manual = createMockApi(options(630));

    const cancResult = capture(fetchInventoryCanc(canc.inventory, 'product-1'));
    const vanillaResult = capture(fetchInventoryVanilla(vanilla.inventory, 'product-1'));
    const manualResult = capture(fetchInventoryWithTimeoutAbortable(manual.inventory, 'product-1'));

    await flush();
    expect(canc.api.calls.map((call) => call.status)).toEqual(['started']);
    expect(vanilla.api.calls.map((call) => call.status)).toEqual(['started']);
    expect(manual.api.calls.map((call) => call.status)).toEqual(['started']);

    await jest.advanceTimersByTimeAsync(500);
    const cancOutcome = await cancResult;
    const vanillaOutcome = await vanillaResult;
    const manualOutcome = await manualResult;

    expect(isTimeoutError(cancOutcome.error)).toBe(true);
    expect((vanillaOutcome.error as Error).message).toBe('timeout');
    expect((manualOutcome.error as Error).message).toBe('timeout');
    expect(canc.api.calls[0].status).toBe('aborted');
    expect(vanilla.api.calls[0].status).toBe('started');
    expect(manual.api.calls[0].status).toBe('aborted');

    await jest.advanceTimersByTimeAsync(500);
    expect(canc.api.calls.map((call) => call.status)).toEqual(['aborted']);
    expect(vanilla.api.calls.map((call) => call.status)).toEqual(['completed']);
    expect(manual.api.calls.map((call) => call.status)).toEqual(['aborted']);
  });

  it('aborts an active payment attempt while plain vanilla still completes', async () => {
    const canc = createMockApi(options(160));
    const vanilla = createMockApi(options(160));
    const manual = createMockApi(options(160));

    const cancellable = chargeCanc(canc.payments, 'payment-1');
    const cancOutcome = capture(cancellable);
    const vanillaOutcome = capture(chargeVanilla(vanilla.payments, 'payment-1'));
    const manuallyCancelable = chargeWithRetryAbortable(manual.payments, 'payment-1');
    const manualOutcome = capture(manuallyCancelable.promise);

    await flush();
    expect(canc.api.calls.map((call) => call.status)).toEqual(['started']);
    expect(vanilla.api.calls.map((call) => call.status)).toEqual(['started']);
    expect(manual.api.calls.map((call) => call.status)).toEqual(['started']);

    await jest.advanceTimersByTimeAsync(25);
    cancellable.cancel();
    manuallyCancelable.cancel();

    expect(isCancelError((await cancOutcome).error)).toBe(true);
    expect((await manualOutcome).error).toEqual(new Error('Canceled by client'));
    expect(canc.api.calls[0].status).toBe('aborted');
    expect(manual.api.calls[0].status).toBe('aborted');
    expect(vanilla.api.calls[0].status).toBe('started');

    await jest.advanceTimersByTimeAsync(500);
    expect((await vanillaOutcome).value).toMatch(/^txn-payment-1-/);
    expect(vanilla.api.calls[0].status).toBe('completed');
    expect(canc.api.calls).toHaveLength(1);
    expect(manual.api.calls).toHaveLength(1);
  });

  it('does not start another payment attempt when canceled during retry backoff', async () => {
    const canc = createMockApi(options(0));
    const manual = createMockApi(options(0));

    const cancellable = chargeCanc(canc.payments, 'payment-2');
    const cancOutcome = capture(cancellable);
    const manuallyCancelable = chargeWithRetryAbortable(manual.payments, 'payment-2');
    const manualOutcome = capture(manuallyCancelable.promise);

    await jest.advanceTimersByTimeAsync(0);
    await flush();
    expect(canc.api.calls).toHaveLength(1);
    expect(manual.api.calls).toHaveLength(1);
    expect(canc.api.calls[0].status).toBe('failed');
    expect(manual.api.calls[0].status).toBe('failed');

    await jest.advanceTimersByTimeAsync(50);
    cancellable.cancel();
    manuallyCancelable.cancel();

    expect(isCancelError((await cancOutcome).error)).toBe(true);
    expect((await manualOutcome).error).toEqual(new Error('Canceled by client'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(canc.api.calls).toHaveLength(1);
    expect(manual.api.calls).toHaveLength(1);
  });

  it('lets a successful un-canceled payment complete normally', async () => {
    const vanilla = createMockApi(options(160));
    const manual = createMockApi(options(160));
    const normal = capture(chargeVanilla(vanilla.payments, 'payment-1'));
    const manuallyCancelable = chargeWithRetryAbortable(manual.payments, 'payment-1');
    const abortable = capture(manuallyCancelable.promise);

    await jest.advanceTimersByTimeAsync(160);
    expect((await normal).value).toMatch(/^txn-payment-1-/);
    expect((await abortable).value).toMatch(/^txn-payment-1-/);
    expect(vanilla.api.calls[0].status).toBe('completed');
    expect(manual.api.calls[0].status).toBe('completed');
  });
});
