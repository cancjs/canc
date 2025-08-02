import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { SearchPage } from './SearchPage-canc';
import { createFlightApi } from './mock/api';

const api = createFlightApi({ trace: (line) => console.log(line) });

createRoot(document.getElementById('root')!).render(
 <StrictMode>
 <App title="Flight search (canc)">
 <SearchPage api={api} />
 </App>
 </StrictMode>
);
