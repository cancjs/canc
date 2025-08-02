import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One vite config, two modes. `--mode vanilla` builds vanilla.html, `--mode canc` builds
// canc.html; each is a standalone entry importing only its own flavor's modules.
export default defineConfig(({ mode }) => ({
 plugins: [react()],
 build: {
 rollupOptions: {
 input: mode === 'canc' ? 'canc.html' : 'vanilla.html',
 },
 },
 preview: {
 open: mode === 'canc' ? '/canc.html' : '/vanilla.html',
 },
}));
