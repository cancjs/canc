import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vanilla entry: serves vanilla.html, which loads src/main-vanilla.tsx.
export default defineConfig({
 plugins: [react()],
 server: { port: 5106, open: '/vanilla.html' },
 build: { rollupOptions: { input: 'vanilla.html' } },
});
