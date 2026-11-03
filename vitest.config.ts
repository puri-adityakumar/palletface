/** Collect tests from src only, so built dist twins can never double-count. */
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: [{ find: /^dither-face$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) }],
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
