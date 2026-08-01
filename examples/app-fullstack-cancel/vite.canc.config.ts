import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// canc client: serves canc.html, which loads client/main-canc.tsx. Proxies /api to the express
// server (npm run start:canc) so the browser and API share an origin and cancel flows over a socket.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    open: '/canc.html',
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: { rollupOptions: { input: 'canc.html' } },
});
