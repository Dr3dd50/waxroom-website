import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The staff dashboard (staff.waxroomrichmond.com): its own static site,
// built from this folder with the root project's dependencies.
//   npx vite --config dashboard/vite.config.ts          # dev
//   npx vite build --config dashboard/vite.config.ts    # → dist-dashboard/
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative asset paths, so the build runs from any folder or host.
  base: './',
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../dist-dashboard', import.meta.url)), emptyOutDir: true },
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { port: 4174, proxy: { '/api': 'http://127.0.0.1:8787' } },
});
