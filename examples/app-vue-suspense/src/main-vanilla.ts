import '@shared/unhandled-rejection-browser';
import { createApp, h } from 'vue';

import App from './App.vue';
import ProductDetail from './ProductDetail-vanilla.vue';

createApp({
 render: () => h(App, { detailComponent: ProductDetail, title: 'Product detail (vanilla)' }),
}).mount('#app');
