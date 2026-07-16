import { render, screen, fireEvent, waitFor } from '@testing-library/vue';

import App from '../src/App.vue';
import ProductDetail from '../src/ProductDetail-canc.vue';
import { mockCalls } from '../src/mock/catalog-api';

describe('app-vue-suspense canc', () => {
 beforeEach(() => {
 mockCalls.length = 0;
 });

 function mountApp() {
 return render(App, { props: { detailComponent: ProductDetail, title: 'canc' } });
 }

 it('cancels the abandoned product load when another product is opened mid-load', async () => {
 mountApp();

 // Open the first product, then switch to the second before its load settles.
 await fireEvent.click(screen.getByTestId('open-p1'));
 await fireEvent.click(screen.getByTestId('open-p3'));

 await waitFor(() => {
 const calls = mockCalls.filter((call) => call.endpoint === 'catalog.loadProductDetail');
 // The abandoned p1 load aborts because switching tore down its setup scope.
 expect(calls.some((call) => call.args && (call.args as { id: string }).id === 'p1' && call.status === 'aborted')).toBe(true);
 });
 });
});
