import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';

import App from '../src/App.vue';
import { mockCalls } from '../src/mock/checkout-api';
import { createCheckoutRouter } from '../src/router';
import { CHECKOUT_STORE_KEY } from '../src/store-key';
import { useCheckoutStore } from '../src/stores/checkout-canc';

describe('app-vue-pinia canc', () => {
  beforeEach(() => {
    mockCalls.length = 0;
  });

  async function mountApp() {
    const pinia = createPinia();
    // the router's beforeEach reads the store on the very first navigation below, before
    // render() has a chance to install pinia onto an app instance
    setActivePinia(pinia);
    const router = createCheckoutRouter(useCheckoutStore, true);
    router.push('/address');
    await router.isReady();
    render(App, {
      global: { plugins: [pinia, router], provide: { [CHECKOUT_STORE_KEY as symbol]: useCheckoutStore } },
    });
    return { pinia, router };
  }

  it('advancing address -> shipping fast cancels the abandoned validate call', async () => {
    const { router } = await mountApp();

    await fireEvent.update(screen.getByTestId('line1'), '1 Infinite Loop');
    await fireEvent.click(screen.getByTestId('validate-address'));
    // navigate away before the mock validate call (80ms+jitter) settles
    await router.push('/shipping');

    await waitFor(() => {
      const calls = mockCalls.filter((call) => call.endpoint === 'checkout.validateAddress');
      expect(calls.some((call) => call.status === 'aborted')).toBe(true);
    });

    const store = useCheckoutStore();
    // the aborted run never lands: no address-error state, and status was reset by the step move
    expect(store.address).toBeNull();
  });

  it('back-navigation cancels the outstanding shipping quote', async () => {
    const { router } = await mountApp();
    const store = useCheckoutStore();
    store.address = { addressId: 'addr-1', line1: '1 Infinite Loop', city: 'Cupertino' };
    await router.push('/shipping');

    await fireEvent.click(screen.getByTestId('quote-shipping'));
    await router.push('/address');

    await waitFor(() => {
      const calls = mockCalls.filter((call) => call.endpoint === 'checkout.quoteShipping');
      expect(calls.some((call) => call.status === 'aborted')).toBe(true);
    });
    expect(store.shipping).toBeNull();
  });
});
