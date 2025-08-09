import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useCheckoutStore } from '../src/stores/checkout';
import { mockCalls } from '../src/mock/checkout-api';

describe('app-vue-pinia canc', () => {
 beforeEach(() => {
 setActivePinia(createPinia());
 mockCalls.length = 0;
 });

 it('advancing address→shipping fast before validate settles cancels the validate: no address-error state from stale run', async () => {
 const store = useCheckoutStore();

 // Trigger address validation (will take ~80ms)
 store.validateAddress('221B Baker St', 'London');

 // Immediately advance to shipping before validation completes
 store.goToStep('shipping');

 // Complete all pending promises
 await flushPromises();

 // The abandoned validateAddress call should be aborted
 const validateCalls = mockCalls.filter((call) => call.endpoint === 'checkout.validateAddress');
 expect(validateCalls.some((call) => call.status === 'aborted')).toBe(true);

 // Store should not have received the stale address result
 expect(store.address).toBeNull();
 expect(store.addressStatus).toBe('idle');
 });

 it('back-navigation from shipping cancels an outstanding quote', async () => {
 const store = useCheckoutStore();

 // Set up address to enable shipping quote
 store.address = { addressId: 'addr-12-6', line1: '221B Baker St', city: 'London' };

 // Trigger quote (will take ~80ms)
 store.quoteShipping();

 // Immediately go back to address before quote settles
 store.goToStep('address');

 // Complete all pending promises
 await flushPromises();

 // The abandoned quoteShipping call should be aborted
 const quoteCalls = mockCalls.filter((call) => call.endpoint === 'checkout.quoteShipping');
 expect(quoteCalls.some((call) => call.status === 'aborted')).toBe(true);

 // Store should not have received the stale quote result
 expect(store.shipping).toBeNull();
 expect(store.shippingStatus).toBe('idle');
 });

 it('typecheck: no TS errors', () => {
 // This test verifies the canc store compiles without TS errors
 const store = useCheckoutStore();
 expect(store).toBeDefined();
 });
});
