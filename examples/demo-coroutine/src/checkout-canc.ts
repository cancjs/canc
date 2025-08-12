import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type { StockReservation, Charge, Confirmation } from './aux';

/**
 * Cancelable checkout using cancAsync + cancAwait.
 * Cancellation is ambient — no per-step checks needed.
 * The finally block runs shielded on cancel, releasing the stock reservation.
 */

export function createCheckoutCancelable(
 reserveStock: (orderId: string) => Promise<StockReservation>,
 charge: (orderId: string) => Promise<Charge>,
 addPoints: (orderId: string) => Promise<any>,
 confirm: (orderId: string, chargeId: string) => Promise<Confirmation>,
 releaseReservation: (resId: string) => Promise<void>,
) {
 return cancAsync(function* (orderId: string): any {
 let checkoutDone = false;
 let reservation: StockReservation | undefined;

 try {
 // Cancellation is ambient — no per-step checks
 reservation = yield* cancAwait(reserveStock(orderId));

 // Parallel charge + loyalty points; cancellation cancels both
 const [chargeResult] = yield* cancAwait.all([
 charge(orderId),
 addPoints(orderId),
 ]);

 // Cancellation is ambient — no per-step checks
 const confirmation = yield* cancAwait(confirm(orderId, chargeResult.id));
 checkoutDone = true;
 return confirmation;
 } finally {
 // Finally runs shielded on cancel (D23 drain)
 if (!checkoutDone && reservation) {
 yield* cancAwait(releaseReservation(reservation.id));
 }
 }
 });
}
