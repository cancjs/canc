import { Charge, Confirmation, NegativeChargeError, StockReservation } from './mock/checkout-ops';

/**
 * Vanilla checkout using AbortSignal threading.
 * The signal must be checked after every await to respond to cancellation.
 */

export function createCheckoutVanilla(
  reserveStock: (orderId: string, signal?: AbortSignal) => Promise<StockReservation>,
  charge: (orderId: string, signal?: AbortSignal) => Promise<Charge>,
  addPoints: (orderId: string, signal?: AbortSignal) => Promise<any>,
  confirm: (orderId: string, chargeId: string, signal?: AbortSignal) => Promise<Confirmation>,
  releaseReservation: (resId: string, signal?: AbortSignal) => Promise<void>,
  legacyConfirmEmail: (orderId: string) => Promise<void>,
) {
  return async function checkout(orderId: string, signal: AbortSignal): Promise<Confirmation> {
    let checkoutDone = false;
    let reservation: StockReservation | undefined;

    try {
      // Must remember to check the signal after every await
      signal.throwIfAborted();
      reservation = await reserveStock(orderId, signal);

      // Must remember to check the signal after every await
      signal.throwIfAborted();
      const [chargeResult] = await Promise.all([charge(orderId, signal), addPoints(orderId, signal)]);

      // throws matching domain error to align with coroutine failure twin
      if (chargeResult.amount < 0) {
        throw new NegativeChargeError('Negative charge amount');
      }

      // Must remember to check the signal after every await
      signal.throwIfAborted();
      const confirmation = await confirm(orderId, chargeResult.id, signal);
      checkoutDone = true;

      // Cancellation gap: notification vendor takes no signal and runs to completion if aborted.
      await legacyConfirmEmail(orderId);

      return confirmation;
    } finally {
      // Must manually ensure signal is checked here too
      if (!checkoutDone && reservation) {
        await releaseReservation(reservation.id, signal);
      }
    }
  };
}
