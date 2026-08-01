import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { searchApi } from './api-vanilla';
import { SearchPage } from './SearchPage-vanilla';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SearchPage api={searchApi} />
  </StrictMode>,
);
