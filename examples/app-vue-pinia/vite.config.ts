import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// One vite config, two modes. `--mode vanilla` builds vanilla.html, `--mode canc` builds
// canc.html; both entries import the same shared step components and router, which resolve
// `@/stores/checkout` to the matching flavor's store file below.
export default defineConfig(({ mode }) => ({
 plugins: [vue()],
 resolve: {
 alias: {
 '@/stores/checkout': fileURLToPath(
 new URL(mode === 'canc' ? './src/stores/checkout-canc.ts' : './src/stores/checkout-vanilla.ts', import.meta.url)
 ),
 '@': fileURLToPath(new URL('./src', import.meta.url)),
 },
 },
 build: {
 rollupOptions: {
 input: mode === 'canc' ? 'canc.html' : 'vanilla.html',
 },
 },
 preview: {
 open: mode === 'canc' ? '/canc.html' : '/vanilla.html',
 },
}));
