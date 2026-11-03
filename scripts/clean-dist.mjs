import { rm } from 'node:fs/promises'

// Only the generated package output, resolved from this script, is removed.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true })
