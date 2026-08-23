import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// standalone HTML entries for vanilla and canc variants
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: ['vanilla.html', 'canc.html'],
    },
  },
});
