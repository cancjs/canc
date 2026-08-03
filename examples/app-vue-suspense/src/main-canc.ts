import '@cancjs/unhandled-rejection/register';

import { createApp, h } from 'vue';

import App from './App.vue';
import ProductDetail from './ProductDetail-canc.vue';

createApp({
  render: () => h(App, { detailComponent: ProductDetail, title: 'Product detail (canc)' }),
}).mount('#app');
