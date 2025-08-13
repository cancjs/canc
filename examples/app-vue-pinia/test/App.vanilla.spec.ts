import { render, screen, waitFor, fireEvent } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import App from '../src/App.vue';
import { createCheckoutRouter } from '../src/router';
import { useCheckoutStore } from '../src/stores/checkout-vanilla';
import { mockCalls } from '../src/mock/checkout-api';

describe('app-vue-pinia vanilla', () => {
 beforeEach(() => {
 mockCalls.length = 0;
 });

 async function mountApp() {
 const pinia = createPinia();
 // the router's beforeEach reads the store on the very first navigation below, before
 // render() has a chance to install pinia onto an app instance
 setActivePinia(pinia);
 const router = createCheckoutRouter(true);
 router.push('/address');
 await router.isReady();
 render(App, { global: { plugins: [pinia, router] } });
 return { pinia, router };
 }

 it('advancing address -> shipping fast has no cancel: the validate call still completes on the wire', async () => {
 const { router } = await mountApp();

 await fireEvent.update(screen.getByTestId('line1'), '1 Infinite Loop');
 await fireEvent.click(screen.getByTestId('validate-address'));
 await router.push('/shipping');

 // vanilla inverted: the request the user already abandoned still completes -- the bug we
 // teach, not something to assert away
 await waitFor(() => {
 const calls = mockCalls.filter((call) => call.endpoint === 'checkout.validateAddress');
 expect(calls.some((call) => call.status === 'completed')).toBe(true);
 });

 const store = useCheckoutStore();
 // the stale guard only skips the state write; store.address stays null even though the
 // request succeeded, because goToStep already moved the wizard on
 expect(store.address).toBeNull();
 });
});
