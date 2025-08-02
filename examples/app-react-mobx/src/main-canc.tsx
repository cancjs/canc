import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Watchlist } from './Watchlist-canc';

createRoot(document.getElementById('root')!).render(
 <StrictMode>
 <Watchlist />
 </StrictMode>
);
