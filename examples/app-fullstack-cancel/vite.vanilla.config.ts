import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// vanilla client: proxies /api to the express server
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    open: '/vanilla.html',
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: { rollupOptions: { input: 'vanilla.html' } },
});
