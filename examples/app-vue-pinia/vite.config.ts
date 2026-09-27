import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Two standalone HTML entries, vanilla.html and canc.html, each loading its own main-*.ts.
// The production build emits both pages.
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: ['vanilla.html', 'canc.html'],
    },
  },
});
