#!/usr/bin/env node
/**
 * Stage 9 Node soak child.
 *
 * Runs a predeclared number of renders across all eight styles and Blob
 * object-URL create/revoke cycles, forcing GC at fixed windows. It reports
 * heap/RSS movement and URL handle retention; it does not declare a leak
 * budget. The caller records the measurement for parent decision.
 *
 * Run with --expose-gc. The library has no OOM handler and this probe does
 * not claim one.
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

function memory() {
  const usage = process.memoryUsage()
  return {
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  }
}

const args = parseArgs(process.argv.slice(2))
for (const required of ['module', 'golden', 'renders', 'window', 'urlCycles']) {
  if (!args[required]) throw new Error(`Missing required --${required}`)
}
if (typeof globalThis.gc !== 'function') throw new Error('Run this child with --expose-gc')

const modulePath = args.module
const golden = JSON.parse(fs.readFileSync(args.golden, 'utf8'))
const renders = Number(args.renders)
const windowSize = Number(args.window)
const urlCycles = Number(args.urlCycles)
const px = 80
const name = 'Soak'
const styles = golden.styles.map((entry) => entry.slug)
const expected = new Map(golden.styles.map((entry) => [entry.slug, entry.sha256]))

if (!Number.isInteger(renders) || renders < 1) throw new Error(`Invalid --renders: ${args.renders}`)
if (!Number.isInteger(windowSize) || windowSize < 1) throw new Error(`Invalid --window: ${args.window}`)
if (!Number.isInteger(urlCycles) || urlCycles < 0) throw new Error(`Invalid --urlCycles: ${args.urlCycles}`)
if (styles.length !== 8) throw new Error(`Expected eight golden styles, found ${styles.length}`)

const fixedHashes = {}
const mod = await import(pathToFileURL(modulePath).href)
if (typeof mod.ditherFace !== 'function') throw new Error(`No ditherFace export in ${modulePath}`)
for (const style of styles) {
  fixedHashes[style] = sha256(mod.ditherFace('preview-output', { style, px, name: '7even' }))
}

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
let urlWrapperActive = false
let urlCreated = 0
let urlRevoked = 0
const liveUrls = new Set()
try {
  URL.createObjectURL = function trackedCreateObjectURL(blob) {
    const url = originalCreateObjectURL.call(URL, blob)
    urlCreated += 1
    liveUrls.add(url)
    return url
  }
  URL.revokeObjectURL = function trackedRevokeObjectURL(url) {
    urlRevoked += 1
    liveUrls.delete(url)
    return originalRevokeObjectURL.call(URL, url)
  }
  urlWrapperActive = true
} catch (error) {
  urlWrapperActive = false
  process.stderr.write(`URL wrapper unavailable: ${error.message}\n`)
}

function createTrackedUrl(blob) {
  if (urlWrapperActive) return URL.createObjectURL(blob)
  const url = originalCreateObjectURL.call(URL, blob)
  urlCreated += 1
  return url
}

function revokeTrackedUrl(url) {
  if (urlWrapperActive) return URL.revokeObjectURL(url)
  urlRevoked += 1
  return originalRevokeObjectURL.call(URL, url)
}

function checkpoint(kind, index) {
  globalThis.gc()
  return { kind, index, at: new Date().toISOString(), ...memory(), urlCreated, urlRevoked, liveUrlCount: liveUrls.size }
}

const windows = []
let sink = 0
let invalid = 0
globalThis.gc()
windows.push(checkpoint('start', 0))
for (let index = 0; index < renders; index += 1) {
  const style = styles[index % styles.length]
  const svg = mod.ditherFace(`s9-soak-${index}`, { style, px, name })
  sink += svg.length
  if (!svg.startsWith('<svg') || !svg.trimEnd().endsWith('</svg>')) invalid += 1
  if ((index + 1) % windowSize === 0) windows.push(checkpoint('render', index + 1))
}
if (renders % windowSize !== 0) windows.push(checkpoint('render', renders))

const urlCheckpoints = []
if (urlCycles > 0) {
  const urlWindow = Math.max(1, Math.floor(urlCycles / 5))
  for (let index = 0; index < urlCycles; index += 1) {
    const svg = mod.ditherFace(`s9-url-${index % 8}`, { style: styles[index % styles.length], px, name })
    const url = createTrackedUrl(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    revokeTrackedUrl(url)
    if ((index + 1) % urlWindow === 0) urlCheckpoints.push(checkpoint('url', index + 1))
  }
  if (urlCycles % urlWindow !== 0) urlCheckpoints.push(checkpoint('url', urlCycles))
}

const endHashes = {}
for (const style of styles) {
  endHashes[style] = sha256(mod.ditherFace('preview-output', { style, px, name: '7even' }))
}
windows.push(checkpoint('end', renders))

const renderWindows = windows.filter((entry) => entry.kind === 'render' || entry.kind === 'start' || entry.kind === 'end')
const first = renderWindows[0]
const last = renderWindows[renderWindows.length - 1]
const output = {
  node: process.version,
  v8: process.versions.v8,
  modulePath,
  moduleSha256: sha256(fs.readFileSync(modulePath)),
  renders,
  windowSize,
  urlCycles,
  px,
  styles,
  fixedHashes,
  expectedHashes: Object.fromEntries(expected),
  endHashes,
  fixedHashesMatch: styles.every((style) => fixedHashes[style] === expected.get(style) && endHashes[style] === expected.get(style)),
  invalid,
  sink,
  urlWrapperActive,
  urlCreated,
  urlRevoked,
  liveUrlCount: liveUrls.size,
  urlAllRevoked: liveUrls.size === 0 && urlCreated === urlRevoked,
  renderWindows,
  urlCheckpoints,
  heapGrowthBytes: last.heapUsedBytes - first.heapUsedBytes,
  rssGrowthBytes: last.rssBytes - first.rssBytes,
  peakHeapUsedBytes: Math.max(...windows.map((entry) => entry.heapUsedBytes)),
  peakRssBytes: Math.max(...windows.map((entry) => entry.rssBytes)),
  startedAt: new Date().toISOString(),
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
