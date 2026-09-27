import { defineConfig } from 'vite';

// Two standalone HTML entries, vanilla.html and canc.html, each loading its own main-*.ts.
// No framework plugin: the table is built through plain DOM calls, not a component tree.
export default defineConfig({
  build: {
    rollupOptions: {
      input: ['vanilla.html', 'canc.html'],
    },
  },
});
