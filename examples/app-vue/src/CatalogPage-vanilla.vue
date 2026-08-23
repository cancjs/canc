<script setup lang="ts">
import { onWatcherCleanup, ref, watch } from 'vue';

import { CATEGORIES, type Category, type Product } from './catalog';
import type { MarketplaceApi } from './mock/api';
import ProductCard from './ProductCard-vanilla.vue';

const props = defineProps<{ api: MarketplaceApi }>();

const category = ref<Category>('all');
const products = ref<Product[]>([]);
const loading = ref(false);

// filter change reloads catalog; requires manual AbortController and stale flag
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
        // the aborted request rejects here: swallow it by hand, or it is an unhandled rejection.
        if (error?.name !== 'AbortError') throw error;
      });
    // cleanup runs before next callback and on unmount; aborts request and marks stale
    onWatcherCleanup(() => {
      stale = true;
      controller.abort();
    });
  },
  { immediate: true },
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
    <p
      v-if="loading"
      class="muted"
    >
      loading catalog…
    </p>
    <ul class="catalog">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :api="api"
        :product="product"
      />
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
