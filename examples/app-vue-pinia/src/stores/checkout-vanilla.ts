// Pinia checkout store, plain promises. A step's call cannot be interrupted, so every action
// stamps a request-id and every .then checks it is still current before writing state -- the
// standard workaround for a wizard where the user can navigate away mid-request.

import { defineStore } from 'pinia';

import { confirmReview, fetchShippingRecap, quoteShipping, validateAddress } from '../mock/checkout-api';
import { type CheckoutState, STEP_ORDER, type StepName } from '../types';

interface VanillaCheckoutState extends CheckoutState {
  addressReqId: number;
  shippingReqId: number;
  reviewReqId: number;
}

export const useCheckoutStore = defineStore('checkout-vanilla', {
  state: (): VanillaCheckoutState => ({
    step: 'address',
    addressStatus: 'idle',
    address: null,
    shippingStatus: 'idle',
    shipping: null,
    reviewStatus: 'idle',
    review: null,
    addressReqId: 0,
    shippingReqId: 0,
    reviewReqId: 0,
  }),

  actions: {
    validateAddress(line1: string, city: string) {
      // stale guard #1 -- a second validate call (or leaving the step) just bumps the id; the
      // first request still completes on the wire, only its state write is skipped
      const id = ++this.addressReqId;
      this.addressStatus = 'loading';

      validateAddress(line1, city).then((address) => {
        if (id !== this.addressReqId) return;
        this.address = address;
        this.addressStatus = 'done';
      });
    },

    quoteShipping() {
      if (!this.address) return;
      // stale guard #2 -- re-quoting (or navigating away) just bumps the id
      const id = ++this.shippingReqId;
      this.shippingStatus = 'loading';

      quoteShipping(this.address.addressId).then((shipping) => {
        if (id !== this.shippingReqId) return;
        this.shipping = shipping;
        this.shippingStatus = 'done';
      });
    },

    async prepareReview() {
      if (!this.address || !this.shipping) return;
      // stale guard #3 -- the recap+confirm sequence below cannot be interrupted partway
      const id = ++this.reviewReqId;
      this.reviewStatus = 'loading';
      const addressId = this.address.addressId;
      const shippingId = this.shipping.shippingId;

      const recap = await fetchShippingRecap(shippingId);
      if (id !== this.reviewReqId) return;
      const review = await confirmReview(addressId, shippingId, recap.amount);
      if (id !== this.reviewReqId) return;
      this.review = review;
      this.reviewStatus = 'done';
    },

    // stale guard #4 -- goToStep cannot stop whatever the abandoned step still had in flight; it
    // just bumps the relevant request id so the eventual response is silently discarded
    goToStep(next: StepName) {
      const current = this.step;
      if (current === 'address' && next !== 'address') this.addressReqId++;
      if (current === 'shipping' && next !== 'shipping') this.shippingReqId++;
      if (current === 'review' && next !== 'review') this.reviewReqId++;
      this.step = next;
    },

    // no rollback-in-cancel-handler counterpart -- plain promises have no cancel hook to rollback
    // from, so an optimistic placeholder can only be corrected after the real response lands
    quoteShippingOptimistic() {
      if (!this.address) return;
      const id = ++this.shippingReqId;
      this.shippingStatus = 'loading';
      this.shipping = { shippingId: 'pending', addressId: this.address.addressId, carrier: 'estimating...', amount: 0 };

      quoteShipping(this.address.addressId).then((shipping) => {
        if (id !== this.shippingReqId) return;
        this.shipping = shipping;
        this.shippingStatus = 'done';
      });
    },

    dispose() {
      // no $onAction cleanup counterpart -- bumping the ids only silences future writes, it does
      // not stop anything already in flight
      this.addressReqId++;
      this.shippingReqId++;
      this.reviewReqId++;
    },
  },
});

export { STEP_ORDER };
