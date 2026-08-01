import '@shared/unhandled-rejection-browser';

import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import { createCheckoutRouter } from './router';
import { CHECKOUT_STORE_KEY } from './store-key';
import { useCheckoutStore } from './stores/checkout-canc';

createApp(App)
  .use(createPinia())
  .use(createCheckoutRouter(useCheckoutStore))
  .provide(CHECKOUT_STORE_KEY, useCheckoutStore)
  .mount('#app');
