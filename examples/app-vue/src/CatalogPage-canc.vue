<script setup lang="ts">
import { ref } from 'vue';
import { useCancelableWatch } from './lib/use-cancelable-watch';
import { loadCatalog, CATEGORIES, type Category, type Product } from './catalog';
import type { MarketplaceApi } from './mock/api';
import ProductCard from './ProductCard-canc.vue';

const props = defineProps<{ api: MarketplaceApi }>();

const category = ref<Category>('all');
const products = ref<Product[]>([]);
const loading = ref(false);

// Each filter change reloads the catalog. useCancelableWatch cancels the previous load if it is
// still in flight, so a slow earlier response can never overwrite the list for the current filter.
useCancelableWatch(
 category,
 (next) => {
 loading.value = true;
 // Return the chained promise so the watch owns it: a superseded run is canceled, and its
 // CancelError is swallowed by the composable instead of surfacing as an unhandled rejection.
 return loadCatalog(props.api, next).then((list) => {
 products.value = list;
 loading.value = false;
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
