import type { AddressResult, ShippingQuote, ReviewSummary } from './mock/checkout-api';

export type { AddressResult, ShippingQuote, ReviewSummary };

export type StepName = 'address' | 'shipping' | 'review';

export const STEP_ORDER: StepName[] = ['address', 'shipping', 'review'];

export interface CheckoutState {
 step: StepName;
 addressStatus: 'idle' | 'loading' | 'done';
 address: AddressResult | null;
 shippingStatus: 'idle' | 'loading' | 'done';
 shipping: ShippingQuote | null;
 reviewStatus: 'idle' | 'loading' | 'done';
 review: ReviewSummary | null;
}
