import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Two standalone HTML entries, vanilla.html and canc.html, each loading its own main-*.tsx. No
// build-time flavor switch: `dev:vanilla`/`dev:canc` just open the matching URL on the same dev
// server, and the production build emits both pages.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: ['vanilla.html', 'canc.html'],
    },
  },
});
