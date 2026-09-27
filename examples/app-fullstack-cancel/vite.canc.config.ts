import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// canc client: proxies /api to the express server so cancel flows over a socket.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    open: '/canc.html',
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: { rollupOptions: { input: 'canc.html' } },
});
