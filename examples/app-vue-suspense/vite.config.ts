import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// standalone HTML entries for vanilla and canc variants
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: ['vanilla.html', 'canc.html'],
    },
  },
});
