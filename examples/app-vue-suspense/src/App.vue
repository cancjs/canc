<script setup lang="ts">
import { type Component, ref } from 'vue';

import { PRODUCT_IDS } from './mock/catalog-api';

// The flavored ProductDetail component is injected by the entry (main-canc.ts / main-vanilla.ts),
// so this shell carries no cancellation logic and no flavor split. Selecting a product remounts the
// detail component under <Suspense> with a fresh key, tearing down the previous one mid-load.
defineProps<{ detailComponent: Component; title: string }>();

const selected = ref<string | null>(null);
</script>

<template>
 <main style="font-family: system-ui, sans-serif; max-width: 560px; margin: 2rem auto; padding: 0 1rem">
 <h1 style="font-size: 1.25rem">{{ title }}</h1>
 <p style="color: #555; font-size: 0.9rem">
 Open a product to load its details under Suspense, then open another before it finishes. Open
 the console to watch the mock API log which detail requests get aborted.
 </p>

 <ul style="padding: 0; margin: 0 0 1rem; list-style: none; display: flex; gap: 0.5rem; flex-wrap: wrap">
 <li v-for="id in PRODUCT_IDS" :key="id">
 <button
 :data-testid="`open-${id}`"
 @click="selected = id"
 :style="{
 padding: '0.4rem 0.7rem',
 border: '1px solid #ccc',
 borderRadius: '4px',
 background: selected === id ? '#e8f0fe' : '#fff',
 cursor: 'pointer',
 }"
 >
 {{ id }}
 </button>
 </li>
 </ul>

 <Suspense v-if="selected">
 <component :is="detailComponent" :key="selected" :id="selected" />
 <template #fallback>
 <p style="color: #aaa">loading details…</p>
 </template>
 </Suspense>
 </main>
</template>
