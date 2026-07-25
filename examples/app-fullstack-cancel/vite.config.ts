import { defineConfig } from 'vite';

// Client dev server. Proxies /api to the express server (npm run dev:server) so the browser and
// the API share an origin and cancellation flows over a real socket.
export default defineConfig({
  root: '.',
  server: {
    port: 5180,
    open: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
