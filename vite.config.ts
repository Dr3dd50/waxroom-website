import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 600 },
  // Locally the booking API runs on :8787 (npm run api); on AWS it's the same domain.
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
  // Bundle the animation libraries into the prerender build so Node can load it.
  ssr: { noExternal: ['gsap', '@gsap/react', 'lenis'] },
})
