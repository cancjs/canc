import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SearchPage } from './SearchPage-canc';
import { searchApi } from './api-canc';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SearchPage api={searchApi} />
  </StrictMode>,
);
