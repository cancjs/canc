// Suffix-free shared module: the cancelable chain factories both SFC flavors' canc side builds on,
// plus the re-exported catalog types. Kept out of the SFCs so the templates stay about the UI and
// the twin diff stays about the watch/effect mechanics, not about how a request is wrapped.

import { CancelablePromise } from '@cancjs/promise';
import type { Category, MarketplaceApi, Product } from './mock/api';

export type { Category, Product } from './mock/api';
export { CATEGORIES } from './mock/api';

/**
 * A cancelable catalog listing. `handleCancel` wires the abort so `cancel()` reaches the fake
 * network: a superseded listing shows up as an `aborted` marker in `api.calls`.
 */
export function loadCatalog(api: MarketplaceApi, category: Category): CancelablePromise<Product[]> {
 return new CancelablePromise<Product[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 api.listProducts(category, controller.signal).then(resolve, reject);
 });
}

/**
 * A cancelable image prefetch for one product. Same abort wiring as the listing, so an abandoned
 * prefetch (the card unmounted, or its category was filtered out) aborts at the network boundary.
 */
export function prefetchImage(api: MarketplaceApi, id: string): CancelablePromise<string> {
 return new CancelablePromise<string>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 api.productImage(id, controller.signal).then(resolve, reject);
 });
}
