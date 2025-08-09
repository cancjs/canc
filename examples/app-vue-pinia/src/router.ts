// Shared router: three step routes, one beforeEach that maps the URL to the store's step. The
// store import comes through the `@/stores/checkout` alias, which vite.config.ts points at
// checkout-vanilla.ts or checkout-canc.ts depending on --mode, so this file needs no flavor split.

import { createRouter, createMemoryHistory, createWebHistory, type Router } from 'vue-router';
import { useCheckoutStore } from '@/stores/checkout';
import type { StepName } from './types';

const routes = [
 { path: '/', redirect: '/address' },
 { path: '/address', name: 'address' as StepName, component: () => import('./steps/AddressStep.vue') },
 { path: '/shipping', name: 'shipping' as StepName, component: () => import('./steps/ShippingStep.vue') },
 { path: '/review', name: 'review' as StepName, component: () => import('./steps/ReviewStep.vue') },
];

export function createCheckoutRouter(memory = false): Router {
 const router = createRouter({
 history: memory ? createMemoryHistory() : createWebHistory(),
 routes,
 });

 router.beforeEach((to) => {
 const store = useCheckoutStore();
 const step = to.name as StepName | undefined;
 if (step) store.goToStep(step);
 });

 return router;
}
