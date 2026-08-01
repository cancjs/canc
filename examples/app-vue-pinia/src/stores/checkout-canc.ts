// Pinia checkout store, canc. Each step action tracks its own in-flight CancelablePromise;
// goToStep cancels whatever step the user is abandoning before moving on, so a slow validate
// call can never land after the wizard has already moved past it.

import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { defineStore } from 'pinia';

import { confirmReview, fetchShippingRecap, quoteShipping, validateAddress } from '../mock/checkout-api';
import { type CheckoutState, STEP_ORDER, type StepName } from '../types';

// getSignal() is called only when a step's action actually starts, so an uncanceled call wires no
// AbortController at all.
const validateAddressCall = cancelify(({ getSignal }, [line1, city]: [string, string]) =>
  validateAddress(line1, city, getSignal()),
);
const quoteShippingCall = cancelify(({ getSignal }, [addressId]: [string]) => quoteShipping(addressId, getSignal()));

interface CancCheckoutState extends CheckoutState {
  addressLoad: CancelablePromise<void> | null;
  shippingLoad: CancelablePromise<void> | null;
  reviewLoad: CancelablePromise<void> | null;
}

export const useCheckoutStore = defineStore('checkout-canc', {
  state: (): CancCheckoutState => ({
    step: 'address',
    addressStatus: 'idle',
    address: null,
    shippingStatus: 'idle',
    shipping: null,
    reviewStatus: 'idle',
    review: null,
    addressLoad: null,
    shippingLoad: null,
    reviewLoad: null,
  }),

  actions: {
    validateAddress(line1: string, city: string) {
      // canceled here -- a second validate call (or leaving the step) drops the first
      this.addressLoad?.cancel();
      this.addressStatus = 'loading';

      const load = validateAddressCall(line1, city).then((address) => {
        this.address = address;
        this.addressStatus = 'done';
      });
      this.addressLoad = load;
    },

    quoteShipping() {
      if (!this.address) return;
      // canceled here -- re-quoting (or navigating away) drops the outstanding quote
      this.shippingLoad?.cancel();
      this.shippingStatus = 'loading';

      const load = quoteShippingCall(this.address.addressId).then((shipping) => {
        this.shipping = shipping;
        this.shippingStatus = 'done';
      });
      this.shippingLoad = load;
    },

    prepareReview() {
      if (!this.address || !this.shipping) return;
      // canceled here -- the recap+confirm sequence below is one cancelable unit
      this.reviewLoad?.cancel();
      this.reviewStatus = 'loading';
      const addressId = this.address.addressId;
      const shippingId = this.shipping.shippingId;
      const store = this;

      const load = cancAsync(function* () {
        const recap = yield* cancAwait(fetchShippingRecap(shippingId));
        const review = yield* cancAwait(confirmReview(addressId, shippingId, recap.amount));
        store.review = review;
        store.reviewStatus = 'done';
      })();
      this.reviewLoad = load;
    },

    // canceled here -- goToStep drops whatever the abandoned step still had in flight, so a stale
    // validate/quote/review can never overwrite state after the wizard has moved on
    goToStep(next: StepName) {
      const current = this.step;
      if (current === 'address' && next !== 'address') this.addressLoad?.cancel();
      if (current === 'shipping' && next !== 'shipping') this.shippingLoad?.cancel();
      if (current === 'review' && next !== 'review') this.reviewLoad?.cancel();
      this.step = next;
    },

    // rollback-in-cancel-handler: showing the pattern once. If a shipping quote is canceled after
    // an optimistic UI already showed a carrier, handleCancel undoes it -- rollback lives at the
    // cancellation site, not scattered through .then chains.
    quoteShippingOptimistic() {
      if (!this.address) return;
      this.shippingLoad?.cancel();
      this.shippingStatus = 'loading';
      this.shipping = { shippingId: 'pending', addressId: this.address.addressId, carrier: 'estimating...', amount: 0 };

      const load = quoteShippingCall(this.address.addressId).then((shipping) => {
        this.shipping = shipping;
        this.shippingStatus = 'done';
      });
      load.catch((err) => {
        if (!isCancelError(err)) return;
        // rollback: drop the optimistic placeholder so the UI does not show a fake quote
        this.shipping = null;
        this.shippingStatus = 'idle';
      });
      this.shippingLoad = load;
    },

    dispose() {
      // $onAction cleanup on store dispose -- cancel every step still outstanding
      this.addressLoad?.cancel();
      this.shippingLoad?.cancel();
      this.reviewLoad?.cancel();
    },
  },
});

export { STEP_ORDER };
