import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vanilla entry: serves vanilla.html, which loads src/main-vanilla.tsx.
export default defineConfig({
  plugins: [react()],
  server: { port: 5118, open: '/vanilla.html' },
  build: { rollupOptions: { input: 'vanilla.html' } },
});
