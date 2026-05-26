import '@shared/unhandled-rejection-browser';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createCheckoutRouter } from './router';

createApp(App).use(createPinia()).use(createCheckoutRouter()).mount('#app');
