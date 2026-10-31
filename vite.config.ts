import { defineConfig } from 'vite';
export default defineConfig({
  base: './', server: { port: 5190, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], physics: ['@dimforge/rapier3d-compat'] } } } },
});
