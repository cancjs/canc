import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Canc entry: serves canc.html, which loads src/main-canc.tsx.
export default defineConfig({
 plugins: [react()],
 server: { port: 5117, open: '/canc.html' },
 build: { rollupOptions: { input: 'canc.html' } },
});
