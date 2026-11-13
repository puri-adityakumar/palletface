#!/usr/bin/env node
/**
 * Stage 9 export/import cost child.
 *
 * Measures a cold ESM import of one concrete file, the sorted runtime export
 * names and post-import RSS/heap in a fresh process. It never touches the
 * network and makes no performance-budget judgement.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const key = token.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    args[key] = value
    i += 1
  }
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

const args = parseArgs(process.argv.slice(2))
if (!args.module) throw new Error('Missing --module')
if (!fs.existsSync(args.module)) throw new Error(`Module not found: ${args.module}`)

const moduleBytes = fs.readFileSync(args.module)
const started = performance.now()
const mod = await import(pathToFileURL(args.module).href)
const importMs = performance.now() - started
const usage = process.memoryUsage()
const exports = Object.keys(mod).sort()

process.stdout.write(`${JSON.stringify({
  node: process.version,
  v8: process.versions.v8,
  modulePath: args.module,
  moduleSha256: sha256(moduleBytes),
  moduleBytes: moduleBytes.length,
  importMs,
  exportCount: exports.length,
  exports,
  rssBytes: usage.rss,
  heapTotalBytes: usage.heapTotal,
  heapUsedBytes: usage.heapUsed,
  externalBytes: usage.external,
  measuredAt: new Date().toISOString(),
}, null, 2)}\n`)
