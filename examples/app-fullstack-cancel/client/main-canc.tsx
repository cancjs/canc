import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { searchApi } from './api-canc';
import { SearchPage } from './SearchPage-canc';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SearchPage api={searchApi} />
  </StrictMode>,
);
