#!/usr/bin/env node
/**
 * Stage 9 consumer-cancellation child.
 *
 * The package API is synchronous and has no cancel method. This probe tests a
 * consumer cancellation pattern instead: terminate a Worker that is stuck in
 * an intentionally unbounded render loop, then verify that a fresh Worker and
 * the main thread both render the fixed golden input correctly. It also
 * records active handles after cleanup. No leak or resource budget is claimed.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

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

function waitForMessage(worker, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker message timeout after ${timeoutMs} ms`)), timeoutMs)
    worker.once('message', (message) => {
      clearTimeout(timer)
      resolve(message)
    })
    worker.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function terminateWithLimit(worker, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ code: null, timedOut: true }), timeoutMs)
    worker.terminate().then((code) => {
      clearTimeout(timer)
      resolve({ code, timedOut: false })
    }).catch((error) => {
      clearTimeout(timer)
      resolve({ code: null, timedOut: false, error: error.message })
    })
  })
}

const args = parseArgs(process.argv.slice(2))
for (const required of ['module', 'golden']) {
  if (!args[required]) throw new Error(`Missing required --${required}`)
}
const modulePath = args.module
const golden = JSON.parse(fs.readFileSync(args.golden, 'utf8'))
const expected = new Map(golden.styles.map((entry) => [entry.slug, entry.sha256]))
const terminateMaxMs = Number(args.terminateMaxMs ?? 2000)
const moduleUrl = pathToFileURL(modulePath).href

const mod = await import(moduleUrl)
const mainSvg = mod.ditherFace('preview-output', { style: 'pixel-sprite', px: 80, name: '7even' })
const mainSha256 = sha256(mainSvg)

const longWorkerCode = `
const { parentPort, workerData } = require('node:worker_threads')
const { createHash } = require('node:crypto')
import(workerData.module).then((mod) => {
  const svg = mod.ditherFace('preview-output', { style: 'pixel-sprite', px: 80, name: '7even' })
  parentPort.postMessage({ type: 'ready', sha256: createHash('sha256').update(svg).digest('hex') })
  for (let i = 0; i < 1000000000; i += 1) {
    mod.ditherFace('s9-cancel-' + i, { style: 'pixel-sprite', px: 80, name: 'Cancel' })
  }
})
`

const shortWorkerCode = `
const { parentPort, workerData } = require('node:worker_threads')
const { createHash } = require('node:crypto')
import(workerData.module).then((mod) => {
  let sink = 0
  for (let i = 0; i < 1000; i += 1) sink += mod.ditherFace('s9-retry-' + i, { style: 'pixel-sprite', px: 80, name: 'Retry' }).length
  const svg = mod.ditherFace('preview-output', { style: 'pixel-sprite', px: 80, name: '7even' })
  parentPort.postMessage({ type: 'done', sha256: createHash('sha256').update(svg).digest('hex'), sink })
})
`

const longWorker = new Worker(longWorkerCode, { eval: true, workerData: { module: moduleUrl } })
const longReadyStarted = performance.now()
const longReady = await waitForMessage(longWorker, 15000)
const longReadyMs = performance.now() - longReadyStarted
const terminateStarted = performance.now()
const longTermination = await terminateWithLimit(longWorker, terminateMaxMs + 3000)
const terminateMs = performance.now() - terminateStarted

const shortWorker = new Worker(shortWorkerCode, { eval: true, workerData: { module: moduleUrl } })
const shortStarted = performance.now()
const shortDone = await waitForMessage(shortWorker, 15000)
const shortRetryMs = performance.now() - shortStarted
const shortTermination = await terminateWithLimit(shortWorker, terminateMaxMs + 3000)

const handleNames = (process._getActiveHandles?.() ?? []).map((handle) => handle.constructor?.name ?? 'unknown')
const output = {
  node: process.version,
  modulePath,
  moduleSha256: sha256(fs.readFileSync(modulePath)),
  expectedPixelSpriteSha256: expected.get('pixel-sprite'),
  mainSha256,
  mainMatchesGolden: mainSha256 === expected.get('pixel-sprite'),
  longWorkerReadySha256: longReady.sha256,
  longWorkerReadyMatchesGolden: longReady.sha256 === expected.get('pixel-sprite'),
  longReadyMs,
  terminateMs,
  terminateLimitMs: terminateMaxMs,
  terminateWithinLimit: !longTermination.timedOut && terminateMs <= terminateMaxMs,
  longTermination,
  shortWorkerSha256: shortDone.sha256,
  shortWorkerMatchesGolden: shortDone.sha256 === expected.get('pixel-sprite'),
  shortRetryMs,
  retryWithinLimit: !shortTermination.timedOut && shortRetryMs <= 5000,
  shortTermination,
  activeHandleNames: handleNames,
  activeHandleCount: handleNames.length,
  startedAt: new Date().toISOString(),
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
