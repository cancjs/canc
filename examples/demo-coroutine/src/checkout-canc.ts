import * as canc from '@cancjs/coroutine';

import type { Charge, Confirmation, StockReservation } from './mock/checkout-ops';

/**
 * Cancelable checkout using canc.async + canc.await.
 * Cancellation is ambient, no per-step checks needed.
 * The finally block runs shielded on cancel, releasing the stock reservation.
 */

export function createCheckoutCancelable(
  reserveStock: (orderId: string) => Promise<StockReservation>,
  charge: (orderId: string) => Promise<Charge>,
  addPoints: (orderId: string) => Promise<any>,
  confirm: (orderId: string, chargeId: string) => Promise<Confirmation>,
  releaseReservation: (resId: string) => Promise<void>,
  legacyConfirmEmail: (orderId: string) => Promise<void>,
) {
  return canc.async(function* (orderId: string): any {
    let checkoutDone = false;
    let reservation: StockReservation | undefined;

    try {
      // Cancellation is ambient, no per-step checks
      reservation = yield* canc.await(reserveStock(orderId));

      // Parallel charge + loyalty points; cancellation cancels both
      const [chargeResult] = yield* canc.await.all([charge(orderId), addPoints(orderId)]);

      // Cancellation is ambient, no per-step checks
      const confirmation = yield* canc.await(confirm(orderId, chargeResult.id));
      checkoutDone = true;

      // Cancellation gap: the notification vendor takes no signal, so once this step
      // starts it runs to completion even if the coroutine is canceled right after.
      // A stale order confirmation email is harmless, so the gap is left open rather
      // than blocked on a workaround.
      yield* canc.await(legacyConfirmEmail(orderId));

      return confirmation;
    } finally {
      // Finally runs shielded on cancel
      if (!checkoutDone && reservation) {
        yield* canc.await(releaseReservation(reservation.id));
      }
    }
  });
}
