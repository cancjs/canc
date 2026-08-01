import type { MockApiBundle, Product } from '@shared/mock-api';

import { report } from './report';

// Sliced from the bundle type only for typing (no bundle value ever crosses a function
// boundary here). Each function takes just the domain apis it calls.
type ProductsApi = MockApiBundle['products'];
type MusicApi = MockApiBundle['music'];
type InvoicesApi = MockApiBundle['invoices'];

/**
 * Product profile fetch: single source fanning out to two consumers (image + reviews).
 * Vanilla: plain promises, no cancellation. If the caller abandons the page, both
 * downstream requests stay in flight (wasted work).
 */
export async function loadProductProfile(
  productsApi: ProductsApi,
  musicApi: MusicApi,
  invoicesApi: InvoicesApi,
  productId: string,
): Promise<{
  product: Product;
  image: string;
  reviews: string[];
}> {
  report('fetching product');
  // keeps running, nobody can stop this from the consumer side
  const product = await productsApi.get(productId);

  report('starting image + reviews fetch');
  // Both consumers start: image and reviews.
  // If the consumer cancels now, neither request stops.
  const imagePromise = musicApi.albums().then(() => 'image-url');
  const reviewsPromise = musicApi.albums().then((albums) => albums.map((x) => x.title));

  const [image, reviews] = await Promise.all([imagePromise, reviewsPromise]);

  report('writing audit log');
  // Audit log hangs off the reviews consumer. If reviews is canceled, audit still runs.
  // orphaned result: computed, delivered to no one
  await invoicesApi.get('audit-1');

  report('returning results');
  return { product, image, reviews };
}
