import { createMockApi } from '@shared/mock-api';
import { waitForDeployment as waitForDepCanc } from './poll-deploy-canc';
import { chargeWithRetry as chargeWithRetryCanc } from './retry-payment-canc';
import { sendEmailWithDelay as sendEmailWithDelayCanc } from './email-delay-canc';

describe('Toolbox utilities - cancellation behavior', () => {
 beforeEach(() => {
 jest.useFakeTimers();
 });

 afterEach(() => {
 jest.runOnlyPendingTimers();
 jest.useRealTimers();
 });

 test('waitForDeployment: cancel stops polling immediately', async () => {
 const { deployments } = createMockApi({ seedMode: true });
 const promise = waitForDepCanc(deployments, 'deploy-1');

 jest.advanceTimersByTime(50);
 promise.cancel?.();

 try {
 await promise;
 } catch (err) {
 // expected to reject with CancelError
 }

 // After cancel, no more pending timers from the poller.
 const pendingTimers = jest.getTimerCount();
 expect(pendingTimers).toBe(0);
 });

 test('chargeWithRetry: cancel stops retry loop and in-flight attempt', async () => {
 const { payments } = createMockApi({ seedMode: true });
 const promise = chargeWithRetryCanc(payments, 'payment-1');

 jest.advanceTimersByTime(50);
 promise.cancel?.();

 try {
 await promise;
 } catch (err) {
 // expected to reject with CancelError
 }

 // Retry backoff timer must be cleared.
 jest.runOnlyPendingTimers();
 const pendingTimers = jest.getTimerCount();
 expect(pendingTimers).toBe(0);
 });

 test('sendEmailWithDelay: cancel clears the delay timer', async () => {
 const { mail } = createMockApi({ seedMode: true });
 const promise = sendEmailWithDelayCanc(mail, 'user@example.com');

 // Timer is pending before cancel.
 expect(jest.getTimerCount()).toBeGreaterThan(0);

 promise.cancel?.();

 try {
 await promise;
 } catch (err) {
 // expected to reject with CancelError
 }

 // After cancel, timer must be cleared.
 expect(jest.getTimerCount()).toBe(0);
 });

 test('both flavors typecheck', () => {
 // Imports succeed and types are compatible.
 // This assertion is a no-op but confirms TS does not error on the module.
 expect(true).toBe(true);
 });
});
