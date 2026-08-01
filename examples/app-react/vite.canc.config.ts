import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Canc entry: serves canc.html, which loads src/main-canc.tsx.
export default defineConfig({
  plugins: [react()],
  server: { port: 5107, open: '/canc.html' },
  build: { rollupOptions: { input: 'canc.html' } },
});
