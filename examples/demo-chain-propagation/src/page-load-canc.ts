import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import type { MockApiBundle, Product } from '@shared/mock-api';

import { report } from './report';

// Sliced from the bundle type only for typing (no bundle value ever crosses a function
// boundary here). Each function takes just the domain apis it calls.
type ProductsApi = MockApiBundle['products'];
type MusicApi = MockApiBundle['music'];
type InvoicesApi = MockApiBundle['invoices'];

/**
 * Product profile fetch with CancelablePromise: the source can be canceled by any consumer,
 * and cancellation propagates both down (to the API calls) and up (to the source).
 * Two-way propagation teaches: (1) DOWN. cancel source, all consumers reject CancelError,
 * try/catch per consumer works. (2) UP/bubble. cancel BOTH consumers, source auto-cancels
 * (consumer counting, traces when it happens).
 */
export function loadProductProfile(
  productsApi: ProductsApi,
  musicApi: MusicApi,
  invoicesApi: InvoicesApi,
  productId: string,
  options?: { bubble?: boolean; shield?: boolean },
): CancelablePromise<{
  product: Product;
  image: string;
  reviews: string[];
}> {
  const loadProduct = cancelify(({ getSignal }, [id]: [string]) => productsApi.get(id, getSignal()));

  // Image leg: can be isolated with bubble:false. Omit the key entirely when unset so the
  // CancelablePromise default (bubble:true) applies; passing bubble:undefined would force false.
  const loadImage = cancelify(
    (getSignal) => musicApi.albums(getSignal()).then(() => 'image-url'),
    options?.bubble === false ? { bubble: false } : undefined,
  );

  // Reviews leg: main consumer.
  const loadReviews = cancelify(({ getSignal }) =>
    musicApi.albums(getSignal()).then((data) => data.map((x) => x.title)),
  );

  // Audit log: shielded from cancellation but still sees upstream rejection.
  const loadAuditLog = cancelify((getSignal) => invoicesApi.get('audit-1', getSignal()), { shield: options?.shield });

  return new CancelablePromise(async (resolve, reject, { handleCancel }) => {
    try {
      report('fetching product');
      const productPromise = loadProduct(productId);

      report('starting image + reviews fetch');
      const imagePromise = loadImage();
      const reviewsPromise = loadReviews();
      const legsPromise = CancelablePromise.all([imagePromise, reviewsPromise]);

      // Canceling the source cancels the product fetch and each non-isolated leg directly. No
      // AbortController: every leg is already its own cancelable node, so canceling it aborts its
      // own mock call. A bubble:false leg is isolated from the source in both directions, so it is
      // skipped here too.
      handleCancel(() => {
        productPromise.cancel();
        if (imagePromise.bubble) imagePromise.cancel();
        reviewsPromise.cancel();
      });

      const product = await productPromise;

      report('awaiting all');
      const [image, reviews] = await legsPromise;

      const auditPromise = loadAuditLog();
      await auditPromise;

      report('returning results');
      resolve({ product, image, reviews });
    } catch (err) {
      // canceled here, nothing below runs
      reject(err);
    }
  });
}
