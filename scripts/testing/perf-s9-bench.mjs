#!/usr/bin/env node
/**
 * Stage 9 measured-render child.
 *
 * One fresh process measures one style at one batch size for one
 * runtime/package combination. It warms up, renders the fixed golden input,
 * then records wall time, CPU time, SVG bytes and RSS/heap for repeated
 * samples. It deliberately makes no budget judgement: the parent decides any
 * release threshold. The caller aggregates and compares the fixed digests.
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
for (const required of ['module', 'style', 'batch']) {
  if (!args[required]) throw new Error(`Missing required --${required}`)
}

const modulePath = args.module
const style = args.style
const batch = Number(args.batch)
const warmup = Number(args.warmup ?? 30)
const repetitions = Number(args.reps ?? 3)
const px = Number(args.px ?? 80)
const name = args.name ?? 'Ada'
const seedPrefix = args.seedPrefix ?? 's9-bench'
const fixedSeed = args.fixedSeed ?? 'preview-output'
const fixedName = args.fixedName ?? '7even'

if (!Number.isInteger(batch) || batch < 1) throw new Error(`Invalid --batch: ${args.batch}`)
if (!Number.isInteger(warmup) || warmup < 1) throw new Error(`Invalid --warmup: ${args.warmup}`)
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error(`Invalid --reps: ${args.reps}`)
if (!Number.isFinite(px) || px <= 0) throw new Error(`Invalid --px: ${args.px}`)
if (!fs.existsSync(modulePath)) throw new Error(`Module not found: ${modulePath}`)

const moduleBytes = fs.readFileSync(modulePath)
const importStarted = performance.now()
const mod = await import(pathToFileURL(modulePath).href)
const importMs = performance.now() - importStarted
if (typeof mod.ditherFace !== 'function') throw new Error(`No ditherFace export in ${modulePath}`)

const fixedSvg = mod.ditherFace(fixedSeed, { style, px, name: fixedName })
const fixedGoldenSha256 = sha256(fixedSvg)

if (typeof globalThis.gc === 'function') globalThis.gc()
const beforeWarmup = memory()
const warmupStarted = performance.now()
const warmupCpuStarted = process.cpuUsage()
for (let index = 0; index < warmup; index += 1) {
  mod.ditherFace(`${seedPrefix}-warm-${index}`, { style, px, name })
}
const warmupWallMs = performance.now() - warmupStarted
const warmupCpu = process.cpuUsage(warmupCpuStarted)
if (typeof globalThis.gc === 'function') globalThis.gc()
const afterWarmup = memory()

const samples = []
for (let repetition = 0; repetition < repetitions; repetition += 1) {
  if (typeof globalThis.gc === 'function') globalThis.gc()
  const before = memory()
  const hash = createHash('sha256')
  let minBytes = Infinity
  let maxBytes = 0
  let totalBytes = 0
  let invalidCount = 0
  const wallStarted = performance.now()
  const cpuStarted = process.cpuUsage()
  for (let index = 0; index < batch; index += 1) {
    const svg = mod.ditherFace(`${seedPrefix}-${index}`, { style, px, name })
    const bytes = Buffer.byteLength(svg)
    if (!svg.startsWith('<svg') || !svg.trimEnd().endsWith('</svg>')) invalidCount += 1
    minBytes = Math.min(minBytes, bytes)
    maxBytes = Math.max(maxBytes, bytes)
    totalBytes += bytes
    hash.update(`${bytes}\0`)
    hash.update(svg)
    hash.update('\n')
  }
  const wallMs = performance.now() - wallStarted
  const cpu = process.cpuUsage(cpuStarted)
  const after = memory()
  samples.push({
    repetition,
    wallMs,
    perRenderMs: wallMs / batch,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    cpuTotalMs: (cpu.user + cpu.system) / 1000,
    cpuPerRenderMs: (cpu.user + cpu.system) / 1000 / batch,
    svgBytesMin: minBytes,
    svgBytesMax: maxBytes,
    svgBytesTotal: totalBytes,
    svgBytesPerRender: totalBytes / batch,
    invalidCount,
    aggregateSha256: hash.digest('hex'),
    rssBeforeBytes: before.rssBytes,
    rssAfterBytes: after.rssBytes,
    rssDeltaBytes: after.rssBytes - before.rssBytes,
    heapUsedBeforeBytes: before.heapUsedBytes,
    heapUsedAfterBytes: after.heapUsedBytes,
    heapUsedDeltaBytes: after.heapUsedBytes - before.heapUsedBytes,
    heapTotalAfterBytes: after.heapTotalBytes,
    externalAfterBytes: after.externalBytes,
  })
}

const output = {
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch,
  modulePath,
  moduleSha256: sha256(moduleBytes),
  moduleBytes: moduleBytes.length,
  style,
  batch,
  px,
  name,
  seedPrefix,
  warmupRenders: warmup,
  repetitions,
  importMs,
  fixedSeed,
  fixedName,
  fixedGoldenSha256,
  fixedGoldenBytes: Buffer.byteLength(fixedSvg),
  warmupWallMs,
  warmupCpuUserMs: warmupCpu.user / 1000,
  warmupCpuSystemMs: warmupCpu.system / 1000,
  beforeWarmup,
  afterWarmup,
  samples,
  startedAt: new Date().toISOString(),
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
