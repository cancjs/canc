<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { MarketplaceApi, Product } from './mock/api';

const props = defineProps<{ api: MarketplaceApi; product: Product }>();

// Prefetch this card's image with a plain promise. There is no cancelable chain to hand back, and
// no cleanup can stop the request: once onMounted starts it, filtering this product out (which
// unmounts the card) cannot abort it.
const image = ref<string>();
const pending = ref(true);

onMounted(() => {
 props.api
 .productImage(props.product.id)
 .then((url) => {
 // state update for a card that may already be unmounted — the request completed anyway.
 image.value = url;
 pending.value = false;
 })
 .catch(() => {
 pending.value = false;
 });
 // (no cancellation counterpart — the prefetch keeps running after the card unmounts)
});
</script>

<template>
 <li class="card" :data-testid="`card-${product.id}`">
 <div class="thumb">
 <span v-if="pending" class="muted">loading image…</span>
 <img v-else-if="image" :src="image" :alt="product.name" />
 </div>
 <div class="meta">
 <strong>{{ product.name }}</strong>
 <span class="muted">${{ product.price }}</span>
 </div>
 </li>
</template>

<style scoped>
.card {
 display: flex;
 gap: 0.75rem;
 align-items: center;
 padding: 0.5rem 0;
 border-bottom: 1px solid #eee;
 list-style: none;
}
.thumb {
 width: 64px;
 height: 48px;
 display: flex;
 align-items: center;
 justify-content: center;
 background: #f4f4f4;
 border-radius: 4px;
 overflow: hidden;
 font-size: 0.7rem;
}
.thumb img {
 width: 100%;
 height: 100%;
 object-fit: cover;
}
.meta {
 display: flex;
 flex-direction: column;
}
.muted {
 color: #888;
}
</style>
