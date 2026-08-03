import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';

import { createCheckoutCancelable } from './checkout-canc';
import { addCheckoutOperations } from './mock/checkout-ops';

async function runCanc() {
  const { api } = createMockApi({ latency: 50, jitter: 0, trace: console.log });
  const ops = addCheckoutOperations(api);
  const checkout = createCheckoutCancelable(
    (orderId) => ops.reserveStock(orderId),
    (orderId) => ops.charge(orderId),
    (orderId) => ops.addPoints(orderId),
    (orderId, chargeId) => ops.confirm(orderId, chargeId),
    (resId) => ops.releaseReservation(resId),
    (orderId) => ops.legacyConfirmEmail(orderId),
  );

  console.log('=== Cancelable Checkout (canc.async) ===\n');

  // Happy path
  console.log('Scenario: happy path');
  try {
    const result = await checkout('order-001');
    console.log(`✓ Checkout succeeded: ${(result as any).confirmationId}\n`);
  } catch (err: any) {
    console.log(`✗ Error: ${err.message}\n`);
  }

  // Cancel during charge (payment pending)
  console.log('Scenario: cancel during charge');
  const checkoutOp = checkout('order-002');

  // Simulate cancel after reservation succeeds, during charge
  setTimeout(() => {
    console.log('→ Canceling...');
    checkoutOp.cancel();
  }, 75);

  try {
    await checkoutOp;
    console.log(`✓ Checkout succeeded\n`);
  } catch (err: any) {
    if (isCancelError(err)) {
      console.log(`✓ Checkout canceled (reservation released)\n`);
    } else {
      console.log(`✗ Error: ${err.message}\n`);
    }
  }

  // Cancel before start
  console.log('Scenario: cancel before start');
  const checkoutOp2 = checkout('order-003');
  checkoutOp2.cancel();

  try {
    await checkoutOp2;
    console.log(`✓ Checkout succeeded\n`);
  } catch (err: any) {
    if (isCancelError(err)) {
      console.log(`✓ Checkout canceled immediately (never reserved)\n`);
    } else {
      console.log(`✗ Error: ${err.message}\n`);
    }
  }
}

runCanc().catch(console.error);
