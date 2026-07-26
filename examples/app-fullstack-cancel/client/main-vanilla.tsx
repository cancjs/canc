import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SearchPage } from './SearchPage-vanilla';
import { searchApi } from './api-vanilla';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SearchPage api={searchApi} />
  </StrictMode>,
);
