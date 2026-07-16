import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Two standalone HTML entries, vanilla.html and canc.html, each loading its own main-*.ts. No
// build-time flavor switch: `dev:vanilla`/`dev:canc` just open the matching URL on the same dev
// server, and the production build emits both pages.
export default defineConfig({
 plugins: [vue()],
 build: {
 rollupOptions: {
 input: ['vanilla.html', 'canc.html'],
 },
 },
});
