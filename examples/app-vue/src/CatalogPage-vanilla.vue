<script setup lang="ts">
import { ref, watch, onWatcherCleanup } from 'vue';
import { CATEGORIES, type Category, type Product } from './catalog';
import type { MarketplaceApi } from './mock/api';
import ProductCard from './ProductCard-vanilla.vue';

const props = defineProps<{ api: MarketplaceApi }>();

const category = ref<Category>('all');
const products = ref<Product[]>([]);
const loading = ref(false);

// Each filter change reloads the catalog. Without a cancelable chain the previous load must be torn
// down by hand: an AbortController for the request plus a `stale` flag so a slow earlier response
// cannot overwrite the list for the current filter (the awaited-watch footgun this example is about).
watch(
 category,
 (filterCategory) => {
 loading.value = true;
 const controller = new AbortController();
 let stale = false;
 props.api
 .listProducts(filterCategory, controller.signal)
 .then((list) => {
 // stale guard: drop a response for a filter the user has already changed away from.
 if (stale) return;
 products.value = list;
 loading.value = false;
 })
 .catch((error) => {
 // the aborted request rejects here — swallow it by hand, or it is an unhandled rejection.
 if (error?.name !== 'AbortError') throw error;
 });
 // The cleanup runs before the next callback (and on unmount): abort the request and mark it stale.
 onWatcherCleanup(() => {
 stale = true;
 controller.abort();
 });
 },
 { immediate: true }
);
</script>

<template>
 <div>
 <div class="filters">
 <button
 v-for="option in CATEGORIES"
 :key="option"
 :class="{ active: option === category }"
 @click="category = option"
 >
 {{ option }}
 </button>
 </div>
 <p v-if="loading" class="muted">loading catalog…</p>
 <ul class="catalog">
 <ProductCard v-for="product in products" :key="product.id" :api="api" :product="product" />
 </ul>
 </div>
</template>

<style scoped>
.filters {
 display: flex;
 gap: 0.5rem;
 margin-bottom: 0.75rem;
}
.filters button {
 padding: 0.35rem 0.7rem;
 border: 1px solid #ccc;
 border-radius: 4px;
 background: #fff;
 cursor: pointer;
}
.filters button.active {
 background: #222;
 color: #fff;
 border-color: #222;
}
.catalog {
 padding: 0;
 margin: 0;
}
.muted {
 color: #888;
}
</style>
