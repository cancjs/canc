import { createApi, createHttp } from './api';
import { mountSearchPage } from './search-page';

const api = createApi(createHttp('/api'));
mountSearchPage(document.getElementById('app')!, api);
