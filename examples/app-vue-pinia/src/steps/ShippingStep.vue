<!-- Dumb, store-driven step. All cancellation policy lives in the store -- this component only
 ever reads state and dispatches actions. -->
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useCheckoutStore } from '@/stores/checkout';

const store = useCheckoutStore();
const router = useRouter();

function quote() {
 store.quoteShipping();
}

function back() {
 router.push('/address');
}

function next() {
 router.push('/review');
}
</script>

<template>
 <section>
 <h2>Shipping</h2>
 <button type="button" data-testid="quote-shipping" @click="quote">Get quote</button>
 <div data-testid="shipping-status">{{ store.shippingStatus }}</div>
 <div data-testid="shipping-carrier">{{ store.shipping?.carrier ?? '' }}</div>
 <button type="button" data-testid="back-to-address" @click="back">Back</button>
 <button type="button" data-testid="next-to-review" :disabled="store.shippingStatus !== 'done'" @click="next">
 Continue
 </button>
 </section>
</template>
