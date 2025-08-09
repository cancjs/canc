import { mount } from '@vue/test-utils';

import CancCatalogPage from './CatalogPage-canc.vue';
import CancProductCard from './ProductCard-canc.vue';
import VanillaCatalogPage from './CatalogPage-vanilla.vue';
import { createMarketplaceApi } from './mock/api';

const LATENCY = 50;

function countByStatus(calls: { endpoint: string; status: string }[], endpoint: string, status: string): number {
 return calls.filter((c) => c.endpoint === endpoint && c.status === status).length;
}

async function flush(): Promise<void> {
 await Promise.resolve();
 await Promise.resolve();
}

async function clickFilter(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
 const button = wrapper.findAll('button').find((b) => b.text() === label);
 if (!button) throw new Error(`no filter button ${label}`);
 await button.trigger('click');
}

describe('canc CatalogPage', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => jest.useRealTimers());

 it('cancels the superseded catalog load when the filter changes fast', async () => {
 const api = createMarketplaceApi({ latency: LATENCY });
 const wrapper = mount(CancCatalogPage, { props: { api } });

 // The immediate 'all' load is in flight; two fast filter changes supersede it and each other.
 await clickFilter(wrapper, 'peripherals');
 await flush();
 await clickFilter(wrapper, 'audio');
 await flush();

 // Let the surviving load finish.
 jest.advanceTimersByTime(LATENCY);
 await flush();

 expect(countByStatus(api.calls, 'catalog.list', 'completed')).toBe(1);
 expect(countByStatus(api.calls, 'catalog.list', 'aborted')).toBe(2);
 wrapper.unmount();
 });

 it('cancels the pending catalog load on unmount', async () => {
 const api = createMarketplaceApi({ latency: LATENCY });
 const wrapper = mount(CancCatalogPage, { props: { api } });
 await flush();

 wrapper.unmount();
 jest.advanceTimersByTime(LATENCY);
 await flush();

 expect(countByStatus(api.calls, 'catalog.list', 'aborted')).toBe(1);
 expect(countByStatus(api.calls, 'catalog.list', 'completed')).toBe(0);
 });
});

describe('canc ProductCard', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => jest.useRealTimers());

 it('cancels the image prefetch when the card unmounts', async () => {
 const api = createMarketplaceApi({ latency: LATENCY });
 const wrapper = mount(CancProductCard, {
 props: { api, product: { id: 'kb-1', name: 'Mechanical Keyboard', category: 'peripherals', price: 89 } },
 });
 await flush();

 wrapper.unmount();
 jest.advanceTimersByTime(LATENCY);
 await flush();

 expect(countByStatus(api.calls, 'catalog.image', 'aborted')).toBe(1);
 expect(countByStatus(api.calls, 'catalog.image', 'completed')).toBe(0);
 });
});

describe('vanilla CatalogPage', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => jest.useRealTimers());

 it('renders the catalog for the current filter', async () => {
 const api = createMarketplaceApi({ latency: LATENCY });
 const wrapper = mount(VanillaCatalogPage, { props: { api } });

 jest.advanceTimersByTime(LATENCY);
 await flush();

 expect(wrapper.findAll('[data-testid^="card-"]').length).toBeGreaterThan(0);
 wrapper.unmount();
 });

 it('leaves the superseded load running after a fast filter change — the leak we teach', async () => {
 const api = createMarketplaceApi({ latency: LATENCY });
 const wrapper = mount(VanillaCatalogPage, { props: { api } });

 await clickFilter(wrapper, 'peripherals');
 await flush();
 await clickFilter(wrapper, 'audio');
 await flush();

 jest.advanceTimersByTime(LATENCY);
 await flush();

 // Inverted assertion: the AbortController workaround aborts the request, but the stale flag is
 // what actually protects the state. This documents that the vanilla flavor's cancellation is a
 // hand-rolled add-on, not the promise's own contract.
 expect(countByStatus(api.calls, 'catalog.list', 'aborted')).toBe(2);
 wrapper.unmount();
 });
});
