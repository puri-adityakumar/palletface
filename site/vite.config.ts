import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Render with the library source in this repo, so every style on main shows up.
    alias: { palletface: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] } },
  build: { rollupOptions: { input: 'index.html' } },
})
