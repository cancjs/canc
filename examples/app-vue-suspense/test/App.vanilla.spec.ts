import { fireEvent, render, screen, waitFor } from '@testing-library/vue';

import App from '../src/App.vue';
import { mockCalls } from '../src/mock/catalog-api';
import ProductDetail from '../src/ProductDetail-vanilla.vue';

describe('app-vue-suspense vanilla', () => {
  beforeEach(() => {
    mockCalls.length = 0;
  });

  function mountApp() {
    return render(App, { props: { detailComponent: ProductDetail, title: 'vanilla' } });
  }

  it('keeps the abandoned product load running after switching — the leak we teach', async () => {
    mountApp();

    await fireEvent.click(screen.getByTestId('open-p1'));
    await fireEvent.click(screen.getByTestId('open-p3'));

    await waitFor(() => {
      const calls = mockCalls.filter(
        (call) =>
          call.endpoint === 'catalog.loadProductDetail' && call.args && (call.args as { id: string }).id === 'p1',
      );
      // Inverted assertion: the bare async setup has no scope hook, so the abandoned p1 load
      // completes instead of aborting.
      expect(calls.some((call) => call.status === 'completed')).toBe(true);
      expect(calls.some((call) => call.status === 'aborted')).toBe(false);
    });
  });
});
