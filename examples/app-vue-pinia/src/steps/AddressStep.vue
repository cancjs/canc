<!-- Dumb, store-driven step. All cancellation policy lives in the store -- this component only
 ever reads state and dispatches actions. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCheckoutStore } from '@/stores/checkout';

const store = useCheckoutStore();
const router = useRouter();
const line1 = ref('221B Baker St');
const city = ref('London');

function validate() {
 store.validateAddress(line1.value, city.value);
}

function next() {
 router.push('/shipping');
}
</script>

<template>
 <section>
 <h2>Address</h2>
 <input data-testid="line1" v-model="line1" />
 <input data-testid="city" v-model="city" />
 <button type="button" data-testid="validate-address" @click="validate">Validate</button>
 <div data-testid="address-status">{{ store.addressStatus }}</div>
 <button type="button" data-testid="next-to-shipping" :disabled="store.addressStatus !== 'done'" @click="next">
 Continue
 </button>
 </section>
</template>
