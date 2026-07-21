<script lang="ts">
import { defineComponent } from 'vue';
import { cancAwait } from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';

import { cancelableSetup } from './lib/cancelable-setup';
import { loadProductDetail, type ProductDetail } from './mock/catalog-api';

// Cancelify the API boundary once, so the setup body awaits a canc-native call with no signal in
// sight. getSignal() is called only when the load actually starts; canceling the run aborts it.
const loadDetail = cancelify(({ getSignal }, [id]: [string]) => loadProductDetail(id, getSignal()));

// The setup option is a generator wrapped by cancelableSetup, so the awaited load runs as one
// cancelable coroutine tied to this component's scope. Switching products under <Suspense> tears
// down this scope before the load settles, which cancels the coroutine and aborts the request.
export default defineComponent({
 props: { id: { type: String, required: true } },
 setup: cancelableSetup(function* setup(props: { id: string }) {
 const detail: ProductDetail = yield* cancAwait(loadDetail(props.id));
 return { detail };
 }),
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
