#!/usr/bin/env node
/**
 * Derive Stage 9 site budgets from the first baseline measurement.
 *
 * This is deliberately a separate, auditable step. It reads only the baseline
 * measurement JSON, applies the declared formulas, and writes the expected
 * results document. It performs no browser or server work.
 */
import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
function arg(name, fallback = null) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const baselinePath = path.resolve(arg('baseline'))
const outPath = path.resolve(arg('out'))
const commit = arg('commit')
const sandbox = arg('sandbox')
const runId = arg('run-id', 'unknown')
const MIB = 1024 * 1024

if (!baselinePath || !outPath) throw new Error('usage: perf-site-budget.mjs --baseline <baseline.json> --out <expected-results.json> [--commit SHA] [--sandbox NAME]')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
function stats(values) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (clean.length === 0) return { count: 0, min: null, p50: null, p95: null, max: null, mean: null }
  const percentile = p => clean[Math.max(0, Math.min(clean.length - 1, Math.ceil((p / 100) * clean.length) - 1))]
  return {
    count: clean.length,
    min: clean[0],
    p50: percentile(50),
    p95: percentile(95),
    max: clean[clean.length - 1],
    mean: clean.reduce((total, value) => total + value, 0) / clean.length
  }
}
function ceilToMiB(bytes) {
  return Math.ceil(bytes / MIB) * MIB
}
function timeBudget(samples) {
  const value = stats(samples)
  if (value.count === 0) return null
  return Math.ceil(Math.max(value.p95 * 2, value.max * 1.25))
}
function longTaskBudget(samples) {
  const value = stats(samples)
  if (value.count === 0) return null
  return value.max > 0 ? Math.ceil(value.max * 2) : 50
}
function memoryBudget(samples) {
  const value = stats(samples)
  if (value.count === 0) return null
  const range = Math.max(0, value.max - value.min)
  return ceilToMiB(Math.max(0, value.max) + 3 * range + MIB)
}
function exactBudget(samples) {
  const value = stats(samples)
  return value.count === 0 ? null : value.max
}
function budgetFor(key, samples) {
  if (key.includes('.longTaskMaxMs')) return { value: longTaskBudget(samples), method: 'long-task: max(2 x baseline max, 50 ms floor)' }
  if (key.includes('heapDelta')) return { value: memoryBudget(samples), method: 'memory: ceilMiB(max(0, baseline max) + 3 x baseline range + 1 MiB floor)' }
  if (key.endsWith('Bytes')) return { value: exactBudget(samples), method: 'deterministic size: baseline maximum (same commit/build)' }
  if (key.endsWith('Ms')) return { value: timeBudget(samples), method: 'time: ceil(max(2 x baseline p95, 1.25 x baseline max))' }
  return { value: exactBudget(samples), method: 'exact/count: baseline maximum' }
}

const baselineText = await fsp.readFile(baselinePath, 'utf8')
const baseline = JSON.parse(baselineText)
const baselineSha = sha256(baselineText)
const budgets = {}
const budgetMethods = {}
const baselineSummary = {}
const skipped = []
for (const key of Object.keys(baseline.metricSamples ?? {}).sort()) {
  if (key.startsWith('blocked.favicon.')) {
    skipped.push(key)
    continue
  }
  const samples = baseline.metricSamples[key]
  const result = budgetFor(key, samples)
  if (result.value === null) {
    skipped.push(key)
    continue
  }
  budgets[key] = result.value
  budgetMethods[key] = result.method
  baselineSummary[key] = baseline.metrics?.[key] ?? null
}

const expected = {
  stage: 'S9-SITE',
  title: 'Playground and site performance/resilience',
  createdBeforeExecution: new Date().toISOString().slice(0, 10),
  runId,
  commit: commit ?? baseline.commit ?? null,
  baseline: {
    sandbox: sandbox ?? baseline.sandbox ?? null,
    commit: baseline.commit ?? null,
    startedAt: baseline.startedAt ?? null,
    endedAt: baseline.endedAt ?? null,
    engines: baseline.engines ?? null,
    baselineSha256: baselineSha,
    baselineFile: 'baseline/baseline.json',
    metricSamplesFile: 'baseline/baseline.json#metricSamples'
  },
  note: 'Budgets were derived after the first baseline run and before the acceptance run. They are regression-detection limits from this sandbox class, not product performance promises or self-approval. Missing metrics are skipped rather than assigned invented limits.',
  budgetMethod: {
    time: 'ceil(max(2 x baseline p95, 1.25 x baseline max)) milliseconds',
    longTask: 'ceil(2 x baseline maximum), with the browser 50 ms long-task threshold as the floor when the baseline saw no long task',
    memory: 'ceil to MiB of max(0, baseline maximum delta) + 3 x baseline range + 1 MiB measurement floor',
    size: 'baseline maximum bytes for a deterministic build at the same commit; acceptance must not exceed it',
    counts: 'baseline maximum; exact behavioural counts are additionally asserted by the harness'
  },
  budgets,
  budgetMethods,
  baselineMetrics: baselineSummary,
  skippedMetrics: skipped,
  coverage: {
    heap: 'Chromium CDP Runtime.getHeapUsage; Firefox/WebKit do not expose an equivalent heap API and are not claimed',
    longTasks: 'Chromium PerformanceObserver longtask; other engines are measured for load/render time only',
    throttling: 'Chromium CDP network and CPU emulation only',
    browsers: 'Playwright Linux Chromium, Firefox and WebKit plus Pixel 7 mobile Chromium emulation; WebKit is not native Safari'
  }
}

await fsp.mkdir(path.dirname(outPath), { recursive: true })
await fsp.writeFile(outPath, `${JSON.stringify(expected, null, 2)}\n`)
console.log(JSON.stringify({
  out: outPath,
  baselineSha256: baselineSha,
  budgetCount: Object.keys(budgets).length,
  skipped: skipped.length,
  budgets
}, null, 2))
