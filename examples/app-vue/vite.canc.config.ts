import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Canc entry: serves canc.html, which loads src/main-canc.ts.
export default defineConfig({
 plugins: [vue()],
 server: { port: 5109, open: '/canc.html' },
 build: { rollupOptions: { input: 'canc.html' } },
});
