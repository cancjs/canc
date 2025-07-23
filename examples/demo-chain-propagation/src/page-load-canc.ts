import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle, Product } from '@shared/mock-api';
import { report } from './report';

/**
 * Product profile fetch with CancelablePromise: the source can be canceled by any consumer,
 * and cancellation propagates both down (to the API calls) and up (to the source).
 * Two-way propagation teaches: (1) DOWN — cancel source → all consumers reject CancelError,
 * try/catch per consumer works; (2) UP/bubble — cancel BOTH consumers → source auto-cancels
 * (consumer counting; traces when it happens).
 */
export function loadProductProfile(
 mockApi: MockApiBundle,
 productId: string,
 options?: { bubble?: boolean; shield?: boolean }
): CancelablePromise<{
 product: Product;
 image: string;
 reviews: string[];
}> {
 return new CancelablePromise(async (resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());

 try {
 report('fetching product');
 const product = await mockApi.products.get(productId, controller.signal);

 report('starting image + reviews fetch');
 // Image leg: can be isolated with bubble:false.
 const imagePromise = new CancelablePromise<string>(async (res, rej, hc) => {
 hc(() => controller.abort());
 try {
 await mockApi.music.albums(controller.signal);
 res('image-url');
 } catch (err) {
 rej(err);
 }
 }, { bubble: options?.bubble });

 // Reviews leg: main consumer.
 const reviewsPromise = new CancelablePromise<string[]>(async (res, rej, hc) => {
 hc(() => controller.abort());
 try {
 const data = await mockApi.music.albums(controller.signal);
 res(data.map(x => x.title));
 } catch (err) {
 rej(err);
 }
 });

 // Audit log: shielded from cancellation but still sees upstream rejection.
 const auditPromise = new CancelablePromise<void>(async (res, rej, hc) => {
 hc(() => controller.abort());
 try {
 await mockApi.invoices.get('audit-1', controller.signal);
 res();
 } catch (err) {
 rej(err);
 }
 }, { shield: options?.shield });

 report('awaiting all');
 const [image, reviews] = await Promise.all([imagePromise, reviewsPromise]);
 await auditPromise;

 report('returning results');
 resolve({ product, image, reviews });
 } catch (err) {
 // canceled here — nothing below runs
 reject(err);
 }
 });
}
