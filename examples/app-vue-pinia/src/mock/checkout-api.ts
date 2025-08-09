// Per-example scaffolding: a checkout backend on top of the shared MockApi. Pretend this is your
// real address-validation, shipping-rate, and payment-review services. Every call runs through
// MockApi.respond, so it honors an AbortSignal and shows up in mockApi.api.calls with
// started/completed/aborted markers. Black box for the reader -- the teaching payload lives in
// src/stores/checkout-*.ts.

import { createMockApi, type AbortSignalLike } from '@shared/mock-api';

export interface AddressResult {
 addressId: string;
 line1: string;
 city: string;
}

export interface ShippingQuote {
 shippingId: string;
 addressId: string;
 carrier: string;
 amount: number;
}

export interface ReviewSummary {
 addressId: string;
 shippingId: string;
 total: number;
}

const mock = createMockApi({ latency: 80, jitter: 40 });

export const mockCalls = mock.api.calls;

export function validateAddress(line1: string, city: string, signal?: AbortSignalLike): Promise<AddressResult> {
 return mock.api.respond(
 'checkout.validateAddress',
 { line1, city },
 () => ({ addressId: `addr-${line1.length}-${city.length}`, line1, city }),
 signal
 );
}

export function quoteShipping(addressId: string, signal?: AbortSignalLike): Promise<ShippingQuote> {
 return mock.api.respond(
 'checkout.quoteShipping',
 { addressId },
 () => ({
 shippingId: `ship-${addressId}`,
 addressId,
 carrier: 'ParcelCo',
 amount: 5 + Math.floor(mock.api.random() * 20),
 }),
 signal
 );
}

// Two-step on purpose: a review recap must read back the shipping quote before it can confirm the
// total, which is the natural spot in this example to sequence two cancelable calls.
export function fetchShippingRecap(shippingId: string, signal?: AbortSignalLike): Promise<{ amount: number }> {
 return mock.api.respond(
 'checkout.fetchShippingRecap',
 { shippingId },
 () => ({ amount: 5 + Math.floor(mock.api.random() * 20) }),
 signal
 );
}

export function confirmReview(
 addressId: string,
 shippingId: string,
 recapAmount: number,
 signal?: AbortSignalLike
): Promise<ReviewSummary> {
 return mock.api.respond(
 'checkout.confirmReview',
 { addressId, shippingId, recapAmount },
 () => ({ addressId, shippingId, total: 100 + recapAmount }),
 signal
 );
}
