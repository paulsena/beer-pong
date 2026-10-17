import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true, host: true },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  build: { target: 'es2022' },
});
