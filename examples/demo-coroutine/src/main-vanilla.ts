import { createMockApi } from '@shared/mock-api';

import { createCheckoutVanilla } from './checkout-vanilla';
import { addCheckoutOperations } from './mock/checkout-ops';

async function runVanilla() {
  const { api } = createMockApi({ latency: 50, jitter: 0, trace: console.log });
  const ops = addCheckoutOperations(api);
  const checkout = createCheckoutVanilla(
    ops.reserveStock,
    ops.charge,
    ops.addPoints,
    ops.confirm,
    ops.releaseReservation,
    ops.legacyConfirmEmail,
  );

  console.log('=== Vanilla Checkout (AbortSignal) ===\n');

  // Happy path. checkout() requires a signal even when nothing aborts it,
  // unlike the canc flavor where cancellation is opt-in per call.
  console.log('Scenario: happy path');
  const happyPathController = new AbortController();
  try {
    const result = await checkout('order-001', happyPathController.signal);
    console.log(`✓ Checkout succeeded: ${result.confirmationId}\n`);
  } catch (err: any) {
    console.log(`✗ Error: ${err.message}\n`);
  }

  // Cancel during charge (payment pending)
  console.log('Scenario: cancel during charge');
  const controller2 = new AbortController();
  const checkoutPromise = checkout('order-002', controller2.signal);

  // Simulate cancel after reservation succeeds, during charge
  setTimeout(() => {
    console.log('→ Canceling...');
    controller2.abort();
  }, 75);

  try {
    await checkoutPromise;
    console.log(`✓ Checkout succeeded\n`);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log(`✓ Checkout aborted (reservation released)\n`);
    } else {
      console.log(`✗ Error: ${err.message}\n`);
    }
  }

  // Cancel before start
  console.log('Scenario: cancel before start');
  const controller3 = new AbortController();
  controller3.abort();

  try {
    await checkout('order-003', controller3.signal);
    console.log(`✓ Checkout succeeded\n`);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log(`✓ Checkout aborted immediately (never reserved)\n`);
    } else {
      console.log(`✗ Error: ${err.message}\n`);
    }
  }
}

runVanilla().catch(console.error);
