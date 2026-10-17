import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets PAGES_BASE.
  base: process.env.PAGES_BASE ?? '/',
  server: { port: 5173, strictPort: true, host: true },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  build: { target: 'es2022' },
});
