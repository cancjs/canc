import { createApp, h } from 'vue';

import App from './App.vue';
import CatalogPage from './CatalogPage-vanilla.vue';
import { createMarketplaceApi } from './mock/api';

const api = createMarketplaceApi({ trace: (line) => console.log(line) });

createApp({
 render: () => h(App, { title: 'Marketplace browser (vanilla)' }, () => h(CatalogPage, { api })),
}).mount('#app');
