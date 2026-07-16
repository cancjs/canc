import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createCheckoutRouter } from './router';
import { CHECKOUT_STORE_KEY } from './store-key';
import { useCheckoutStore } from './stores/checkout-vanilla';

createApp(App)
 .use(createPinia())
 .use(createCheckoutRouter(useCheckoutStore))
 .provide(CHECKOUT_STORE_KEY, useCheckoutStore)
 .mount('#app');
