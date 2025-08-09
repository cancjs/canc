<!-- Dumb, store-driven step. All cancellation policy lives in the store -- this component only
 ever reads state and dispatches actions. -->
<script setup lang="ts">
import { useCheckoutStore } from '@/stores/checkout';

const store = useCheckoutStore();

function prepare() {
 store.prepareReview();
}
</script>

<template>
 <section>
 <h2>Review</h2>
 <button type="button" data-testid="prepare-review" @click="prepare">Prepare review</button>
 <div data-testid="review-status">{{ store.reviewStatus }}</div>
 <div data-testid="review-total">{{ store.review?.total ?? '' }}</div>
 </section>
</template>
