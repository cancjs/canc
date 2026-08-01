// Suffix-free injection key: mains provide their flavor's useCheckoutStore under this key so the
// shared router and step components never import a flavored store module directly.

import type { InjectionKey } from 'vue';

import type { CheckoutState, StepName } from './types';

// Shape both flavors' stores share; the id and internal in-flight-load fields differ per flavor
// and are not part of this contract.
export interface CheckoutStore extends CheckoutState {
  validateAddress(line1: string, city: string): void;
  quoteShipping(): void;
  prepareReview(): void;
  goToStep(next: StepName): void;
  quoteShippingOptimistic(): void;
  dispose(): void;
}

export type UseCheckoutStore = () => CheckoutStore;

export const CHECKOUT_STORE_KEY: InjectionKey<UseCheckoutStore> = Symbol('checkout-store');
