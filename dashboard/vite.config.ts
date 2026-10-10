import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The staff dashboard (employee.waxroomrichmond.com): its own static site,
// built from this folder with the root project's dependencies.
//   npx vite --config dashboard/vite.config.ts          # dev
//   npx vite build --config dashboard/vite.config.ts    # → dist-dashboard/
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  // Relative asset paths, so the build runs from any folder or host.
  base: './',
  plugins: [react()],
  build: { outDir: new URL('../dist-dashboard', import.meta.url).pathname, emptyOutDir: true },
  server: { port: 5174 },
  preview: { port: 4174 },
});
