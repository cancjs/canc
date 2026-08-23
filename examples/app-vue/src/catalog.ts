// shared cancelable chain factories and catalog types for SFC flavors

import { cancelify } from '@cancjs/toolbox';

import type { Category, MarketplaceApi } from './mock/api';

export type { Category, Product } from './mock/api';
export { CATEGORIES } from './mock/api';

/**
 * A cancelable catalog listing. `cancelify` wires the abort so `cancel()` reaches the fake network:
 * a superseded listing shows up as an `aborted` marker in `api.calls`.
 */
export const loadCatalog = cancelify(({ getSignal }, api: MarketplaceApi, category: Category) =>
  api.listProducts(category, getSignal()),
);

/**
 * A cancelable image prefetch for one product. Same abort wiring as the listing, so an abandoned
 * prefetch (the card unmounted, or its category was filtered out) aborts at the network boundary.
 */
export const prefetchImage = cancelify(({ getSignal }, api: MarketplaceApi, id: string) =>
  api.productImage(id, getSignal()),
);
