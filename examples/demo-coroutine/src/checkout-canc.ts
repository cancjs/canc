import * as canc from '@cancjs/coroutine';

import { type Charge, type Confirmation, NegativeChargeError, type StockReservation } from './mock/checkout-ops';

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

      // routes domain failure into the coroutine typed failure set
      if (chargeResult.amount < 0) {
        return yield* canc.throw(new NegativeChargeError('Negative charge amount'));
      }

      // Cancellation is ambient, no per-step checks
      const confirmation = yield* canc.await(confirm(orderId, chargeResult.id));
      checkoutDone = true;

      // Cancellation gap: notification vendor takes no signal and runs to completion if aborted.
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
