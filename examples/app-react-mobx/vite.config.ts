import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The canc packages are consumed as built dist via the yarn link, so no source aliasing is needed.
export default defineConfig({
 plugins: [react()],
});
