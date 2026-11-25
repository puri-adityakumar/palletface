import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { docsEntries, docsMarkdown } from './docs/markdown.ts'

export default defineConfig({
  plugins: [react(), docsMarkdown()],
  resolve: {
    // Render with the library source in this repo, so every style on main shows up.
    alias: { palletface: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] } },
  // prototype.html is served by `npm run dev` for design reference.
  build: { rollupOptions: { input: ['index.html', ...docsEntries] } },
})
