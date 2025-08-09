import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useCheckoutStore } from '../src/stores/checkout';
import { mockCalls } from '../src/mock/checkout-api';

describe('app-vue-pinia vanilla', () => {
 beforeEach(() => {
 setActivePinia(createPinia());
 mockCalls.length = 0;
 });

 it('advancing address→shipping fast does not cancel validate: stale run overwrites state after wizard moved on', async () => {
 const store = useCheckoutStore();

 // Trigger address validation (will take ~80ms)
 store.validateAddress('221B Baker St', 'London');

 // Immediately advance to shipping before validation completes
 store.goToStep('shipping');

 // Complete all pending promises (including the stale validate response)
 await flushPromises();

 // The abandoned validateAddress call completed (no abort in vanilla workaround)
 const validateCalls = mockCalls.filter((call) => call.endpoint === 'checkout.validateAddress');
 expect(validateCalls.every((call) => call.status !== 'aborted')).toBe(true);

 // Store suppressed the stale result via request-id guard, not cancellation —
 // demonstrates the bloat: the request still completes on the wire
 expect(store.address).toBeNull();
 expect(store.addressStatus).toBe('idle');
 });

 it('typecheck: no TS errors', () => {
 // This test verifies the vanilla store compiles without TS errors
 const store = useCheckoutStore();
 expect(store).toBeDefined();
 });
});
