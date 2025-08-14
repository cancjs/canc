/**
 * Smoke test: cancel during charge and verify reservation is released.
 */
import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { addCheckoutOperations } from './mock/checkout-ops';
import { createCheckoutCancelable } from './checkout-canc';

async function runSmoke() {
 const { api } = createMockApi({ latency: 50, jitter: 0 });
 const ops = addCheckoutOperations(api);
 const checkout = createCheckoutCancelable(
 (id) => ops.reserveStock(id),
 (id) => ops.charge(id),
 (id) => ops.addPoints(id),
 (id, chargeId) => ops.confirm(id, chargeId),
 (id) => ops.releaseReservation(id),
 (id) => ops.legacyConfirmEmail(id),
 );

 console.log('Smoke test: cancel during charge → reservation released');

 const checkoutOp = checkout('order-smoke');
 setTimeout(() => checkoutOp.cancel(), 75);

 try {
 await checkoutOp;
 console.error('FAIL: should have thrown CancelError');
 process.exit(1);
 } catch (err) {
 if (!isCancelError(err)) {
 console.error(`FAIL: wrong error type: ${err}`);
 process.exit(1);
 }
 }

 // Verify releaseReservation was called (appears in mock api logs)
 const calls = api.calls;
 const releaseCall = calls.find((c) => c.endpoint === 'checkout.releaseReservation');
 if (!releaseCall) {
 console.error('FAIL: releaseReservation was not called');
 console.error('Calls made:', calls.map((c) => c.endpoint));
 process.exit(1);
 }

 console.log('✓ PASS');
}

runSmoke().catch((err) => {
 console.error('FAIL:', err);
 process.exit(1);
});
