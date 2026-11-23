import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

/**
 * Build-time numbers, never hand-typed (audit fix #10):
 * version from the library package, iife + gzip sizes from the actual bundle,
 * GitHub stars via the authenticated gh CLI (null when unavailable — the
 * Chrome pill falls back to the word "github").
 */
function buildMeta() {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
  const libCandidates = [
    resolve(import.meta.dirname, 'node_modules/palletface/dist/dither-face.js'),
    resolve(import.meta.dirname, '../dist/dither-face.js'),
  ]
  const libPath = libCandidates.find(existsSync)
  const iifeKb = libPath ? (readFileSync(libPath).length / 1024).toFixed(0) : '?'
  const gzipKb = libPath ? (gzipSync(readFileSync(libPath), { level: 9 }).length / 1024).toFixed(1) : '?'
  let stars: number | null = null
  try {
    stars = JSON.parse(
      execSync('gh api repos/puri-adityakumar/palletface --jq .stargazers_count', {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15000,
      }).toString().trim(),
    )
  } catch {
    stars = null
  }
  return { version: pkg.version as string, iifeKb, gzipKb, stars }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(buildMeta()),
  },
})
