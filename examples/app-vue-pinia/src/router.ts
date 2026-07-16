// Shared router: three step routes, one beforeEach that maps the URL to the store's step. The
// flavored store is passed in by the caller (see main-vanilla.ts / main-canc.ts), so this file
// needs no flavor split.

import { createRouter, createMemoryHistory, createWebHistory, type Router } from 'vue-router';
import type { UseCheckoutStore } from './store-key';
import type { StepName } from './types';

const routes = [
 { path: '/', redirect: '/address' },
 { path: '/address', name: 'address' as StepName, component: () => import('./steps/AddressStep.vue') },
 { path: '/shipping', name: 'shipping' as StepName, component: () => import('./steps/ShippingStep.vue') },
 { path: '/review', name: 'review' as StepName, component: () => import('./steps/ReviewStep.vue') },
];

export function createCheckoutRouter(useCheckoutStore: UseCheckoutStore, memory = false): Router {
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
