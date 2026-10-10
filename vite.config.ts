import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The two local sites (GlossGenius and native booking) run side by side; a cache each
  // stops one from invalidating the other's pre-bundled dependencies.
  cacheDir: process.env.VITE_BOOKING === 'native' ? 'node_modules/.vite-native' : 'node_modules/.vite',
  build: { chunkSizeWarningLimit: 600 },
  // Locally the booking API runs on :8787 (npm run api); on AWS it's the same domain.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  // Bundle the animation libraries into the prerender build so Node can load it.
  ssr: { noExternal: ['gsap', '@gsap/react', 'lenis'] },
})
