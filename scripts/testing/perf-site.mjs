#!/usr/bin/env node
/**
 * Stage 9 site/playground performance and resilience harness.
 *
 * This script runs only inside the dedicated disposable Blaxel sandbox. Local
 * execution is not evidence. It does not modify product source and it does not
 * approve the stage. Baseline mode records measurements only; test mode applies
 * budgets that were derived from that baseline and written before acceptance.
 *
 * Phases: prepare, build, baseline, test.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
function arg(name, fallback = null) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const repo = path.resolve(arg('repo'))
const out = path.resolve(arg('out'))
const work = path.resolve(arg('work'))
const fixtures = path.resolve(arg('fixtures'))
const expectedPath = arg('expected') ? path.resolve(arg('expected')) : null
const toolsLock = path.resolve(arg('tools-lock'))
const sourceManifestPath = path.resolve(arg('source-manifest'))
const commit = arg('commit')
const sandbox = arg('sandbox')
const image = arg('image', 'blaxel/ts-app:latest')
const region = arg('region', 'us-pdx-1')
const memoryMb = Number(arg('memory', '4096'))
const expectedSha = arg('expected-sha')
const toolsLockSha = arg('tools-lock-sha')
const sourceManifestSha = arg('source-manifest-sha')
const phase = arg('phase')
const partName = arg('part')
const activeBudgetSeconds = Number(arg('active-budget', '1800'))
const perCommandTimeoutSeconds = Number(arg('command-timeout', '600'))
const pwBrowsers = path.resolve(arg('pw-browsers', path.join(work, 'pw-browsers')))

if (!['prepare', 'build', 'part', 'merge-baseline', 'merge-test', 'baseline', 'test'].includes(phase)) {
  throw new Error(`Unknown or missing --phase: ${phase}`)
}
if (!repo || !out || !work || !fixtures || !toolsLock || !sourceManifestPath || !commit || !sandbox) {
  throw new Error('Missing required argument (repo/out/work/fixtures/tools-lock/source-manifest/commit/sandbox)')
}
if ((phase === 'merge-test' || phase === 'test') && (!expectedPath || !expectedSha)) {
  throw new Error('merge-test phase requires --expected and --expected-sha')
}
if (phase === 'part' && !partName) throw new Error('part phase requires --part')

process.env.PLAYWRIGHT_BROWSERS_PATH = pwBrowsers
const toolsDir = path.join(repo, 'tests/qualification/s9-site/tools')
const siteDir = path.join(repo, 'dist-site')
const baseUrl = 'http://127.0.0.1:4173'
const startedAt = new Date().toISOString()
const phaseStarted = Date.now()
const steps = []

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
async function sha256File(file) {
  return sha256(await fsp.readFile(file))
}
async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}
async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
function log(line) {
  process.stdout.write(`[${new Date().toISOString()}] ${line}\n`)
}
function nowIso() {
  return new Date().toISOString()
}
function stats(values) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (clean.length === 0) return { count: 0, min: null, p50: null, p95: null, max: null, mean: null }
  const percentile = p => clean[Math.max(0, Math.min(clean.length - 1, Math.ceil((p / 100) * clean.length) - 1))]
  const sum = clean.reduce((total, value) => total + value, 0)
  return {
    count: clean.length,
    min: clean[0],
    p50: percentile(50),
    p95: percentile(95),
    max: clean[clean.length - 1],
    mean: sum / clean.length
  }
}
function bytesInfo(buffer) {
  return {
    rawBytes: buffer.length,
    gzipBytes: zlib.gzipSync(buffer, { level: 9 }).length,
    brotliBytes: zlib.brotliCompressSync(buffer, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
    }).length,
    sha256: sha256(buffer)
  }
}
async function fileInfo(file) {
  return { path: file, ...bytesInfo(await fsp.readFile(file)) }
}
async function walkFiles(directory) {
  const files = []
  async function walk(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else files.push(full)
    }
  }
  await walk(directory)
  return files.sort()
}

function checker() {
  const assertions = []
  return {
    ok(condition, name, detail = null) {
      assertions.push({ name, ok: Boolean(condition), detail })
      return Boolean(condition)
    },
    eq(actual, expected, name) {
      return this.ok(Object.is(actual, expected), name, { actual, expected })
    },
    note(name, detail = null) {
      assertions.push({ name, ok: true, detail, note: true })
      return true
    },
    list() {
      return assertions
    },
    failures() {
      return assertions.filter(item => !item.ok && !item.note)
    }
  }
}

async function runChild(label, command, commandArgs, options = {}) {
  const cwd = options.cwd ?? repo
  const timeout = options.timeout ?? perCommandTimeoutSeconds * 1000
  const env = { ...process.env, ...(options.env ?? {}) }
  const started = Date.now()
  const logPath = path.join(out, 'logs', `${label}.log`)
  await fsp.mkdir(path.dirname(logPath), { recursive: true })
  const record = {
    label,
    command: [command, ...commandArgs].join(' '),
    cwd,
    timeoutMs: timeout,
    startedAt: nowIso()
  }
  log(`${label}: ${record.command}`)
  const result = await new Promise(resolve => {
    const child = spawn(command, commandArgs, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, timeout)
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', error => {
      clearTimeout(timer)
      resolve({ code: null, signal: null, stdout, stderr: `${stderr}\n${error.stack}`, timedOut })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr, timedOut })
    })
  })
  record.exitCode = result.code
  record.signal = result.signal
  record.timedOut = result.timedOut
  record.durationMs = Date.now() - started
  record.stdoutTail = result.stdout.slice(-16000)
  record.stderrTail = result.stderr.slice(-16000)
  steps.push(record)
  await fsp.writeFile(logPath, [
    `$ ${record.command}`,
    `cwd: ${cwd}`,
    `exitCode: ${record.exitCode}`,
    `timedOut: ${record.timedOut}`,
    `durationMs: ${record.durationMs}`,
    '--- stdout ---',
    result.stdout,
    '--- stderr ---',
    result.stderr,
    ''
  ].join('\n'))
  if (result.code !== 0 || result.timedOut) {
    throw new Error(`${label} failed: exit=${result.code} signal=${result.signal} timedOut=${result.timedOut}\n${result.stderr.slice(-5000)}`)
  }
  return record
}

async function verifyHash(label, file, expected) {
  assert(expected && /^[0-9a-f]{64}$/.test(expected), `Missing expected SHA for ${label}`)
  const actual = await sha256File(file)
  assert(actual === expected, `${label} SHA mismatch: ${actual} != ${expected}`)
  return actual
}

async function verifySourceManifest(manifestPath) {
  const manifest = await readJson(manifestPath)
  assert(manifest.stage === 'S9-SITE', `source manifest stage is not S9-SITE: ${manifest.stage}`)
  assert(manifest.commit === commit, `source manifest commit mismatch: ${manifest.commit} != ${commit}`)
  assert(Array.isArray(manifest.files) && manifest.files.length > 150, `source manifest too small: ${manifest.files?.length}`)
  const digestParts = []
  for (const file of manifest.files) {
    const full = path.join(repo, file.path)
    const buffer = await fsp.readFile(full)
    const actual = sha256(buffer)
    assert(actual === file.sha256, `source file SHA mismatch: ${file.path}`)
    assert(buffer.length === file.bytes, `source file size mismatch: ${file.path}`)
    digestParts.push(`${file.path}\0${actual}`)
  }
  const digest = sha256(digestParts.join('\n'))
  assert(digest === manifest.sha256, `source manifest digest mismatch: ${digest} != ${manifest.sha256}`)
  return { manifest, digest, fileCount: manifest.files.length }
}

async function environmentInfo() {
  const cpuText = await fsp.readFile('/proc/cpuinfo', 'utf8').catch(() => '')
  const cpuModels = [...new Set(cpuText.split('\n').filter(line => line.startsWith('model name')).map(line => line.split(':').slice(1).join(':').trim()))]
  const memText = await fsp.readFile('/proc/meminfo', 'utf8').catch(() => '')
  const memTotal = Number((memText.match(/^MemTotal:\s+(\d+) kB/m) ?? [])[1] ?? 0) * 1024
  return {
    node: process.version,
    npm: (await new Promise(resolve => {
      const child = spawn('npm', ['--version'], { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] })
      let text = ''
      child.stdout.on('data', chunk => { text += chunk })
      child.on('close', () => resolve(text.trim()))
    })),
    platform: process.platform,
    arch: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    kernel: os.version?.() ?? null,
    cpuModels,
    cpuCount: os.cpus().length,
    availableParallelism: typeof os.availableParallelism === 'function' ? os.availableParallelism() : null,
    memoryTotalBytes: memTotal || os.totalmem(),
    memoryFreeBytes: os.freemem(),
    sandboxMemoryMb: memoryMb,
    image,
    region,
    commit,
    sandbox,
    recordedAt: nowIso()
  }
}

async function phasePrepare() {
  const manifestInfo = await verifySourceManifest(sourceManifestPath)
  const manifestHash = await verifyHash('source manifest', sourceManifestPath, sourceManifestSha)
  const toolsLockHash = await verifyHash('tools lock', toolsLock, toolsLockSha)
  const harnessHash = await sha256File(path.join(repo, 'scripts/testing/perf-site.mjs'))
  const manifestEntry = manifestInfo.manifest.files.find(file => file.path === 'scripts/testing/perf-site.mjs')
  assert(manifestEntry, 'harness is not covered by the source manifest')
  assert(manifestEntry.sha256 === harnessHash, 'harness SHA does not match the source manifest')
  const environment = await environmentInfo()
  await writeJson(path.join(out, 'environment.json'), environment)
  await fsp.writeFile(path.join(out, 'environment.txt'), [
    `node=${environment.node}`,
    `npm=${environment.npm}`,
    `platform=${environment.platform}`,
    `arch=${environment.arch}`,
    `kernel=${environment.osRelease}`,
    `cpu=${environment.cpuModels.join(' | ') || 'unknown'}`,
    `cpuCount=${environment.cpuCount}`,
    `memoryTotalBytes=${environment.memoryTotalBytes}`,
    `sandboxMemoryMb=${environment.sandboxMemoryMb}`,
    `image=${environment.image}`,
    `region=${environment.region}`,
    `commit=${environment.commit}`,
    `sandbox=${environment.sandbox}`,
    ''
  ].join('\n'))

  await fsp.mkdir(toolsDir, { recursive: true })
  await runChild('npm-ci-tools', 'npm', ['ci', '--ignore-scripts'], { cwd: toolsDir, timeout: perCommandTimeoutSeconds * 1000 })
  await runChild('playwright-version', 'npx', ['playwright', '--version'], { cwd: toolsDir, timeout: 120000 })
  await runChild('playwright-install', 'npx', ['playwright', 'install', '--with-deps', 'chromium', 'firefox', 'webkit'], {
    cwd: toolsDir,
    timeout: perCommandTimeoutSeconds * 1000
  })
  const installList = await runChild('playwright-install-list', 'npx', ['playwright', 'install', '--list'], {
    cwd: toolsDir,
    timeout: 120000
  })
  await fsp.writeFile(path.join(out, 'playwright-install-list.txt'), installList.stdoutTail)

  await writeJson(path.join(out, 'prepare.json'), {
    ok: true,
    phase,
    sourceManifestSha256: manifestHash,
    sourceManifestFileCount: manifestInfo.fileCount,
    toolsLockSha256: toolsLockHash,
    harnessSha256: harnessHash,
    environment,
    toolsDir,
    pwBrowsers,
    steps
  })
}

async function buildSiteArtifacts() {
  await runChild('npm-ci-root', 'npm', ['ci'], { cwd: repo, timeout: perCommandTimeoutSeconds * 1000 })
  await runChild('npm-build-tsc', 'npm', ['run', 'build'], { cwd: repo, timeout: perCommandTimeoutSeconds * 1000 })
  await runChild('npm-build-web', 'npm', ['run', 'build:web'], { cwd: repo, timeout: perCommandTimeoutSeconds * 1000 })
  await runChild('npm-build-site', 'npm', ['run', 'build:site'], { cwd: repo, timeout: perCommandTimeoutSeconds * 1000 })

  const productFiles = []
  for (const file of await walkFiles(siteDir)) {
    const relative = path.relative(siteDir, file).split(path.sep).join('/')
    productFiles.push({ ...(await fileInfo(file)), path: relative })
  }
  const libraryFiles = []
  for (const file of await walkFiles(path.join(repo, 'dist'))) {
    if (!file.endsWith('.js')) continue
    libraryFiles.push({ ...(await fileInfo(file)), path: path.relative(repo, file).split(path.sep).join('/') })
  }
  const bundle = {
    distDir: 'dist-site',
    productFiles,
    libraryFiles,
    bundleManifestSha256: sha256(productFiles.map(file => `${file.path}\0${file.sha256}`).join('\n')),
    appJs: productFiles.find(file => file.path === 'assets/app.js') ?? null,
    siteCss: productFiles.find(file => file.path === 'site.css') ?? null,
    indexHtml: productFiles.find(file => file.path === 'index.html') ?? null,
    bootstrapJs: productFiles.find(file => file.path === 'bootstrap.js') ?? null
  }
  assert(bundle.appJs, 'built site is missing assets/app.js')
  assert(bundle.siteCss, 'built site is missing site.css')
  assert(bundle.indexHtml, 'built site is missing index.html')
  assert(bundle.bootstrapJs, 'built site is missing bootstrap.js')
  await writeJson(path.join(out, 'bundle.json'), bundle)

  // Test-only same-origin copy of the library IIFE. It is served by the local
  // server for render benchmarks and is not part of the product bundle record.
  const benchDir = path.join(siteDir, 's9-bench')
  await fsp.mkdir(benchDir, { recursive: true })
  await fsp.copyFile(path.join(repo, 'dist/dither-face.js'), path.join(benchDir, 'dither-face.js'))
  await writeJson(path.join(out, 'build.json'), {
    ok: true,
    phase,
    bundle,
    benchLibrary: {
      ...(await fileInfo(path.join(benchDir, 'dither-face.js'))),
      path: 'dist-site/s9-bench/dither-face.js',
      note: 'test-only render benchmark copy; excluded from product bundle sizes'
    },
    steps
  })
  return bundle
}

async function startServer() {
  const logPath = path.join(out, 'logs', 'serve-site.log')
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  const child = spawn(process.execPath, ['scripts/serve-site.mjs', '--port', '4173'], {
    cwd: repo,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', chunk => stream.write(chunk))
  child.stderr.on('data', chunk => stream.write(chunk))
  let exited = null
  child.on('exit', (code, signal) => {
    exited = { code, signal }
    stream.end()
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (exited) throw new Error(`site server exited before ready: ${JSON.stringify(exited)}`)
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: 'manual' })
      if (response.ok) return { child, logPath }
    } catch {
      // not ready yet
    }
    await sleep(250)
  }
  child.kill('SIGTERM')
  throw new Error(`site server did not become ready: ${baseUrl}`)
}

async function stopServer(server) {
  if (!server) return
  server.child.kill('SIGTERM')
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.killed) return
    await sleep(100)
  }
  server.child.kill('SIGKILL')
}

function attachLogs(page) {
  const logs = { console: [], pageErrors: [], requestFailed: [], requests: [], dialogs: [] }
  page.on('console', message => {
    logs.console.push({ type: message.type(), text: message.text(), location: message.location() })
  })
  page.on('pageerror', error => {
    logs.pageErrors.push(error.stack || String(error))
  })
  page.on('requestfailed', request => {
    logs.requestFailed.push({ url: request.url(), failure: request.failure()?.errorText ?? null })
  })
  page.on('request', request => {
    logs.requests.push({ url: request.url(), resourceType: request.resourceType(), method: request.method() })
  })
  page.on('dialog', async dialog => {
    logs.dialogs.push({ type: dialog.type(), message: dialog.message() })
    await dialog.dismiss().catch(() => {})
  })
  return logs
}

function observerScript() {
  window.__s9 = window.__s9 || {}
  const s = window.__s9
  s.longTasks = []
  s.fcp = null
  s.lcp = null
  s.appReadyAt = null
  function addLongTasks(entries) {
    for (const entry of entries) {
      s.longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name })
    }
  }
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') s.fcp = entry.startTime
      }
    }).observe({ type: 'paint', buffered: true })
  } catch {}
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) s.lcp = Math.max(s.lcp ?? 0, entry.startTime)
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {}
  try {
    new PerformanceObserver(list => addLongTasks(list.getEntries())).observe({ type: 'longtask', buffered: true })
  } catch {}
  const recordReady = () => {
    if (document.documentElement?.dataset.appReady === 'true' && s.appReadyAt === null) {
      s.appReadyAt = performance.now()
    }
  }
  try {
    new MutationObserver(recordReady).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-app-ready']
    })
  } catch {}
  recordReady()
}

function instrumentationScript() {
  const s = window.__s9 = window.__s9 || {}
  s.objectUrls = { created: 0, revoked: 0, active: new Set() }
  const createObjectUrl = URL.createObjectURL.bind(URL)
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = object => {
    const url = createObjectUrl(object)
    s.objectUrls.created += 1
    s.objectUrls.active.add(url)
    return url
  }
  URL.revokeObjectURL = url => {
    s.objectUrls.revoked += 1
    s.objectUrls.active.delete(url)
    return revokeObjectUrl(url)
  }
  s.timers = { set: 0, cleared: 0, fired: 0, pending: new Set() }
  const setTimeoutOriginal = window.setTimeout.bind(window)
  const clearTimeoutOriginal = window.clearTimeout.bind(window)
  window.setTimeout = (callback, delay, ...callbackArgs) => {
    s.timers.set += 1
    let id
    const wrapped = typeof callback === 'function'
      ? () => {
        s.timers.pending.delete(id)
        s.timers.fired += 1
        callback(...callbackArgs)
      }
      : callback
    id = setTimeoutOriginal(wrapped, delay)
    s.timers.pending.add(id)
    return id
  }
  window.clearTimeout = id => {
    s.timers.cleared += 1
    s.timers.pending.delete(id)
    return clearTimeoutOriginal(id)
  }
  s.listeners = { added: 0, removed: 0 }
  const addListener = EventTarget.prototype.addEventListener
  const removeListener = EventTarget.prototype.removeEventListener
  EventTarget.prototype.addEventListener = function (...listenerArgs) {
    s.listeners.added += 1
    return addListener.apply(this, listenerArgs)
  }
  EventTarget.prototype.removeEventListener = function (...listenerArgs) {
    s.listeners.removed += 1
    return removeListener.apply(this, listenerArgs)
  }
  s.clipboardFailures = 0
}

function clipboardFailureScript() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async () => {
        window.__s9 = window.__s9 || {}
        window.__s9.clipboardFailures = (window.__s9.clipboardFailures ?? 0) + 1
        throw new DOMException('s9 synthetic clipboard denial', 'NotAllowedError')
      }
    }
  })
}

async function injectObservers(page) {
  await page.addInitScript(observerScript)
}

async function gotoReady(page, timeout = 30000) {
  await page.goto(baseUrl, { waitUntil: 'load', timeout })
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', { timeout: 15000 })
  await page.waitForTimeout(120)
}

async function readLoadMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const s = window.__s9 || {}
    const resources = performance.getEntriesByType('resource').map(entry => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      durationMs: entry.duration
    }))
    return {
      appReadyAt: s.appReadyAt ?? null,
      fcpMs: s.fcp ?? null,
      lcpMs: s.lcp ?? null,
      domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
      loadEventMs: nav?.loadEventEnd ?? null,
      responseStartMs: nav?.responseStart ?? null,
      durationMs: nav?.duration ?? null,
      longTasks: s.longTasks ?? [],
      longTaskMaxMs: Math.max(0, ...(s.longTasks ?? []).map(entry => entry.duration)),
      longTaskCount: (s.longTasks ?? []).length,
      resources,
      resourceCount: resources.length,
      transferBytes: resources.reduce((total, entry) => total + (entry.transferSize || 0), 0),
      appJsResource: resources.find(entry => entry.name.endsWith('/assets/app.js')) ?? null,
      statusText: document.getElementById('status')?.textContent ?? null,
      statusState: document.getElementById('status')?.dataset.state ?? null,
      gallerySvgs: document.querySelectorAll('#gallery svg').length,
      previewSvgs: document.querySelectorAll('#preview svg').length,
      svgSource: document.getElementById('svg-source')?.value ?? '',
      svgSourceBytes: (document.getElementById('svg-source')?.value ?? '').length,
      appReadyFlag: document.documentElement.dataset.appReady ?? null,
      bodyTextLength: document.body.innerText.length
    }
  })
}

async function cdpMetrics(context, page) {
  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  const result = await session.send('Performance.getMetrics')
  const metrics = Object.fromEntries(result.metrics.map(metric => [metric.name, metric.value]))
  return {
    session,
    metrics: {
      scriptDurationMs: (metrics.ScriptDuration ?? 0) * 1000,
      taskDurationMs: (metrics.TaskDuration ?? 0) * 1000,
      layoutDurationMs: (metrics.LayoutDuration ?? 0) * 1000,
      recalcStyleDurationMs: (metrics.RecalcStyleDuration ?? 0) * 1000,
      jsHeapUsedBytes: metrics.JSHeapUsedSize ?? null,
      jsHeapTotalBytes: metrics.JSHeapTotalSize ?? null,
      documents: metrics.Documents ?? null,
      nodes: metrics.Nodes ?? null,
      listeners: metrics.JSEventListeners ?? null
    }
  }
}

async function heap(session) {
  if (!session) return null
  await session.send('HeapProfiler.collectGarbage').catch(() => {})
  await sleep(120)
  const usage = await session.send('Runtime.getHeapUsage')
  return { usedSize: usage.usedSize, totalSize: usage.totalSize }
}

function checkNoUnexpectedExternal(logs) {
  return logs.requests
    .map(request => request.url)
    .filter(url => !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:') && url !== 'about:blank')
}

async function measureInitialLoad(engine, browser) {
  const chk = checker()
  const runs = []
  for (let run = 1; run <= 5; run += 1) {
    const context = await browser.newContext({
      ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
      acceptDownloads: true
    })
    const page = await context.newPage()
    const logs = attachLogs(page)
    await injectObservers(page)
    const cdp = engine.type === 'chromium' ? await cdpMetrics(context, page) : null
    const navigationStarted = Date.now()
    await gotoReady(page)
    const wallMs = Date.now() - navigationStarted
    const metrics = await readLoadMetrics(page)
    const performanceMetrics = cdp ? (await cdp.session.send('Performance.getMetrics')).metrics : []
    const perf = Object.fromEntries(performanceMetrics.map(metric => [metric.name, metric.value]))
    const row = {
      engine: engine.name,
      run,
      wallMs,
      ...metrics,
      scriptDurationMs: engine.type === 'chromium' ? (perf.ScriptDuration ?? 0) * 1000 : null,
      taskDurationMs: engine.type === 'chromium' ? (perf.TaskDuration ?? 0) * 1000 : null,
      layoutDurationMs: engine.type === 'chromium' ? (perf.LayoutDuration ?? 0) * 1000 : null,
      recalcStyleDurationMs: engine.type === 'chromium' ? (perf.RecalcStyleDuration ?? 0) * 1000 : null,
      jsHeapUsedBytes: engine.type === 'chromium' ? (perf.JSHeapUsedSize ?? null) : null,
      pageErrors: logs.pageErrors,
      requestFailed: logs.requestFailed,
      externalRequests: checkNoUnexpectedExternal(logs),
      consoleErrors: logs.console.filter(message => message.type === 'error')
    }
    runs.push(row)
    if (run === 1 && (engine.name === 'chromium' || engine.name === 'mobile-chromium')) {
      const screenshot = path.join(out, 'artifacts', `s9-01-initial-${engine.name}.png`)
      await fsp.mkdir(path.dirname(screenshot), { recursive: true })
      await page.screenshot({ path: screenshot, fullPage: false })
    }
    await context.close()
    chk.eq(row.appReadyFlag, 'true', `${engine.name} run ${run}: app ready flag`)
    chk.eq(row.statusText, '', `${engine.name} run ${run}: status clears after successful boot`)
    chk.eq(row.gallerySvgs, 8, `${engine.name} run ${run}: eight gallery avatars`)
    chk.eq(row.previewSvgs, 1, `${engine.name} run ${run}: one preview avatar`)
    chk.eq(row.pageErrors.length, 0, `${engine.name} run ${run}: no page errors`)
    chk.eq(row.requestFailed.length, 0, `${engine.name} run ${run}: no failed requests`)
    chk.eq(row.externalRequests.length, 0, `${engine.name} run ${run}: no external requests`)
    chk.ok(Number.isFinite(row.appReadyAt) && row.appReadyAt > 0, `${engine.name} run ${run}: app-ready timestamp recorded`, row.appReadyAt)
    chk.ok(Number.isFinite(row.loadEventMs) && row.loadEventMs > 0, `${engine.name} run ${run}: load event timestamp recorded`, row.loadEventMs)
  }
  return {
    runs,
    stats: {
      appReadyMs: stats(runs.map(run => run.appReadyAt)),
      fcpMs: stats(runs.map(run => run.fcpMs)),
      lcpMs: stats(runs.map(run => run.lcpMs)),
      domContentLoadedMs: stats(runs.map(run => run.domContentLoadedMs)),
      loadEventMs: stats(runs.map(run => run.loadEventMs)),
      longTaskMaxMs: stats(runs.map(run => run.longTaskMaxMs)),
      scriptDurationMs: stats(runs.map(run => run.scriptDurationMs)),
      taskDurationMs: stats(runs.map(run => run.taskDurationMs)),
      transferBytes: stats(runs.map(run => run.transferBytes))
    },
    assertions: chk.list()
  }
}

async function injectLibrary(page) {
  await page.addScriptTag({ url: `${baseUrl}/s9-bench/dither-face.js` })
  await page.waitForFunction(() => Boolean(window.DitherFace?.ditherFace), { timeout: 10000 })
}

async function measureSingleRender(engine, browser) {
  const chk = checker()
  const context = await browser.newContext({
    ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
    acceptDownloads: true
  })
  const page = await context.newPage()
  const logs = attachLogs(page)
  await injectObservers(page)
  await gotoReady(page)
  await injectLibrary(page)
  const result = await page.evaluate(() => {
    const styles = window.DitherFace.STYLES.map(style => style.slug)
    const warmup = 8
    const samples = []
    for (let index = 0; index < warmup; index += 1) {
      window.DitherFace.ditherFace(`warmup-${index}`, { style: styles[index % styles.length], px: 80 })
    }
    for (let index = 0; index < 60; index += 1) {
      const style = styles[index % styles.length]
      const seed = `single-${index}`
      const name = index % 3 === 0 ? 'Ada' : undefined
      const before = performance.now()
      const svg = window.DitherFace.ditherFace(seed, { style, px: 80, name })
      const afterGenerate = performance.now()
      const preview = document.getElementById('preview')
      preview.innerHTML = svg
      preview.getBoundingClientRect()
      const afterDom = performance.now()
      samples.push({
        index,
        style,
        pureMs: afterGenerate - before,
        domMs: afterDom - afterGenerate,
        bytes: svg.length
      })
    }
    return { samples, styles }
  })
  const byStyle = Object.fromEntries(result.styles.map(style => {
    const values = result.samples.filter(sample => sample.style === style)
    return [style, {
      pureMs: stats(values.map(sample => sample.pureMs)),
      domMs: stats(values.map(sample => sample.domMs)),
      bytes: stats(values.map(sample => sample.bytes))
    }]
  }))
  const row = {
    engine: engine.name,
    samples: result.samples,
    byStyle,
    stats: {
      pureMs: stats(result.samples.map(sample => sample.pureMs)),
      domMs: stats(result.samples.map(sample => sample.domMs)),
      bytes: stats(result.samples.map(sample => sample.bytes))
    },
    pageErrors: logs.pageErrors,
    requestFailed: logs.requestFailed,
    consoleErrors: logs.console.filter(message => message.type === 'error')
  }
  await context.close()
  chk.eq(row.pageErrors.length, 0, `${engine.name}: no page errors during render samples`)
  chk.eq(row.stats.pureMs.count, 60, `${engine.name}: 60 single-render samples`)
  chk.ok(row.stats.pureMs.max > 0, `${engine.name}: single-render timing has a measurable non-zero sample`, row.stats.pureMs)
  if (row.stats.pureMs.p95 === 0) {
    chk.note(`${engine.name}: render timer resolution produced a zero p95`, { maxMs: row.stats.pureMs.max, samples: row.stats.pureMs.count })
  }
  return { row, assertions: chk.list() }
}

async function measureBatch(engine, browser, n, rounds) {
  const chk = checker()
  const context = await browser.newContext({
    ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
    acceptDownloads: true
  })
  const page = await context.newPage()
  const logs = attachLogs(page)
  await injectObservers(page)
  await gotoReady(page)
  await injectLibrary(page)
  await page.evaluate(() => {
    const host = document.createElement('div')
    host.id = 's9-bench-host'
    host.className = 'gallery'
    host.setAttribute('aria-hidden', 'true')
    document.body.append(host)
    window.__s9RenderBatch = (count, offset) => {
      const styles = window.DitherFace.STYLES.map(style => style.slug)
      const hostElement = document.getElementById('s9-bench-host')
      hostElement.innerHTML = ''
      const started = performance.now()
      const strings = []
      for (let index = 0; index < count; index += 1) {
        const style = styles[(offset + index) % styles.length]
        const seed = `batch-${offset + index}`
        const name = index % 4 === 0 ? 'Ada' : undefined
        strings.push(window.DitherFace.ditherFace(seed, { style, px: 48, name }))
      }
      const generated = performance.now()
      hostElement.innerHTML = strings.join('')
      const parsed = performance.now()
      hostElement.getBoundingClientRect()
      const laidOut = performance.now()
      return {
        count,
        generateMs: generated - started,
        parseMs: parsed - generated,
        layoutMs: laidOut - parsed,
        totalMs: laidOut - started,
        perAvatarMs: (laidOut - started) / count,
        svgBytes: strings.reduce((total, string) => total + string.length, 0),
        nodes: hostElement.querySelectorAll('svg').length
      }
    }
  })
  for (let warmup = 0; warmup < 3; warmup += 1) {
    await page.evaluate(({ count, offset }) => window.__s9RenderBatch(count, offset), { count: Math.min(n, 10), offset: warmup * 13 })
  }
  const batchRuns = []
  for (let round = 1; round <= rounds; round += 1) {
    await page.evaluate(() => { window.__s9.longTasks.length = 0 })
    const row = await page.evaluate(({ count, offset }) => window.__s9RenderBatch(count, offset), { count: n, offset: round * 100000 })
    await page.waitForTimeout(80)
    row.round = round
    row.longTasks = await page.evaluate(() => window.__s9.longTasks.slice())
    row.longTaskMaxMs = Math.max(0, ...row.longTasks.map(entry => entry.duration))
    row.longTaskCount = row.longTasks.length
    batchRuns.push(row)
    chk.eq(row.nodes, n, `${engine.name} batch ${n} round ${round}: expected SVG nodes`)
    chk.ok(row.svgBytes > 0, `${engine.name} batch ${n} round ${round}: SVG bytes recorded`, row.svgBytes)
    chk.ok(row.totalMs > 0, `${engine.name} batch ${n} round ${round}: total time recorded`, row.totalMs)
  }
  const result = {
    engine: engine.name,
    n,
    rounds: batchRuns,
    stats: {
      generateMs: stats(batchRuns.map(row => row.generateMs)),
      parseMs: stats(batchRuns.map(row => row.parseMs)),
      layoutMs: stats(batchRuns.map(row => row.layoutMs)),
      totalMs: stats(batchRuns.map(row => row.totalMs)),
      perAvatarMs: stats(batchRuns.map(row => row.perAvatarMs)),
      svgBytes: stats(batchRuns.map(row => row.svgBytes)),
      longTaskMaxMs: stats(batchRuns.map(row => row.longTaskMaxMs))
    },
    pageErrors: logs.pageErrors,
    requestFailed: logs.requestFailed
  }
  await context.close()
  chk.eq(result.pageErrors.length, 0, `${engine.name} batch ${n}: no page errors`)
  return { row: result, assertions: chk.list() }
}

async function measureSustainedFunctional(engine, browser) {
  const chk = checker()
  const context = await browser.newContext({
    ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
    acceptDownloads: true
  })
  const page = await context.newPage()
  const logs = attachLogs(page)
  await injectObservers(page)
  await page.addInitScript(instrumentationScript)
  await gotoReady(page)
  await injectLibrary(page)
  await page.evaluate(() => { window.__s9.longTasks.length = 0 })
  const sustained = await page.evaluate(async () => {
    const seed = document.getElementById('seed')
    const name = document.getElementById('name')
    const size = document.getElementById('size')
    const buttons = [...document.querySelectorAll('#gallery button')]
    const started = performance.now()
    for (let index = 0; index < 1000; index += 1) {
      const kind = index % 4
      if (kind === 0) {
        seed.value = `sustained-seed-${index}`
        seed.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (kind === 1) {
        name.value = index % 2 === 0 ? 'Ada' : 'Élodie'
        name.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (kind === 2) {
        buttons[index % buttons.length].click()
      } else {
        size.value = ['48', '80', '128', '192'][index % 4]
        size.dispatchEvent(new Event('change', { bubbles: true }))
      }
      if (index % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    seed.value = 's9-final'
    seed.dispatchEvent(new Event('input', { bubbles: true }))
    name.value = 'Final'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    buttons.find(button => button.dataset.style === 'ascii-letter').click()
    size.value = '128'
    size.dispatchEvent(new Event('change', { bubbles: true }))
    const elapsedMs = performance.now() - started
    const expected = window.DitherFace.ditherFace('s9-final', { style: 'ascii-letter', px: 128, name: 'Final' })
    const source = document.getElementById('svg-source').value
    const preview = document.getElementById('preview').innerHTML
    function normalized(svg) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      doc.documentElement.removeAttribute('aria-hidden')
      return doc.documentElement.outerHTML
    }
    return {
      elapsedMs,
      expectedBytes: expected.length,
      sourceMatches: source === expected,
      previewMatches: normalized(preview) === normalized(expected),
      statusText: document.getElementById('status').textContent,
      pendingTimers: window.__s9.timers.pending.size,
      timerSet: window.__s9.timers.set,
      timerFired: window.__s9.timers.fired,
      listenerAdds: window.__s9.listeners.added,
      gallerySvgs: document.querySelectorAll('#gallery svg').length,
      previewSvgs: document.querySelectorAll('#preview svg').length
    }
  })
  const staleMutations = await page.evaluate(async () => {
    const preview = document.getElementById('preview')
    let count = 0
    const observer = new MutationObserver(records => { count += records.length })
    observer.observe(preview, { childList: true, subtree: true, characterData: true, attributes: true })
    await new Promise(resolve => setTimeout(resolve, 600))
    observer.disconnect()
    return count
  })
  const longTasks = await page.evaluate(() => window.__s9.longTasks.slice())
  const historyRateLimitErrors = logs.pageErrors.filter(error => error.includes('history.replaceState() more than 100 times per 10 seconds'))
  const unexpectedPageErrors = logs.pageErrors.filter(error => !error.includes('history.replaceState() more than 100 times per 10 seconds'))
  const result = {
    engine: engine.name,
    sustained,
    staleMutations,
    longTasks,
    longTaskMaxMs: Math.max(0, ...longTasks.map(entry => entry.duration)),
    longTaskCount: longTasks.length,
    pageErrors: logs.pageErrors,
    historyRateLimitErrors: historyRateLimitErrors.length,
    unexpectedPageErrors,
    requestFailed: logs.requestFailed
  }
  await context.close()
  chk.eq(result.sustained.sourceMatches, true, `${engine.name}: sustained changes end on the last requested state`)
  chk.eq(result.sustained.previewMatches, true, `${engine.name}: preview matches the final source`)
  chk.eq(result.sustained.statusText, '', `${engine.name}: sustained changes leave the status clear`)
  chk.eq(result.sustained.gallerySvgs, 8, `${engine.name}: gallery remains eight avatars after sustained changes`)
  chk.eq(result.sustained.previewSvgs, 1, `${engine.name}: preview remains one avatar after sustained changes`)
  chk.eq(result.staleMutations, 0, `${engine.name}: no stale render mutation after the final state`)
  chk.eq(result.sustained.pendingTimers, 0, `${engine.name}: no pending timers after sustained changes`, result.sustained.pendingTimers)
  chk.eq(result.unexpectedPageErrors.length, 0, `${engine.name}: no unexpected page errors during sustained changes`, result.unexpectedPageErrors.slice(0, 3))
  if (result.historyRateLimitErrors > 0) {
    chk.note(`${engine.name}: browser history rate limit observed`, { count: result.historyRateLimitErrors })
  }
  return { row: result, assertions: chk.list() }
}

async function measureObjectUrlsAndClipboard(engine, browser) {
  const chk = checker()
  const context = await browser.newContext({
    ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
    acceptDownloads: true
  })
  const page = await context.newPage()
  const logs = attachLogs(page)
  await injectObservers(page)
  await page.addInitScript(instrumentationScript)
  await page.addInitScript(clipboardFailureScript)
  await gotoReady(page)
  const downloadResult = { cycles: 10, completed: 0, events: [], failures: [], bytes: null, statusAfter: null }
  const initialSource = await page.locator('#svg-source').inputValue()
  for (let index = 0; index < downloadResult.cycles; index += 1) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('#download-svg')
      ])
      downloadResult.completed += 1
      downloadResult.events.push({ index, suggestedFilename: download.suggestedFilename() })
      if (index === 0) {
        const downloadPath = await download.path()
        if (downloadPath) downloadResult.bytes = await fsp.readFile(downloadPath)
      }
    } catch (error) {
      downloadResult.failures.push({ index, error: error.stack || String(error) })
      break
    }
  }
  await page.waitForTimeout(1600)
  const downloadState = await page.evaluate(() => ({
    created: window.__s9.objectUrls.created,
    revoked: window.__s9.objectUrls.revoked,
    active: window.__s9.objectUrls.active.size,
    pendingTimers: window.__s9.timers.pending.size,
    statusText: document.getElementById('status').textContent,
    source: document.getElementById('svg-source').value
  }))
  downloadResult.statusAfter = downloadState.statusText
  downloadResult.state = downloadState
  downloadResult.exactBytes = downloadResult.bytes ? downloadResult.bytes.toString('utf8') === initialSource : null

  const clipboardBefore = await page.evaluate(() => window.__s9.listeners.added)
  const clipboard = await page.evaluate(async () => {
    const svg = document.getElementById('svg-source').value
    const usage = document.getElementById('usage').textContent
    const share = location.href
    const results = {}
    const buttons = ['copy-svg', 'copy-code', 'share']
    for (const id of buttons) {
      const expected = id === 'copy-svg' ? svg : id === 'copy-code' ? usage : share
      for (let index = 0; index < (id === 'copy-svg' ? 34 : 33); index += 1) {
        document.getElementById(id).click()
        if (index % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0))
      }
      await new Promise(resolve => setTimeout(resolve, 50))
      results[id] = {
        expected,
        manualValue: document.getElementById('manual-copy').value,
        panelOpen: document.getElementById('manual-panel').open,
        focused: document.activeElement === document.getElementById('manual-copy'),
        statusText: document.getElementById('status').textContent
      }
    }
    const expectedFinal = share
    return {
      results,
      clicks: 100,
      clipboardFailures: window.__s9.clipboardFailures,
      pendingTimers: window.__s9.timers.pending.size,
      listenerAdds: window.__s9.listeners.added,
      manualValue: document.getElementById('manual-copy').value,
      expectedFinal,
      statusText: document.getElementById('status').textContent,
      panelOpen: document.getElementById('manual-panel').open,
      focused: document.activeElement === document.getElementById('manual-copy')
    }
  })
  clipboard.listenerDelta = clipboard.listenerAdds - clipboardBefore
  const afterClipboard = await page.evaluate(async () => {
    const seed = document.getElementById('seed')
    seed.value = 'after-clipboard'
    seed.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 50))
    return {
      statusText: document.getElementById('status').textContent,
      panelOpen: document.getElementById('manual-panel').open,
      sourceBytes: document.getElementById('svg-source').value.length
    }
  })
  const result = {
    engine: engine.name,
    downloads: downloadResult,
    clipboard: { ...clipboard, afterClipboard },
    pageErrors: logs.pageErrors,
    requestFailed: logs.requestFailed,
    consoleErrors: logs.console.filter(message => message.type === 'error')
  }
  await context.close()
  chk.eq(downloadResult.completed, downloadResult.cycles, `${engine.name}: all object-URL download cycles completed`)
  chk.eq(downloadResult.failures.length, 0, `${engine.name}: no download cycle failures`)
  chk.eq(downloadState.created, downloadResult.cycles, `${engine.name}: one object URL created per download`)
  chk.eq(downloadState.revoked, downloadResult.cycles, `${engine.name}: one object URL revoked per download`)
  chk.eq(downloadState.active, 0, `${engine.name}: no active object URLs after revocation`)
  chk.eq(downloadState.pendingTimers, 0, `${engine.name}: no pending revoke timers after cycle`)
  chk.eq(downloadResult.exactBytes, true, `${engine.name}: downloaded bytes equal the displayed SVG source`)
  chk.ok(String(downloadResult.statusAfter).includes('SVG downloaded.'), `${engine.name}: download success message`, downloadResult.statusAfter)
  chk.eq(clipboard.clicks, 100, `${engine.name}: 100 clipboard failure clicks`)
  chk.eq(clipboard.clipboardFailures, 100, `${engine.name}: every clipboard write failed as injected`)
  chk.eq(clipboard.listenerDelta, 0, `${engine.name}: clipboard failure loop adds no event listeners`, clipboard.listenerDelta)
  chk.eq(clipboard.pendingTimers, 0, `${engine.name}: clipboard failure loop leaves no pending timers`, clipboard.pendingTimers)
  chk.eq(clipboard.panelOpen, true, `${engine.name}: clipboard failure leaves the manual panel open`)
  chk.eq(clipboard.focused, true, `${engine.name}: clipboard failure focuses the manual copy field`)
  chk.ok(String(clipboard.statusText).includes('Clipboard unavailable'), `${engine.name}: clipboard failure message`, clipboard.statusText)
  for (const id of ['copy-svg', 'copy-code', 'share']) {
    const item = clipboard.results[id]
    chk.eq(item.manualValue, item.expected, `${engine.name}: ${id} failure fills the expected manual text`)
    chk.eq(item.panelOpen, true, `${engine.name}: ${id} failure opens the manual panel`)
    chk.ok(String(item.statusText).includes('Clipboard unavailable'), `${engine.name}: ${id} failure message`, item.statusText)
  }
  chk.eq(afterClipboard.statusText, '', `${engine.name}: a new render clears the clipboard failure message`)
  chk.eq(afterClipboard.panelOpen, false, `${engine.name}: a new render closes the manual panel`)
  chk.eq(result.pageErrors.length, 0, `${engine.name}: no page errors during object URL/clipboard stress`)
  return { row: result, assertions: chk.list() }
}

async function measureMemoryChromium(browser, sessionIndex) {
  const chk = checker()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const page = await context.newPage()
  const logs = attachLogs(page)
  await injectObservers(page)
  await page.addInitScript(instrumentationScript)
  await page.addInitScript(clipboardFailureScript)
  await gotoReady(page)
  await injectLibrary(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const heap0 = await heap(cdp)
  async function runChanges(count, offset) {
    return page.evaluate(async ({ count, offset }) => {
      const seed = document.getElementById('seed')
      const name = document.getElementById('name')
      const size = document.getElementById('size')
      const buttons = [...document.querySelectorAll('#gallery button')]
      const started = performance.now()
      for (let index = 0; index < count; index += 1) {
        const kind = (offset + index) % 4
        if (kind === 0) {
          seed.value = `memory-seed-${offset + index}`
          seed.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (kind === 1) {
          name.value = index % 2 === 0 ? 'Ada' : 'Élodie'
          name.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (kind === 2) {
          buttons[index % buttons.length].click()
        } else {
          size.value = ['48', '80', '128', '192'][index % 4]
          size.dispatchEvent(new Event('change', { bubbles: true }))
        }
        if (index % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0))
      }
      return { count, elapsedMs: performance.now() - started }
    }, { count, offset })
  }
  const mid = await runChanges(500, 0)
  const heap1 = await heap(cdp)
  const end = await runChanges(500, 500)
  const heap2 = await heap(cdp)
  const rapid = await page.evaluate(() => {
    const seed = document.getElementById('seed')
    const name = document.getElementById('name')
    const size = document.getElementById('size')
    const buttons = [...document.querySelectorAll('#gallery button')]
    const started = performance.now()
    for (let index = 0; index < 500; index += 1) {
      const kind = index % 4
      if (kind === 0) {
        seed.value = `rapid-${index}`
        seed.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (kind === 1) {
        name.value = index % 2 === 0 ? 'Rapid' : 'Ada'
        name.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (kind === 2) {
        buttons[index % buttons.length].click()
      } else {
        size.value = ['48', '80', '128', '192'][index % 4]
        size.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
    return { count: 500, elapsedMs: performance.now() - started }
  })
  const heap3 = await heap(cdp)
  const finalState = await page.evaluate(() => {
    const seed = document.getElementById('seed')
    const name = document.getElementById('name')
    const size = document.getElementById('size')
    const buttons = [...document.querySelectorAll('#gallery button')]
    seed.value = 'memory-final'
    seed.dispatchEvent(new Event('input', { bubbles: true }))
    name.value = 'Final'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    buttons.find(button => button.dataset.style === 'ascii-face').click()
    size.value = '192'
    size.dispatchEvent(new Event('change', { bubbles: true }))
    const expected = window.DitherFace.ditherFace('memory-final', { style: 'ascii-face', px: 192, name: 'Final' })
    function normalized(svg) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      doc.documentElement.removeAttribute('aria-hidden')
      return doc.documentElement.outerHTML
    }
    return {
      sourceMatches: document.getElementById('svg-source').value === expected,
      previewMatches: normalized(document.getElementById('preview').innerHTML) === normalized(expected),
      expectedBytes: expected.length
    }
  })
  const downloadsBefore = await page.evaluate(() => ({ created: window.__s9.objectUrls.created, revoked: window.__s9.objectUrls.revoked }))
  for (let index = 0; index < 10; index += 1) {
    await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('#download-svg')
    ])
  }
  await page.waitForTimeout(1600)
  const heap4 = await heap(cdp)
  const objectUrlState = await page.evaluate(() => ({
    created: window.__s9.objectUrls.created,
    revoked: window.__s9.objectUrls.revoked,
    active: window.__s9.objectUrls.active.size,
    pendingTimers: window.__s9.timers.pending.size
  }))
  const clipboardBefore = await page.evaluate(() => window.__s9.listeners.added)
  await page.evaluate(async () => {
    for (let index = 0; index < 100; index += 1) {
      document.getElementById(index % 2 === 0 ? 'copy-svg' : 'share').click()
      if (index % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
  })
  await page.waitForTimeout(120)
  const heap5 = await heap(cdp)
  const clipboardState = await page.evaluate(() => ({
    failures: window.__s9.clipboardFailures,
    pendingTimers: window.__s9.timers.pending.size,
    listenerAdds: window.__s9.listeners.added,
    statusText: document.getElementById('status').textContent,
    panelOpen: document.getElementById('manual-panel').open
  }))
  clipboardState.listenerDelta = clipboardState.listenerAdds - clipboardBefore
  const staleMutations = await page.evaluate(async () => {
    const preview = document.getElementById('preview')
    let count = 0
    const observer = new MutationObserver(records => { count += records.length })
    observer.observe(preview, { childList: true, subtree: true, characterData: true, attributes: true })
    await new Promise(resolve => setTimeout(resolve, 600))
    observer.disconnect()
    return count
  })
  const result = {
    session: sessionIndex,
    heap: {
      start: heap0,
      after500: heap1,
      after1000: heap2,
      afterRapid: heap3,
      afterDownloads: heap4,
      afterClipboard: heap5,
      deltaSustainedBytes: (heap2?.usedSize ?? 0) - (heap0?.usedSize ?? 0),
      deltaRapidBytes: (heap3?.usedSize ?? 0) - (heap0?.usedSize ?? 0),
      deltaDownloadsBytes: (heap4?.usedSize ?? 0) - (heap3?.usedSize ?? 0),
      deltaClipboardBytes: (heap5?.usedSize ?? 0) - (heap4?.usedSize ?? 0)
    },
    mid,
    end,
    rapid,
    finalState,
    objectUrlState,
    downloads: { cycles: 10, ...downloadsBefore },
    clipboardState,
    staleMutations,
    pageErrors: logs.pageErrors,
    requestFailed: logs.requestFailed
  }
  await context.close()
  chk.eq(result.finalState.sourceMatches, true, `memory session ${sessionIndex}: final source matches the last state`)
  chk.eq(result.finalState.previewMatches, true, `memory session ${sessionIndex}: final preview matches the last state`)
  chk.eq(result.staleMutations, 0, `memory session ${sessionIndex}: no stale render mutation`)
  chk.eq(result.objectUrlState.created - downloadsBefore.created, 10, `memory session ${sessionIndex}: 10 object URLs created`)
  chk.eq(result.objectUrlState.revoked - downloadsBefore.revoked, 10, `memory session ${sessionIndex}: 10 object URLs revoked`)
  chk.eq(result.objectUrlState.active, 0, `memory session ${sessionIndex}: no active object URLs`)
  chk.eq(result.objectUrlState.pendingTimers, 0, `memory session ${sessionIndex}: no pending revoke timers`)
  chk.eq(result.clipboardState.failures, 100, `memory session ${sessionIndex}: 100 clipboard failures`)
  chk.eq(result.clipboardState.listenerDelta, 0, `memory session ${sessionIndex}: no listener growth`)
  chk.eq(result.clipboardState.pendingTimers, 0, `memory session ${sessionIndex}: no pending clipboard timers`)
  chk.eq(result.pageErrors.length, 0, `memory session ${sessionIndex}: no page errors`)
  return { row: result, assertions: chk.list() }
}

async function measureThrottleChromium(browser) {
  const chk = checker()
  const networkRuns = []
  for (let run = 1; run <= 3; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
    const page = await context.newPage()
    const logs = attachLogs(page)
    await injectObservers(page)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
      connectionType: 'cellular3g'
    })
    await gotoReady(page)
    const metrics = await readLoadMetrics(page)
    networkRuns.push({
      run,
      appReadyMs: metrics.appReadyAt,
      fcpMs: metrics.fcpMs,
      lcpMs: metrics.lcpMs,
      loadEventMs: metrics.loadEventMs,
      longTaskMaxMs: metrics.longTaskMaxMs,
      longTaskCount: metrics.longTaskCount,
      transferBytes: metrics.transferBytes,
      statusText: metrics.statusText,
      gallerySvgs: metrics.gallerySvgs,
      pageErrors: logs.pageErrors,
      requestFailed: logs.requestFailed
    })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    }).catch(() => {})
    await context.close()
    chk.eq(networkRuns.at(-1).statusText, '', `throttled network run ${run}: app ready`)
    chk.eq(networkRuns.at(-1).gallerySvgs, 8, `throttled network run ${run}: gallery rendered`)
    chk.eq(networkRuns.at(-1).pageErrors.length, 0, `throttled network run ${run}: no page errors`)
  }
  const cpuRuns = []
  for (let run = 1; run <= 3; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
    const page = await context.newPage()
    const logs = attachLogs(page)
    await injectObservers(page)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await gotoReady(page)
    await page.evaluate(() => { window.__s9.longTasks.length = 0 })
    const interactions = await page.evaluate(async () => {
      const seed = document.getElementById('seed')
      const name = document.getElementById('name')
      const size = document.getElementById('size')
      const buttons = [...document.querySelectorAll('#gallery button')]
      const started = performance.now()
      for (let index = 0; index < 50; index += 1) {
        const kind = index % 4
        if (kind === 0) {
          seed.value = `throttle-${index}`
          seed.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (kind === 1) {
          name.value = index % 2 === 0 ? 'Throttle' : 'Ada'
          name.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (kind === 2) {
          buttons[index % buttons.length].click()
        } else {
          size.value = ['48', '80', '128', '192'][index % 4]
          size.dispatchEvent(new Event('change', { bubbles: true }))
        }
        if (index % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0))
      }
      return { elapsedMs: performance.now() - started }
    })
    await page.waitForTimeout(100)
    const longTasks = await page.evaluate(() => window.__s9.longTasks.slice())
    const metrics = await readLoadMetrics(page)
    cpuRuns.push({
      run,
      interactionsMs: interactions.elapsedMs,
      appReadyMs: metrics.appReadyAt,
      longTaskMaxMs: Math.max(0, ...longTasks.map(entry => entry.duration)),
      longTaskCount: longTasks.length,
      pageErrors: logs.pageErrors,
      requestFailed: logs.requestFailed
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
    await context.close()
    chk.eq(cpuRuns.at(-1).pageErrors.length, 0, `throttled CPU run ${run}: no page errors`)
    chk.ok(cpuRuns.at(-1).interactionsMs > 0, `throttled CPU run ${run}: interactions measured`, cpuRuns.at(-1).interactionsMs)
  }
  const result = {
    network: {
      settings: { latencyMs: 400, downloadKbps: 500, uploadKbps: 500, connectionType: 'cellular3g' },
      runs: networkRuns,
      stats: {
        appReadyMs: stats(networkRuns.map(run => run.appReadyMs)),
        fcpMs: stats(networkRuns.map(run => run.fcpMs)),
        lcpMs: stats(networkRuns.map(run => run.lcpMs)),
        loadEventMs: stats(networkRuns.map(run => run.loadEventMs)),
        longTaskMaxMs: stats(networkRuns.map(run => run.longTaskMaxMs))
      }
    },
    cpu: {
      settings: { rate: 4 },
      runs: cpuRuns,
      stats: {
        interactionsMs: stats(cpuRuns.map(run => run.interactionsMs)),
        appReadyMs: stats(cpuRuns.map(run => run.appReadyMs)),
        longTaskMaxMs: stats(cpuRuns.map(run => run.longTaskMaxMs))
      }
    }
  }
  return { row: result, assertions: chk.list() }
}

async function blockedAssetRun(engine, browser, pattern, label, requireAttempt = true) {
  const chk = checker()
  const context = await browser.newContext({
    ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
    acceptDownloads: true
  })
  const page = await context.newPage()
  const logs = attachLogs(page)
  let attempts = 0
  await context.route(pattern, route => {
    attempts += 1
    route.abort('failed')
  })
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1800)
  const first = await page.evaluate(() => ({
    statusText: document.getElementById('status')?.textContent ?? null,
    statusState: document.getElementById('status')?.dataset.state ?? null,
    appReadyFlag: document.documentElement.dataset.appReady ?? null,
    gallerySvgs: document.querySelectorAll('#gallery svg').length,
    previewSvgs: document.querySelectorAll('#preview svg').length,
    disabledControls: [...document.querySelectorAll('#seed, #name, #size, #copy-svg, #download-svg, #copy-code, #share')].filter(element => element.disabled).length,
    bodyTextLength: document.body.innerText.length
  }))
  await page.waitForTimeout(2500)
  const afterWaitAttempts = attempts
  const result = {
    engine: engine.name,
    label,
    pattern,
    attempts,
    afterWaitAttempts,
    first,
    pageErrors: logs.pageErrors,
    requestFailed: logs.requestFailed,
    consoleErrors: logs.console.filter(message => message.type === 'error')
  }
  await context.close()
  if (requireAttempt) chk.ok(result.attempts >= 1 && result.attempts <= 2, `${engine.name} ${label}: one bounded request attempt with at most one browser retry`, result.attempts)
  else chk.ok(result.attempts <= 1, `${engine.name} ${label}: zero or one request attempt`, result.attempts)
  chk.eq(result.afterWaitAttempts, result.attempts, `${engine.name} ${label}: no retry after waiting`)
  if (result.attempts > 1) chk.note(`${engine.name} ${label}: browser retried once`, { attempts: result.attempts })
  return { row: result, assertions: chk.list() }
}

async function measureResilience(engine, browser) {
  const chk = checker()
  const blocked = {}
  blocked.appJs = await blockedAssetRun(engine, browser, '**/assets/app.js', 'app.js')
  chk.list().push(...blocked.appJs.assertions)
  chk.eq(blocked.appJs.row.first.appReadyFlag, null, `${engine.name} app.js blocked: no app-ready flag`)
  chk.eq(blocked.appJs.row.first.gallerySvgs, 0, `${engine.name} app.js blocked: no blank gallery presented as rendered`)
  chk.eq(blocked.appJs.row.first.previewSvgs, 0, `${engine.name} app.js blocked: no preview presented as rendered`)
  chk.ok(blocked.appJs.row.first.disabledControls >= 7, `${engine.name} app.js blocked: controls stay disabled`, blocked.appJs.row.first.disabledControls)
  chk.ok(String(blocked.appJs.row.first.statusText).includes('could not start'), `${engine.name} app.js blocked: clear failure message`, blocked.appJs.row.first.statusText)
  chk.ok(blocked.appJs.row.first.bodyTextLength > 500, `${engine.name} app.js blocked: documentation remains readable`, blocked.appJs.row.first.bodyTextLength)
  chk.ok(blocked.appJs.row.first.disabledControls > 0 || blocked.appJs.row.first.gallerySvgs === 0, `${engine.name} app.js blocked: no false success state`)

  const offlineContext = await browser.newContext({
    ...(engine.device ? engine.deviceOptions : { viewport: { width: 1280, height: 800 } }),
    acceptDownloads: true
  })
  const offlinePage = await offlineContext.newPage()
  const offlineLogs = attachLogs(offlinePage)
  await injectObservers(offlinePage)
  await gotoReady(offlinePage)
  await offlineContext.setOffline(true)
  const offline = await offlinePage.evaluate(async () => {
    const seed = document.getElementById('seed')
    const size = document.getElementById('size')
    seed.value = 'offline-after-load'
    seed.dispatchEvent(new Event('input', { bubbles: true }))
    size.value = '128'
    size.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 120))
    return {
      statusText: document.getElementById('status').textContent,
      sourceBytes: document.getElementById('svg-source').value.length,
      gallerySvgs: document.querySelectorAll('#gallery svg').length,
      previewSvgs: document.querySelectorAll('#preview svg').length,
      appReadyFlag: document.documentElement.dataset.appReady ?? null
    }
  })
  let offlineDownload = null
  try {
    const [download] = await Promise.all([
      offlinePage.waitForEvent('download', { timeout: 10000 }),
      offlinePage.click('#download-svg')
    ])
    offlineDownload = { suggestedFilename: download.suggestedFilename() }
  } catch (error) {
    offlineDownload = { error: error.stack || String(error) }
  }
  await offlineContext.setOffline(false)
  await offlineContext.close()
  chk.eq(offline.appReadyFlag, 'true', `${engine.name}: offline after load keeps the app ready`)
  chk.eq(offline.gallerySvgs, 8, `${engine.name}: offline after load keeps the gallery rendered`)
  chk.eq(offline.previewSvgs, 1, `${engine.name}: offline after load keeps the preview rendered`)
  chk.eq(offline.statusText, '', `${engine.name}: offline after load leaves the status clear`)
  chk.ok(offline.sourceBytes > 0, `${engine.name}: offline after load still renders SVG`, offline.sourceBytes)
  chk.eq(offlineLogs.pageErrors.length, 0, `${engine.name}: offline after load has no page errors`)
  chk.eq(offlineLogs.requestFailed.length, 0, `${engine.name}: offline after load makes no network requests`)
  chk.eq(offlineDownload.error, undefined, `${engine.name}: download works offline after load`, offlineDownload)

  return {
    row: { engine: engine.name, blocked, offline: { ...offline, download: offlineDownload, pageErrors: offlineLogs.pageErrors, requestFailed: offlineLogs.requestFailed } },
    assertions: chk.list()
  }
}

async function measureAdditionalResilienceChromium(browser) {
  const chk = checker()
  const css = await blockedAssetRun({ name: 'chromium', type: 'chromium' }, browser, '**/site.css', 'site.css')
  chk.list().push(...css.assertions)
  chk.eq(css.row.first.appReadyFlag, 'true', 'chromium site.css blocked: app still ready')
  chk.eq(css.row.first.gallerySvgs, 8, 'chromium site.css blocked: gallery still renders')
  chk.eq(css.row.first.statusText, '', 'chromium site.css blocked: no false failure status')
  const bootstrap = await blockedAssetRun({ name: 'chromium', type: 'chromium' }, browser, '**/bootstrap.js', 'bootstrap.js')
  chk.list().push(...bootstrap.assertions)
  chk.eq(bootstrap.row.first.appReadyFlag, 'true', 'chromium bootstrap.js blocked: app still ready')
  chk.eq(bootstrap.row.first.gallerySvgs, 8, 'chromium bootstrap.js blocked: gallery still renders')
  const favicon = await blockedAssetRun({ name: 'chromium', type: 'chromium' }, browser, '**/favicon.svg', 'favicon.svg', false)
  chk.list().push(...favicon.assertions)
  chk.eq(favicon.row.first.appReadyFlag, 'true', 'chromium favicon.svg blocked: app still ready')
  chk.eq(favicon.row.first.gallerySvgs, 8, 'chromium favicon.svg blocked: gallery still renders')

  const bootContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const bootPage = await bootContext.newPage()
  const bootLogs = attachLogs(bootPage)
  await bootPage.addInitScript(() => {
    Object.defineProperty(window, 'URLSearchParams', {
      configurable: true,
      value: class {
        constructor() {
          throw new Error('s9 synthetic boot failure')
        }
      }
    })
  })
  await bootPage.goto(baseUrl, { waitUntil: 'load', timeout: 30000 })
  await bootPage.waitForTimeout(1500)
  const bootThrow = await bootPage.evaluate(() => ({
    statusText: document.getElementById('status')?.textContent ?? null,
    statusState: document.getElementById('status')?.dataset.state ?? null,
    appReadyFlag: document.documentElement.dataset.appReady ?? null,
    gallerySvgs: document.querySelectorAll('#gallery svg').length,
    disabledControls: [...document.querySelectorAll('#seed, #name, #size, #copy-svg, #download-svg, #copy-code, #share')].filter(element => element.disabled).length
  }))
  await bootContext.close()
  chk.eq(bootThrow.appReadyFlag, null, 'synthetic boot throw: no app-ready flag')
  chk.eq(bootThrow.gallerySvgs, 0, 'synthetic boot throw: no blank gallery presented as rendered')
  chk.ok(bootThrow.disabledControls >= 7, 'synthetic boot throw: controls stay disabled', bootThrow.disabledControls)
  chk.ok(String(bootThrow.statusText).includes('could not start'), 'synthetic boot throw: clear failure message', bootThrow.statusText)
  chk.eq(bootLogs.pageErrors.length, 1, 'synthetic boot throw: one bounded page error', bootLogs.pageErrors)

  const downloadFailureContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const downloadFailurePage = await downloadFailureContext.newPage()
  const downloadFailureLogs = attachLogs(downloadFailurePage)
  await downloadFailurePage.addInitScript(() => {
    URL.createObjectURL = () => { throw new Error('s9 synthetic createObjectURL failure') }
  })
  await gotoReady(downloadFailurePage)
  await downloadFailurePage.click('#download-svg')
  await downloadFailurePage.waitForTimeout(120)
  const downloadFailure = await downloadFailurePage.evaluate(() => ({
    statusText: document.getElementById('status').textContent,
    gallerySvgs: document.querySelectorAll('#gallery svg').length,
    previewSvgs: document.querySelectorAll('#preview svg').length
  }))
  await downloadFailureContext.close()
  chk.ok(String(downloadFailure.statusText).includes('Download unavailable'), 'synthetic download exception: clear failure message', downloadFailure.statusText)
  chk.eq(downloadFailure.gallerySvgs, 8, 'synthetic download exception: gallery remains rendered')
  chk.eq(downloadFailureLogs.pageErrors.length, 0, 'synthetic download exception: no unhandled page error')

  const reloadContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const reloadPage = await reloadContext.newPage()
  const reloadLogs = attachLogs(reloadPage)
  await injectObservers(reloadPage)
  await gotoReady(reloadPage)
  reloadLogs.requests.length = 0
  const reloadCdp = await reloadContext.newCDPSession(reloadPage)
  const heapBefore = await heap(reloadCdp)
  const reloadTimes = []
  for (let index = 0; index < 20; index += 1) {
    const started = Date.now()
    await reloadPage.reload({ waitUntil: 'load', timeout: 30000 })
    await reloadPage.waitForFunction(() => document.documentElement.dataset.appReady === 'true', { timeout: 15000 })
    reloadTimes.push(Date.now() - started)
  }
  const heapAfter = await heap(reloadCdp)
  const appJsRequests = reloadLogs.requests.filter(request => request.url.endsWith('/assets/app.js')).length
  const reload = {
    reloads: 20,
    appJsRequests,
    appJsRequestsPerReload: appJsRequests / 20,
    timesMs: reloadTimes,
    stats: stats(reloadTimes),
    heapBefore,
    heapAfter,
    heapDeltaBytes: (heapAfter?.usedSize ?? 0) - (heapBefore?.usedSize ?? 0),
    pageErrors: reloadLogs.pageErrors,
    requestFailed: reloadLogs.requestFailed,
    finalStatus: await reloadPage.locator('#status').textContent(),
    finalGallerySvgs: await reloadPage.locator('#gallery svg').count()
  }
  await reloadContext.close()
  chk.eq(reload.appJsRequestsPerReload, 1, 'repeated reload: one app.js request per reload, no retry loop')
  chk.eq(reload.pageErrors.length, 0, 'repeated reload: no page errors')
  chk.eq(reload.requestFailed.length, 0, 'repeated reload: no failed requests')
  chk.eq(reload.finalStatus, '', 'repeated reload: final status is clear')
  chk.eq(reload.finalGallerySvgs, 8, 'repeated reload: final gallery is rendered')

  return {
    row: {
      engine: 'chromium',
      css,
      bootstrap,
      favicon,
      bootThrow,
      bootPageErrors: bootLogs.pageErrors,
      downloadFailure,
      downloadFailurePageErrors: downloadFailureLogs.pageErrors,
      reload
    },
    assertions: chk.list()
  }
}

async function measureSizes() {
  const chk = checker()
  const productBundle = await readJson(path.join(out, 'bundle.json'))
  const siteFiles = productBundle.productFiles
  const siteTotals = {
    rawBytes: siteFiles.reduce((total, file) => total + file.rawBytes, 0),
    gzipBytes: siteFiles.reduce((total, file) => total + file.gzipBytes, 0),
    brotliBytes: siteFiles.reduce((total, file) => total + file.brotliBytes, 0)
  }
  const appJs = productBundle.appJs
  const siteCss = productBundle.siteCss
  const bootstrapJs = productBundle.bootstrapJs
  const library = {}
  for (const file of productBundle.libraryFiles) {
    library[file.path] = file
  }

  const { ditherFace, STYLES } = await import(pathToFileURL(path.join(repo, 'dist/index.js')).href)
  const styles = STYLES.map(style => style.slug)
  const seeds = ['dither-face', 'S9 / 東京 & luna', '']
  const svgSamples = []
  for (const style of styles) {
    for (const px of [48, 80, 128, 192]) {
      for (const seed of seeds) {
        const svg = ditherFace(seed, { style, px, name: seed === '' ? 'Ada' : undefined })
        const buffer = Buffer.from(svg, 'utf8')
        svgSamples.push({ style, px, seed, ...bytesInfo(buffer) })
      }
    }
  }
  const svgStats = {
    bytes: stats(svgSamples.map(sample => sample.rawBytes)),
    gzipBytes: stats(svgSamples.map(sample => sample.gzipBytes)),
    brotliBytes: stats(svgSamples.map(sample => sample.brotliBytes)),
    maxSample: svgSamples.reduce((max, sample) => sample.rawBytes > max.rawBytes ? sample : max, svgSamples[0])
  }

  const esbuild = await import('esbuild')
  async function bundleEntry(contents, sourcefile) {
    const result = await esbuild.build({
      stdin: { contents, resolveDir: repo, sourcefile, loader: 'ts' },
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2022'],
      write: false,
      logLevel: 'silent'
    })
    const text = result.outputFiles[0].text
    return { text, ...bytesInfo(Buffer.from(text, 'utf8')) }
  }
  const oneRenderer = await bundleEntry("import { pixelSprite } from './src/styles/pixel-sprite.js'; globalThis.__one = pixelSprite;", 'one-renderer.ts')
  const allRenderers = await bundleEntry("import { ditherFace, STYLES } from './src/index.js'; globalThis.__all = { ditherFace, STYLES };", 'all-renderers.ts')
  const otherSlugs = styles.filter(style => style !== 'pixel-sprite')
  const includedOtherSlugs = otherSlugs.filter(slug => oneRenderer.text.includes(slug))
  const allSlugPresence = styles.filter(slug => allRenderers.text.includes(slug))

  const row = {
    site: { files: siteFiles, totals: siteTotals, appJs, siteCss, bootstrapJs, indexHtml: productBundle.indexHtml },
    library,
    svg: { samples: svgSamples, stats: svgStats },
    treeShake: {
      oneRenderer: { rawBytes: oneRenderer.rawBytes, gzipBytes: oneRenderer.gzipBytes, brotliBytes: oneRenderer.brotliBytes, sha256: oneRenderer.sha256, includedOtherSlugs },
      allRenderers: { rawBytes: allRenderers.rawBytes, gzipBytes: allRenderers.gzipBytes, brotliBytes: allRenderers.brotliBytes, sha256: allRenderers.sha256, includedSlugs: allSlugPresence },
      otherSlugs,
      excludedOtherSlugs: otherSlugs.filter(slug => !oneRenderer.text.includes(slug))
    }
  }
  chk.ok(appJs && appJs.rawBytes > 0, 'site app.js size recorded', appJs)
  chk.ok(siteCss && siteCss.rawBytes > 0, 'site CSS size recorded', siteCss)
  chk.ok(row.svg.samples.length === styles.length * 4 * seeds.length, 'SVG source size samples recorded', row.svg.samples.length)
  chk.eq(includedOtherSlugs.length, 0, 'one-renderer bundle excludes other renderer slugs', includedOtherSlugs)
  chk.ok(allSlugPresence.length === styles.length, 'all-renderer bundle includes every renderer', allSlugPresence)
  return { row, assertions: chk.list() }
}

function compareBudget(actual, budget) {
  if (!Number.isFinite(actual) || !Number.isFinite(budget)) return { status: 'BLOCKED', actual, budget, reason: 'missing or non-finite value' }
  return actual <= budget
    ? { status: 'PASS', actual, budget }
    : { status: 'FAIL', actual, budget }
}

async function measureNegativeControls(browser) {
  const chk = checker()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const page = await context.newPage()
  await page.addInitScript(instrumentationScript)
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', { timeout: 15000 })
  await injectLibrary(page)
  const objectUrl = await page.evaluate(() => {
    const create = URL.createObjectURL
    const revoke = URL.revokeObjectURL
    const cleanA = create(new Blob(['clean-a']))
    const cleanB = create(new Blob(['clean-b']))
    revoke(cleanA)
    revoke(cleanB)
    const clean = {
      created: window.__s9.objectUrls.created,
      revoked: window.__s9.objectUrls.revoked,
      active: window.__s9.objectUrls.active.size
    }
    const leakA = create(new Blob(['leak-a']))
    create(new Blob(['leak-b']))
    revoke(leakA)
    const leaky = {
      created: window.__s9.objectUrls.created,
      revoked: window.__s9.objectUrls.revoked,
      active: window.__s9.objectUrls.active.size
    }
    const detector = state => state.active > 0
    for (const url of [...window.__s9.objectUrls.active]) revoke(url)
    return { clean, leaky, cleanDetected: detector(clean), leakDetected: detector(leaky) }
  })
  const stale = await page.evaluate(async () => {
    const preview = document.getElementById('preview')
    const source = document.getElementById('svg-source')
    function normalized(svg) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      doc.documentElement.removeAttribute('aria-hidden')
      return doc.documentElement.outerHTML
    }
    preview.innerHTML = window.DitherFace.ditherFace('stale-clean', { style: 'pixel-sprite', px: 80 })
    source.value = window.DitherFace.ditherFace('stale-clean', { style: 'pixel-sprite', px: 80 })
    const clean = normalized(preview.innerHTML) === normalized(source.value)
    const cleanDetected = clean
    preview.innerHTML = window.DitherFace.ditherFace('stale-other', { style: 'ascii-letter', px: 128, name: 'Other' })
    const stale = normalized(preview.innerHTML) !== normalized(source.value)
    const staleDetected = stale
    source.value = window.DitherFace.ditherFace('stale-clean', { style: 'pixel-sprite', px: 80 })
    preview.innerHTML = source.value
    return { clean, stale, cleanDetected, staleDetected }
  })
  const queue = await page.evaluate(async () => {
    const clean = { pendingTimers: window.__s9.timers.pending.size, items: [] }
    const bounded = { items: [1] }
    const unbounded = { items: Array.from({ length: 100 }, (_, index) => index) }
    const detector = value => (value.pendingTimers ?? 0) === 0 && value.items.length <= 1
    return {
      clean,
      bounded,
      unbounded,
      cleanDetected: detector(clean),
      boundedDetected: detector(bounded),
      unboundedDetected: detector(unbounded)
    }
  })
  const budget = {
    within: compareBudget(99, 100),
    equal: compareBudget(100, 100),
    over: compareBudget(101, 100),
    missing: compareBudget(101, null)
  }
  await context.close()
  chk.eq(objectUrl.cleanDetected, false, 'NC1 clean object URL state is not flagged as a leak')
  chk.eq(objectUrl.leakDetected, true, 'NC1 leaked object URL is detected')
  chk.eq(stale.cleanDetected, true, 'NC2 clean render is not flagged as stale')
  chk.eq(stale.staleDetected, true, 'NC2 stale render is detected')
  chk.eq(queue.boundedDetected, true, 'NC3 bounded queue is not flagged as unbounded')
  chk.eq(queue.unboundedDetected, false, 'NC3 unbounded queue is detected')
  chk.eq(budget.within.status, 'PASS', 'NC4 budget comparator passes within budget')
  chk.eq(budget.equal.status, 'PASS', 'NC4 budget comparator passes at the budget boundary')
  chk.eq(budget.over.status, 'FAIL', 'NC4 budget comparator fails over budget')
  chk.eq(budget.missing.status, 'BLOCKED', 'NC4 budget comparator blocks a missing budget')
  return {
    row: { objectUrl, stale, queue, budget },
    assertions: chk.list()
  }
}

function scenarioSkeleton() {
  return {
    'S9-01': { title: 'Batch 1 baseline and initial load', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-02': { title: 'Batch 100', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-03': { title: 'Batch 1000', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-04': { title: 'Size and tree-shaking', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-05': { title: 'Memory and object URLs', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-06': { title: 'Slow CPU and network', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-07': { title: 'Failure and reload resilience', data: {}, assertions: [], errors: [], status: 'NOT RUN' },
    'S9-NC': { title: 'Negative controls', data: {}, assertions: [], errors: [], status: 'NOT RUN' }
  }
}

function mergeAssertions(scenario, assertions) {
  scenario.assertions.push(...assertions)
}
function noteScenarioError(scenario, error) {
  scenario.errors.push(error.stack || String(error))
}
function engineData(scenario, key, engineName, value) {
  scenario.data[key] = scenario.data[key] || {}
  scenario.data[key][engineName] = value
}

function collectMetric(metrics, samples, key, values, aggregate = 'p95') {
  const clean = values.map(Number).filter(Number.isFinite)
  samples[key] = (samples[key] ?? []).concat(clean)
  const valueStats = stats(samples[key])
  metrics[key] = aggregate === 'max' ? valueStats.max : aggregate === 'min' ? valueStats.min : valueStats.p95
}

function engineDefinitions(playwright) {
  return [
    { name: 'chromium', type: 'chromium', device: false },
    { name: 'firefox', type: 'firefox', device: false },
    { name: 'webkit', type: 'webkit', device: false },
    { name: 'mobile-chromium', type: 'chromium', device: true, deviceOptions: playwright.devices['Pixel 7'] }
  ]
}

function aggregateForKey(key) {
  if (
    key.includes('.longTaskMaxMs') ||
    key.includes('heapDelta') ||
    key.includes('pendingTimers') ||
    key.includes('listenerDelta') ||
    key.includes('appJsRequestsPerReload') ||
    key.includes('.attempts') ||
    key.endsWith('Bytes')
  ) return 'max'
  return 'p95'
}

function mergeData(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (Array.isArray(value)) {
      target[key] = Array.isArray(target[key]) ? target[key].concat(value) : value.slice()
    } else if (value && typeof value === 'object') {
      target[key] = target[key] && typeof target[key] === 'object' ? target[key] : {}
      mergeData(target[key], value)
    } else {
      target[key] = value
    }
  }
}

function scenarioWithId(scenarios, id) {
  if (!scenarios[id]) scenarios[id] = { title: id, data: {}, assertions: [], errors: [], status: 'NOT RUN' }
  return scenarios[id]
}

async function runPart(partValue) {
  const started = nowIso()
  const requireBrowser = createRequire(path.join(toolsDir, 'package.json'))
  const playwright = requireBrowser('playwright')
  const engines = {}
  const metrics = {}
  const metricSamples = {}
  const scenarios = {}
  function addScenario(id, data, assertions, errors = []) {
    const scenario = scenarioWithId(scenarios, id)
    mergeData(scenario.data, data ?? {})
    scenario.assertions.push(...(assertions ?? []))
    scenario.errors.push(...(errors ?? []))
  }
  function addEngine(name, browser) {
    engines[name] = { type: name === 'mobile-chromium' ? 'chromium' : name, version: browser.version(), device: name === 'mobile-chromium' ? 'Pixel 7' : 'desktop 1280x800' }
  }
  log(`part ${partValue}: start`)

  let server = null
  let browser = null
  try {
    const engineMatch = /^(chromium|firefox|webkit|mobile-chromium)-(s0[1-7])$/.exec(partValue)
    const browserOnlyParts = ['memory-1', 'memory-2', 'memory-3', 'throttle', 'resilience-extra', 'negative-controls']
    if (partValue !== 'sizes' && (engineMatch || browserOnlyParts.includes(partValue))) {
      server = await startServer()
    }

    if (partValue === 'sizes') {
      const sizes = await measureSizes()
      addScenario('S9-04', sizes.row, sizes.assertions)
      collectMetric(metrics, metricSamples, 'size.site.appJs.gzipBytes', [sizes.row.site.appJs.gzipBytes], 'max')
      collectMetric(metrics, metricSamples, 'size.site.siteCss.gzipBytes', [sizes.row.site.siteCss.gzipBytes], 'max')
      collectMetric(metrics, metricSamples, 'size.site.total.gzipBytes', [sizes.row.site.totals.gzipBytes], 'max')
      collectMetric(metrics, metricSamples, 'size.library.ditherFaceJs.gzipBytes', [sizes.row.library['dist/dither-face.js'].gzipBytes], 'max')
      collectMetric(metrics, metricSamples, 'size.svg.maxRawBytes', [sizes.row.svg.stats.maxSample.rawBytes], 'max')
      collectMetric(metrics, metricSamples, 'treeShake.oneRenderer.gzipBytes', [sizes.row.treeShake.oneRenderer.gzipBytes], 'max')
      collectMetric(metrics, metricSamples, 'treeShake.allRenderers.gzipBytes', [sizes.row.treeShake.allRenderers.gzipBytes], 'max')
    } else if (engineMatch) {
      const [, engineName, scenarioId] = engineMatch
      const engine = engineDefinitions(playwright).find(item => item.name === engineName)
      assert(engine, `unknown engine: ${engineName}`)
      browser = await playwright[engine.type].launch({ headless: true })
      addEngine(engine.name, browser)
      if (scenarioId === 's01') {
        const initial = await measureInitialLoad(engine, browser)
        addScenario('S9-01', { initialLoad: { [engine.name]: initial } }, initial.assertions)
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.appReadyMs`, initial.runs.map(run => run.appReadyAt), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.fcpMs`, initial.runs.map(run => run.fcpMs), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.lcpMs`, initial.runs.map(run => run.lcpMs), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.loadEventMs`, initial.runs.map(run => run.loadEventMs), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.longTaskMaxMs`, initial.runs.map(run => run.longTaskMaxMs), 'max')
        if (engine.type === 'chromium') {
          collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.scriptDurationMs`, initial.runs.map(run => run.scriptDurationMs), 'p95')
          collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.taskDurationMs`, initial.runs.map(run => run.taskDurationMs), 'p95')
        }
        const single = await measureSingleRender(engine, browser)
        addScenario('S9-01', { singleRender: { [engine.name]: single.row } }, single.assertions)
        collectMetric(metrics, metricSamples, `singleRender.${engine.name}.pureP95Ms`, single.row.samples.map(sample => sample.pureMs), 'p95')
        collectMetric(metrics, metricSamples, `singleRender.${engine.name}.domP95Ms`, single.row.samples.map(sample => sample.domMs), 'p95')
      } else if (scenarioId === 's02') {
        const batch100 = await measureBatch(engine, browser, 100, 5)
        addScenario('S9-02', { batch100: { [engine.name]: batch100.row } }, batch100.assertions)
        collectMetric(metrics, metricSamples, `batch100.${engine.name}.totalP95Ms`, batch100.row.rounds.map(row => row.totalMs), 'p95')
        collectMetric(metrics, metricSamples, `batch100.${engine.name}.perAvatarP95Ms`, batch100.row.rounds.map(row => row.perAvatarMs), 'p95')
        collectMetric(metrics, metricSamples, `batch100.${engine.name}.longTaskMaxMs`, batch100.row.rounds.map(row => row.longTaskMaxMs), 'max')
      } else if (scenarioId === 's03') {
        const batch1000 = await measureBatch(engine, browser, 1000, 3)
        addScenario('S9-03', { batch1000: { [engine.name]: batch1000.row } }, batch1000.assertions)
        collectMetric(metrics, metricSamples, `batch1000.${engine.name}.totalP95Ms`, batch1000.row.rounds.map(row => row.totalMs), 'p95')
        collectMetric(metrics, metricSamples, `batch1000.${engine.name}.perAvatarP95Ms`, batch1000.row.rounds.map(row => row.perAvatarMs), 'p95')
        collectMetric(metrics, metricSamples, `batch1000.${engine.name}.longTaskMaxMs`, batch1000.row.rounds.map(row => row.longTaskMaxMs), 'max')
      } else if (scenarioId === 's05') {
        const sustained = await measureSustainedFunctional(engine, browser)
        addScenario('S9-05', { sustainedFunctional: { [engine.name]: sustained.row } }, sustained.assertions)
        collectMetric(metrics, metricSamples, `sustained.${engine.name}.elapsedMs`, [sustained.row.sustained.elapsedMs], 'p95')
        collectMetric(metrics, metricSamples, `sustained.${engine.name}.longTaskMaxMs`, [sustained.row.longTaskMaxMs], 'max')
        const churn = await measureObjectUrlsAndClipboard(engine, browser)
        addScenario('S9-05', { objectUrlsClipboard: { [engine.name]: churn.row } }, churn.assertions)
      } else if (scenarioId === 's07') {
        const resilience = await measureResilience(engine, browser)
        addScenario('S9-07', { resilience: { [engine.name]: resilience.row } }, resilience.assertions)
        collectMetric(metrics, metricSamples, `blocked.appJs.${engine.name}.attempts`, [resilience.row.blocked.appJs.row.attempts], 'max')
      }
    } else if (partValue.startsWith('memory-')) {
      const sessionIndex = Number(partValue.split('-')[1])
      browser = await playwright.chromium.launch({ headless: true })
      addEngine('chromium', browser)
      const memory = await measureMemoryChromium(browser, sessionIndex)
      addScenario('S9-05', { memoryChromium: [memory.row] }, memory.assertions)
      collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaSustainedBytes', [memory.row.heap.deltaSustainedBytes], 'max')
      collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaRapidBytes', [memory.row.heap.deltaRapidBytes], 'max')
      collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaDownloadsBytes', [memory.row.heap.deltaDownloadsBytes], 'max')
      collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaClipboardBytes', [memory.row.heap.deltaClipboardBytes], 'max')
      collectMetric(metrics, metricSamples, 'memory.chromium.listenerDelta', [memory.row.clipboardState.listenerDelta], 'max')
      collectMetric(metrics, metricSamples, 'memory.chromium.pendingTimers', [memory.row.clipboardState.pendingTimers + memory.row.objectUrlState.pendingTimers], 'max')
    } else if (partValue === 'throttle') {
      browser = await playwright.chromium.launch({ headless: true })
      addEngine('chromium', browser)
      const throttle = await measureThrottleChromium(browser)
      addScenario('S9-06', throttle.row, throttle.assertions)
      collectMetric(metrics, metricSamples, 'throttle.network.appReadyP95Ms', throttle.row.network.runs.map(run => run.appReadyMs), 'p95')
      collectMetric(metrics, metricSamples, 'throttle.network.lcpP95Ms', throttle.row.network.runs.map(run => run.lcpMs), 'p95')
      collectMetric(metrics, metricSamples, 'throttle.network.longTaskMaxMs', throttle.row.network.runs.map(run => run.longTaskMaxMs), 'max')
      collectMetric(metrics, metricSamples, 'throttle.cpu.interactionsP95Ms', throttle.row.cpu.runs.map(run => run.interactionsMs), 'p95')
      collectMetric(metrics, metricSamples, 'throttle.cpu.longTaskMaxMs', throttle.row.cpu.runs.map(run => run.longTaskMaxMs), 'max')
    } else if (partValue === 'resilience-extra') {
      browser = await playwright.chromium.launch({ headless: true })
      addEngine('chromium', browser)
      const additional = await measureAdditionalResilienceChromium(browser)
      addScenario('S9-07', { additionalChromium: additional.row }, additional.assertions)
      collectMetric(metrics, metricSamples, 'blocked.css.chromium.attempts', [additional.row.css.row.attempts], 'max')
      collectMetric(metrics, metricSamples, 'blocked.bootstrap.chromium.attempts', [additional.row.bootstrap.row.attempts], 'max')
      collectMetric(metrics, metricSamples, 'reload.chromium.appJsRequestsPerReload', [additional.row.reload.appJsRequestsPerReload], 'max')
      collectMetric(metrics, metricSamples, 'reload.chromium.p95Ms', additional.row.reload.timesMs, 'p95')
      collectMetric(metrics, metricSamples, 'reload.chromium.heapDeltaBytes', [additional.row.reload.heapDeltaBytes], 'max')
    } else if (partValue === 'negative-controls') {
      browser = await playwright.chromium.launch({ headless: true })
      addEngine('chromium', browser)
      const negative = await measureNegativeControls(browser)
      addScenario('S9-NC', negative.row, negative.assertions)
    } else {
      throw new Error(`unknown part: ${partValue}`)
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (server) await stopServer(server)
  }

  const payload = {
    stage: 'S9-SITE',
    part: partValue,
    commit,
    sandbox,
    startedAt: started,
    endedAt: nowIso(),
    durationMs: Date.now() - phaseStarted,
    engines,
    scenarios,
    metricSamples
  }
  const partsDir = path.join(out, 'parts')
  await fsp.mkdir(partsDir, { recursive: true })
  await writeJson(path.join(partsDir, `${partValue}.json`), payload)
  await writeJson(path.join(out, `part-${partValue}.json`), payload)
  log(`part ${partValue}: ${Date.now() - phaseStarted} ms`)
}

async function mergeParts(mode) {
  const started = nowIso()
  const partsDir = path.join(out, 'parts')
  const entries = (await fsp.readdir(partsDir).catch(() => [])).filter(name => name.endsWith('.json')).sort()
  assert(entries.length > 0, `no part files found in ${partsDir}`)
  const scenarios = scenarioSkeleton()
  const engines = {}
  const metricSamples = {}
  const metrics = {}
  const partSummaries = []
  for (const entry of entries) {
    const part = await readJson(path.join(partsDir, entry))
    partSummaries.push({ part: part.part, durationMs: part.durationMs, scenarios: Object.keys(part.scenarios ?? {}) })
    Object.assign(engines, part.engines ?? {})
    for (const [id, fragment] of Object.entries(part.scenarios ?? {})) {
      const scenario = scenarioWithId(scenarios, id)
      mergeData(scenario.data, fragment.data ?? {})
      scenario.assertions.push(...(fragment.assertions ?? []))
      scenario.errors.push(...(fragment.errors ?? []))
    }
    for (const [key, values] of Object.entries(part.metricSamples ?? {})) {
      metricSamples[key] = (metricSamples[key] ?? []).concat(values)
    }
  }
  for (const [key, values] of Object.entries(metricSamples)) {
    const valueStats = stats(values)
    metrics[key] = aggregateForKey(key) === 'max' ? valueStats.max : valueStats.p95
  }
  let budgetChecks = []
  if (mode === 'test') {
    const expected = await readJson(expectedPath)
    assert(expected.stage === 'S9-SITE', 'expected results stage is not S9-SITE')
    assert(expected.budgets && typeof expected.budgets === 'object', 'expected results has no budgets')
    budgetChecks = applyBudgets(scenarios, metrics, expected)
  }
  for (const scenario of Object.values(scenarios)) {
    const failed = scenario.assertions.filter(assertion => !assertion.ok && !assertion.note)
    if (scenario.errors.length > 0 || failed.length > 0) scenario.status = 'FAIL'
    else if (scenario.assertions.length === 0) scenario.status = 'BLOCKED'
    else scenario.status = mode === 'baseline' ? 'MEASURED' : 'PASS'
  }
  const failedBudgets = budgetChecks.filter(check => check.status !== 'PASS')
  const payload = {
    stage: 'S9-SITE',
    mode,
    commit,
    sandbox,
    expectedSha256: mode === 'test' ? await sha256File(expectedPath) : null,
    startedAt: started,
    endedAt: nowIso(),
    durationMs: Date.now() - phaseStarted,
    engines,
    scenarios,
    metrics,
    metricSamples,
    parts: partSummaries,
    budgets: mode === 'test' ? (await readJson(expectedPath)).budgets : null,
    budgetChecks,
    budgetFailures: failedBudgets
  }
  const fileName = mode === 'baseline' ? 'baseline.json' : 'results.json'
  await writeJson(path.join(out, fileName), payload)
  const summary = {
    stage: 'S9-SITE',
    mode,
    commit,
    sandbox,
    startedAt: started,
    endedAt: payload.endedAt,
    durationMs: payload.durationMs,
    engines,
    scenarioStatus: Object.fromEntries(Object.entries(scenarios).map(([id, scenario]) => [id, scenario.status])),
    scenarioDetail: Object.fromEntries(Object.entries(scenarios).map(([id, scenario]) => [id, {
      assertions: scenario.assertions.length,
      failed: scenario.assertions.filter(assertion => !assertion.ok && !assertion.note).length,
      budgetFailures: failedBudgets.filter(check => check.scenario === id).length,
      errors: scenario.errors.length
    }])),
    budgetChecks: budgetChecks.length,
    failedBudgets: failedBudgets.length,
    parts: partSummaries,
    metrics
  }
  await writeJson(path.join(out, mode === 'baseline' ? 'baseline-summary.json' : 'summary.json'), summary)
  if (mode === 'test') await writeJson(path.join(out, 'negative-controls.json'), scenarios['S9-NC']?.data ?? {})
  await writeJson(path.join(out, 'steps.json'), steps)
}

async function runMeasurements(mode, expected) {
  const scenarios = scenarioSkeleton()
  const metrics = {}
  const metricSamples = {}
  const engines = {}
  const server = await startServer()
  const requireBrowser = createRequire(path.join(toolsDir, 'package.json'))
  const playwright = requireBrowser('playwright')
  const browserTypes = { chromium: playwright.chromium, firefox: playwright.firefox, webkit: playwright.webkit }
  const engineDefs = [
    { name: 'chromium', type: 'chromium', device: false },
    { name: 'firefox', type: 'firefox', device: false },
    { name: 'webkit', type: 'webkit', device: false },
    { name: 'mobile-chromium', type: 'chromium', device: true, deviceOptions: playwright.devices['Pixel 7'] }
  ]
  try {
    for (const engine of engineDefs) {
      let browser
      try {
        browser = await browserTypes[engine.type].launch({ headless: true })
        engines[engine.name] = { type: engine.type, version: browser.version(), device: engine.device ? 'Pixel 7' : 'desktop 1280x800' }
        log(`engine ${engine.name}: ${engines[engine.name].version}`)

        const initial = await measureInitialLoad(engine, browser)
        engineData(scenarios['S9-01'], 'initialLoad', engine.name, initial)
        mergeAssertions(scenarios['S9-01'], initial.assertions)
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.appReadyMs`, initial.runs.map(run => run.appReadyAt), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.fcpMs`, initial.runs.map(run => run.fcpMs), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.lcpMs`, initial.runs.map(run => run.lcpMs), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.loadEventMs`, initial.runs.map(run => run.loadEventMs), 'p95')
        collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.longTaskMaxMs`, initial.runs.map(run => run.longTaskMaxMs), 'max')
        if (engine.type === 'chromium') {
          collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.scriptDurationMs`, initial.runs.map(run => run.scriptDurationMs), 'p95')
          collectMetric(metrics, metricSamples, `initialLoad.${engine.name}.taskDurationMs`, initial.runs.map(run => run.taskDurationMs), 'p95')
        }

        const single = await measureSingleRender(engine, browser)
        engineData(scenarios['S9-01'], 'singleRender', engine.name, single.row)
        mergeAssertions(scenarios['S9-01'], single.assertions)
        collectMetric(metrics, metricSamples, `singleRender.${engine.name}.pureP95Ms`, single.row.samples.map(sample => sample.pureMs), 'p95')
        collectMetric(metrics, metricSamples, `singleRender.${engine.name}.domP95Ms`, single.row.samples.map(sample => sample.domMs), 'p95')

        const batch100 = await measureBatch(engine, browser, 100, 5)
        engineData(scenarios['S9-02'], 'batch100', engine.name, batch100.row)
        mergeAssertions(scenarios['S9-02'], batch100.assertions)
        collectMetric(metrics, metricSamples, `batch100.${engine.name}.totalP95Ms`, batch100.row.rounds.map(row => row.totalMs), 'p95')
        collectMetric(metrics, metricSamples, `batch100.${engine.name}.perAvatarP95Ms`, batch100.row.rounds.map(row => row.perAvatarMs), 'p95')
        collectMetric(metrics, metricSamples, `batch100.${engine.name}.longTaskMaxMs`, batch100.row.rounds.map(row => row.longTaskMaxMs), 'max')

        const batch1000 = await measureBatch(engine, browser, 1000, 3)
        engineData(scenarios['S9-03'], 'batch1000', engine.name, batch1000.row)
        mergeAssertions(scenarios['S9-03'], batch1000.assertions)
        collectMetric(metrics, metricSamples, `batch1000.${engine.name}.totalP95Ms`, batch1000.row.rounds.map(row => row.totalMs), 'p95')
        collectMetric(metrics, metricSamples, `batch1000.${engine.name}.perAvatarP95Ms`, batch1000.row.rounds.map(row => row.perAvatarMs), 'p95')
        collectMetric(metrics, metricSamples, `batch1000.${engine.name}.longTaskMaxMs`, batch1000.row.rounds.map(row => row.longTaskMaxMs), 'max')

        const sustained = await measureSustainedFunctional(engine, browser)
        engineData(scenarios['S9-05'], 'sustainedFunctional', engine.name, sustained.row)
        mergeAssertions(scenarios['S9-05'], sustained.assertions)
        collectMetric(metrics, metricSamples, `sustained.${engine.name}.elapsedMs`, [sustained.row.sustained.elapsedMs], 'p95')
        collectMetric(metrics, metricSamples, `sustained.${engine.name}.longTaskMaxMs`, [sustained.row.longTaskMaxMs], 'max')

        const churn = await measureObjectUrlsAndClipboard(engine, browser)
        engineData(scenarios['S9-05'], 'objectUrlsClipboard', engine.name, churn.row)
        mergeAssertions(scenarios['S9-05'], churn.assertions)

        const resilience = await measureResilience(engine, browser)
        engineData(scenarios['S9-07'], 'resilience', engine.name, resilience.row)
        mergeAssertions(scenarios['S9-07'], resilience.assertions)
        collectMetric(metrics, metricSamples, `blocked.appJs.${engine.name}.attempts`, [resilience.row.blocked.appJs.row.attempts], 'max')
      } catch (error) {
        noteScenarioError(scenarios['S9-01'], error)
        noteScenarioError(scenarios['S9-02'], error)
        noteScenarioError(scenarios['S9-03'], error)
        noteScenarioError(scenarios['S9-05'], error)
        noteScenarioError(scenarios['S9-07'], error)
        log(`engine ${engine.name} failed: ${error.stack || error}`)
      } finally {
        if (browser) await browser.close().catch(() => {})
      }
    }

    const sizes = await measureSizes()
    scenarios['S9-04'].data = sizes.row
    mergeAssertions(scenarios['S9-04'], sizes.assertions)
    collectMetric(metrics, metricSamples, 'size.site.appJs.gzipBytes', [sizes.row.site.appJs.gzipBytes], 'max')
    collectMetric(metrics, metricSamples, 'size.site.siteCss.gzipBytes', [sizes.row.site.siteCss.gzipBytes], 'max')
    collectMetric(metrics, metricSamples, 'size.site.total.gzipBytes', [sizes.row.site.totals.gzipBytes], 'max')
    collectMetric(metrics, metricSamples, 'size.library.ditherFaceJs.gzipBytes', [sizes.row.library['dist/dither-face.js'].gzipBytes], 'max')
    collectMetric(metrics, metricSamples, 'size.svg.maxRawBytes', [sizes.row.svg.stats.maxSample.rawBytes], 'max')
    collectMetric(metrics, metricSamples, 'treeShake.oneRenderer.gzipBytes', [sizes.row.treeShake.oneRenderer.gzipBytes], 'max')
    collectMetric(metrics, metricSamples, 'treeShake.allRenderers.gzipBytes', [sizes.row.treeShake.allRenderers.gzipBytes], 'max')

    let chromiumBrowser
    try {
      chromiumBrowser = await playwright.chromium.launch({ headless: true })
      engines.chromium = engines.chromium ?? { type: 'chromium', version: chromiumBrowser.version(), device: 'desktop 1280x800' }
      const memorySessions = []
      for (let session = 1; session <= 3; session += 1) {
        const memory = await measureMemoryChromium(chromiumBrowser, session)
        memorySessions.push(memory.row)
        mergeAssertions(scenarios['S9-05'], memory.assertions)
        collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaSustainedBytes', [memory.row.heap.deltaSustainedBytes], 'max')
        collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaRapidBytes', [memory.row.heap.deltaRapidBytes], 'max')
        collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaDownloadsBytes', [memory.row.heap.deltaDownloadsBytes], 'max')
        collectMetric(metrics, metricSamples, 'memory.chromium.heapDeltaClipboardBytes', [memory.row.heap.deltaClipboardBytes], 'max')
        collectMetric(metrics, metricSamples, 'memory.chromium.listenerDelta', [memory.row.clipboardState.listenerDelta], 'max')
        collectMetric(metrics, metricSamples, 'memory.chromium.pendingTimers', [memory.row.clipboardState.pendingTimers + memory.row.objectUrlState.pendingTimers], 'max')
      }
      scenarios['S9-05'].data.memoryChromium = memorySessions

      const throttle = await measureThrottleChromium(chromiumBrowser)
      scenarios['S9-06'].data = throttle.row
      mergeAssertions(scenarios['S9-06'], throttle.assertions)
      collectMetric(metrics, metricSamples, 'throttle.network.appReadyP95Ms', throttle.row.network.runs.map(run => run.appReadyMs), 'p95')
      collectMetric(metrics, metricSamples, 'throttle.network.lcpP95Ms', throttle.row.network.runs.map(run => run.lcpMs), 'p95')
      collectMetric(metrics, metricSamples, 'throttle.network.longTaskMaxMs', throttle.row.network.runs.map(run => run.longTaskMaxMs), 'max')
      collectMetric(metrics, metricSamples, 'throttle.cpu.interactionsP95Ms', throttle.row.cpu.runs.map(run => run.interactionsMs), 'p95')
      collectMetric(metrics, metricSamples, 'throttle.cpu.longTaskMaxMs', throttle.row.cpu.runs.map(run => run.longTaskMaxMs), 'max')

      const additional = await measureAdditionalResilienceChromium(chromiumBrowser)
      scenarios['S9-07'].data.additionalChromium = additional.row
      mergeAssertions(scenarios['S9-07'], additional.assertions)
      collectMetric(metrics, metricSamples, 'blocked.css.chromium.attempts', [additional.row.css.row.attempts], 'max')
      collectMetric(metrics, metricSamples, 'blocked.bootstrap.chromium.attempts', [additional.row.bootstrap.row.attempts], 'max')
      collectMetric(metrics, metricSamples, 'reload.chromium.appJsRequestsPerReload', [additional.row.reload.appJsRequestsPerReload], 'max')
      collectMetric(metrics, metricSamples, 'reload.chromium.p95Ms', additional.row.reload.timesMs, 'p95')
      collectMetric(metrics, metricSamples, 'reload.chromium.heapDeltaBytes', [additional.row.reload.heapDeltaBytes], 'max')

      const negative = await measureNegativeControls(chromiumBrowser)
      scenarios['S9-NC'] = { title: 'Negative controls', data: negative.row, assertions: negative.assertions, errors: [], status: 'NOT RUN' }
      mergeAssertions(scenarios['S9-NC'], negative.assertions)
    } catch (error) {
      noteScenarioError(scenarios['S9-05'], error)
      noteScenarioError(scenarios['S9-06'], error)
      noteScenarioError(scenarios['S9-07'], error)
      log(`chromium-only phases failed: ${error.stack || error}`)
    } finally {
      if (chromiumBrowser) await chromiumBrowser.close().catch(() => {})
    }
  } finally {
    await stopServer(server)
  }

  for (const scenario of Object.values(scenarios)) {
    const failed = scenario.assertions.filter(assertion => !assertion.ok && !assertion.note)
    if (scenario.errors.length > 0) scenario.status = 'FAIL'
    else if (failed.length > 0) scenario.status = 'FAIL'
    else if (scenario.assertions.length === 0) scenario.status = 'BLOCKED'
    else scenario.status = mode === 'baseline' ? 'MEASURED' : 'PASS'
  }
  return { scenarios, metrics, metricSamples, engines }
}

function budgetKeyList(expected) {
  return Object.keys(expected?.budgets ?? {}).sort()
}

function scenarioForMetric(key) {
  const prefix = key.split('.')[0]
  if (prefix === 'initialLoad' || prefix === 'singleRender') return 'S9-01'
  if (prefix === 'batch100') return 'S9-02'
  if (prefix === 'batch1000') return 'S9-03'
  if (prefix === 'size' || prefix === 'treeShake') return 'S9-04'
  if (prefix === 'memory' || prefix === 'sustained') return 'S9-05'
  if (prefix === 'throttle') return 'S9-06'
  if (prefix === 'blocked' || prefix === 'reload') return 'S9-07'
  return null
}

function applyBudgets(scenarios, metrics, expected) {
  const checks = []
  for (const key of budgetKeyList(expected)) {
    const budget = expected.budgets[key]
    const actual = metrics[key]
    const result = compareBudget(actual, budget)
    const check = { scenario: scenarioForMetric(key), metric: key, actual: actual ?? null, budget, ...result }
    checks.push(check)
    if (check.status !== 'PASS' && check.scenario && scenarios[check.scenario]) {
      scenarios[check.scenario].assertions.push({
        name: `budget ${check.metric}`,
        ok: false,
        detail: { actual: check.actual, budget: check.budget, status: check.status }
      })
    }
  }
  return checks
}

async function phaseBaseline() {
  const started = nowIso()
  const sourceInfo = await verifySourceManifest(sourceManifestPath)
  const environment = await environmentInfo()
  await writeJson(path.join(out, 'environment.json'), environment)
  const run = await runMeasurements('baseline', null)
  const payload = {
    stage: 'S9-SITE',
    mode: 'baseline',
    commit,
    sandbox,
    sourceManifestSha256: sourceInfo.digest,
    sourceManifestFileCount: sourceInfo.fileCount,
    startedAt: started,
    endedAt: nowIso(),
    durationMs: Date.now() - phaseStarted,
    environment,
    engines: run.engines,
    scenarios: run.scenarios,
    metrics: run.metrics,
    metricSamples: run.metricSamples
  }
  await writeJson(path.join(out, 'baseline.json'), payload)
  const summary = {
    stage: 'S9-SITE',
    mode: 'baseline',
    commit,
    sandbox,
    startedAt: started,
    endedAt: payload.endedAt,
    durationMs: payload.durationMs,
    engines: run.engines,
    scenarioStatus: Object.fromEntries(Object.entries(run.scenarios).map(([id, scenario]) => [id, scenario.status])),
    assertionCount: Object.values(run.scenarios).reduce((total, scenario) => total + scenario.assertions.length, 0),
    failedAssertions: Object.values(run.scenarios).flatMap(scenario => scenario.assertions).filter(assertion => !assertion.ok && !assertion.note).length,
    metricCount: Object.keys(run.metrics).length
  }
  await writeJson(path.join(out, 'baseline-summary.json'), summary)
  await writeJson(path.join(out, 'steps.json'), steps)
}

async function phaseTest() {
  const started = nowIso()
  const sourceInfo = await verifySourceManifest(sourceManifestPath)
  const expectedHash = await verifyHash('expected results', expectedPath, expectedSha)
  const expected = await readJson(expectedPath)
  assert(expected.stage === 'S9-SITE', 'expected results stage is not S9-SITE')
  assert(expected.budgets && typeof expected.budgets === 'object', 'expected results has no budgets')
  const environment = await environmentInfo()
  await writeJson(path.join(out, 'environment.json'), environment)
  const run = await runMeasurements('test', expected)
  const budgetChecks = applyBudgets(run.scenarios, run.metrics, expected)
  const failedBudgets = budgetChecks.filter(check => check.status !== 'PASS')
  const finalScenarios = Object.fromEntries(Object.entries(run.scenarios).map(([id, scenario]) => {
    const scenarioBudgetFailures = failedBudgets.filter(check => check.scenario === id)
    const failed = scenario.assertions.filter(assertion => !assertion.ok && !assertion.note).length
    const status = scenario.errors.length > 0 || failed > 0 ? 'FAIL' : scenario.assertions.length === 0 ? 'BLOCKED' : 'PASS'
    return [id, { ...scenario, status, budgetFailures: scenarioBudgetFailures.length }]
  }))
  const failedAssertions = Object.values(finalScenarios).flatMap(scenario => scenario.assertions).filter(assertion => !assertion.ok && !assertion.note)
  const payload = {
    stage: 'S9-SITE',
    mode: 'test',
    commit,
    sandbox,
    sourceManifestSha256: sourceInfo.digest,
    sourceManifestFileCount: sourceInfo.fileCount,
    expectedSha256: expectedHash,
    startedAt: started,
    endedAt: nowIso(),
    durationMs: Date.now() - phaseStarted,
    environment,
    engines: run.engines,
    scenarios: finalScenarios,
    metrics: run.metrics,
    metricSamples: run.metricSamples,
    budgets: expected.budgets,
    budgetChecks,
    budgetFailures: failedBudgets
  }
  await writeJson(path.join(out, 'results.json'), payload)
  await writeJson(path.join(out, 'negative-controls.json'), finalScenarios['S9-NC']?.data ?? {})
  const summary = {
    stage: 'S9-SITE',
    mode: 'test',
    commit,
    sandbox,
    expectedSha256: expectedHash,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    durationMs: payload.durationMs,
    engines: run.engines,
    scenarioStatus: Object.fromEntries(Object.entries(finalScenarios).map(([id, scenario]) => [id, scenario.status])),
    scenarioBudgets: Object.fromEntries(Object.entries(finalScenarios).map(([id, scenario]) => [id, { budgetFailures: scenario.budgetFailures, failedAssertions: scenario.assertions.filter(assertion => !assertion.ok && !assertion.note).length }])),
    budgetChecks: budgetChecks.length,
    failedBudgets: failedBudgets.length,
    assertionCount: Object.values(finalScenarios).reduce((total, scenario) => total + scenario.assertions.length, 0),
    failedAssertions: failedAssertions.length,
    metrics: run.metrics
  }
  await writeJson(path.join(out, 'summary.json'), summary)
  await writeJson(path.join(out, 'steps.json'), steps)
}

async function main() {
  if (phase === 'prepare') {
    await phasePrepare()
    return
  }
  if (phase === 'build') {
    await buildSiteArtifacts()
    return
  }
  if (phase === 'part') {
    await runPart(partName)
    return
  }
  if (phase === 'merge-baseline') {
    await mergeParts('baseline')
    return
  }
  if (phase === 'merge-test') {
    await mergeParts('test')
    return
  }
  if (phase === 'baseline') {
    await phaseBaseline()
    return
  }
  if (phase === 'test') {
    await phaseTest()
    return
  }
}

await main()
