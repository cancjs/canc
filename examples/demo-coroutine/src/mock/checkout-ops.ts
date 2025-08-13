import type { MockApiBundle, AbortSignalLike } from '@shared/mock-api';

/**
 * Checkout-specific operations for the demo.
 * In a real app, these would be API methods on a backend service.
 */

export interface StockReservation {
 id: string;
 productId: string;
}

export interface Charge {
 id: string;
 amount: number;
}

export interface Confirmation {
 confirmationId: string;
 orderId: string;
}

export function addCheckoutOperations(apiBundle: MockApiBundle) {
 const api = apiBundle.api;
 return {
 reserveStock: (orderId: string, signal?: AbortSignalLike): Promise<StockReservation> =>
 api.respond(
 'checkout.reserveStock',
 { orderId },
 () => ({
 id: `res-${orderId}-${Date.now()}`,
 productId: 'p1',
 }),
 signal,
 ),

 charge: (orderId: string, signal?: AbortSignalLike): Promise<Charge> =>
 api.respond(
 'checkout.charge',
 { orderId },
 () => ({
 id: `charge-${orderId}-${Date.now()}`,
 amount: 99.99,
 }),
 signal,
 ),

 addPoints: (orderId: string, signal?: AbortSignalLike): Promise<{ points: number }> =>
 api.respond(
 'checkout.addPoints',
 { orderId },
 () => ({
 points: 100,
 }),
 signal,
 ),

 confirm: (
 orderId: string,
 chargeId: string,
 signal?: AbortSignalLike,
 ): Promise<Confirmation> =>
 api.respond(
 'checkout.confirm',
 { orderId, chargeId },
 () => ({
 confirmationId: `conf-${orderId}-${Date.now()}`,
 orderId,
 }),
 signal,
 ),

 releaseReservation: (reservationId: string, signal?: AbortSignalLike): Promise<void> =>
 api.respond(
 'checkout.releaseReservation',
 { reservationId },
 () => undefined,
 signal,
 ),

 // Legacy notification vendor. No signal parameter: this call cannot be aborted once
 // started, no matter which flavor calls it.
 legacyConfirmEmail: (orderId: string): Promise<void> =>
 api.respond(
 'checkout.legacyConfirmEmail',
 { orderId },
 () => undefined,
 ),
 };
}
