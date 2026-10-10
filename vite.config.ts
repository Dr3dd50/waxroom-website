import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 600 },
  // Bundle the animation libraries into the prerender build so Node can load it.
  ssr: { noExternal: ['gsap', '@gsap/react', 'lenis'] },
})
