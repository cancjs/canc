import type { MockApiBundle, Product } from '@shared/mock-api';
import { report } from './report';

/**
 * Product profile fetch: single source fanning out to two consumers (image + reviews).
 * Vanilla: plain promises, no cancellation. If the caller abandons the page, both
 * downstream requests stay in flight — wasted work.
 */
export async function loadProductProfile(mockApi: MockApiBundle, productId: string): Promise<{
 product: Product;
 image: string;
 reviews: string[];
}> {
 report('fetching product');
 // keeps running — nobody can stop this from the consumer side
 const product = await mockApi.products.get(productId);

 report('starting image + reviews fetch');
 // Both consumers start: image and reviews.
 // If the consumer cancels now, neither request stops.
 const imagePromise = mockApi.music.albums().then(() => 'image-url');
 const reviewsPromise = mockApi.music.albums().then(albums => albums.map(x => x.title));

 const [image, reviews] = await Promise.all([imagePromise, reviewsPromise]);

 report('writing audit log');
 // Audit log hangs off the reviews consumer. If reviews is canceled, audit still runs.
 // orphaned result: computed, delivered to no one
 await mockApi.invoices.get('audit-1');

 report('returning results');
 return { product, image, reviews };
}
