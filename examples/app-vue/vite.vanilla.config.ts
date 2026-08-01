import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Vanilla entry: serves vanilla.html, which loads src/main-vanilla.ts.
export default defineConfig({
  plugins: [vue()],
  server: { port: 5108, open: '/vanilla.html' },
  build: { rollupOptions: { input: 'vanilla.html' } },
});
