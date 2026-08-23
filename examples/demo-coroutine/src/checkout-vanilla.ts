import { Charge, Confirmation, StockReservation } from './mock/checkout-ops';

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

      // If the app determines it must cancel itself from within, rather than waiting for an
      // external signal, it can explicitly reject with an AbortError.
      if (chargeResult.amount < 0) {
        const err = new Error('Negative charge amount');
        err.name = 'AbortError';
        throw err;
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
