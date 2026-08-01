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

      // Must remember to check the signal after every await
      signal.throwIfAborted();
      const confirmation = await confirm(orderId, chargeResult.id, signal);
      checkoutDone = true;

      // Cancellation gap: the notification vendor takes no signal, so once this step
      // starts it runs to completion even if the caller aborted right after. Same gap
      // as the canc flavor, since no amount of signal-threading closes it here.
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
