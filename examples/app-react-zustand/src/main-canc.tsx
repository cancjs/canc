import '@shared/unhandled-rejection-browser';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Library } from './Library-canc';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Library />
  </StrictMode>,
);
