<script lang="ts">
import { defineComponent } from 'vue';

import { loadProductDetail, type ProductDetail } from './mock/catalog-api';

// (no cancellation counterpart — see -canc) A plain async setup drives <Suspense> the same way, but
// there is no scope hook on the bare await: switching products tears this scope down before the load
// settles, and the request keeps running to completion in the background (a completed marker with no
// aborted marker in the call log).
export default defineComponent({
 props: { id: { type: String, required: true } },
 async setup(props: { id: string }) {
 const detail: ProductDetail = await loadProductDetail(props.id);
 return { detail };
 },
});
</script>

<template>
 <div :data-testid="`detail-${detail.id}`" style="padding: 0.75rem; border: 1px solid #eee; border-radius: 4px">
 <strong>{{ detail.name }}</strong>
 <div style="color: #555; font-size: 0.9rem; margin-top: 0.4rem">
 {{ detail.description }} — ${{ detail.price }}
 </div>
 </div>
</template>
