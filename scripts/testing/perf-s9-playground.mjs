#!/usr/bin/env node
/**
 * Stage 9 playground interaction/resilience phase.
 *
 * One pinned Linux Chromium is used. The page is served from a loopback
 * in-process static server; no external network is required. The test sets
 * its throttling and monitoring limits before running, records measured
 * values, and never converts an unagreed responsiveness threshold into a
 * release PASS.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function mib(bytes) {
  return bytes / (1024 * 1024)
}

function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
}

function stats(values) {
  if (values.length === 0) return { count: 0, min: null, median: null, p95: null, max: null, sum: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return {
    count: sorted.length,
    min: sorted[0],
    median: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    sum: sorted.reduce((sum, value) => sum + value, 0),
  }
}

async function startStaticServer(root) {
  const realRoot = await fsp.realpath(root)
  const server = http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      let file = path.resolve(realRoot, `.${pathname}`)
      if (file !== realRoot && !file.startsWith(`${realRoot}${path.sep}`)) {
        response.writeHead(403).end()
        return
      }
      const info = await fsp.stat(file)
      if (info.isDirectory()) file = path.join(file, 'index.html')
      const realFile = await fsp.realpath(file)
      if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) {
        response.writeHead(403).end()
        return
      }
      if (path.basename(realFile).startsWith('.') || path.basename(realFile) === '_headers') {
        response.writeHead(404).end()
        return
      }
      const body = await fsp.readFile(realFile)
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(realFile)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      }).end(request.method === 'HEAD' ? undefined : body)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, root: realRoot }
}

async function closeServer(server) {
  if (!server) return
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
}

const URL_TRACKER_INIT = `(() => {
  const originalCreate = URL.createObjectURL.bind(URL)
  const originalRevoke = URL.revokeObjectURL.bind(URL)
  const live = new Set()
  const stats = { created: 0, revoked: 0, live: 0, errors: [] }
  URL.createObjectURL = (blob) => {
    try {
      const url = originalCreate(blob)
      stats.created += 1
      live.add(url)
      stats.live = live.size
      return url
    } catch (error) {
      stats.errors.push(String(error && error.message || error))
      throw error
    }
  }
  URL.revokeObjectURL = (url) => {
    const existed = live.delete(url)
    stats.revoked += 1
    stats.live = live.size
    return originalRevoke(url)
  }
  window.__s9UrlStats = stats
  window.__s9UrlLive = () => [...live]
  window.__s9UrlDetector = () => ({ live: live.size, leaked: live.size > 0, urls: [...live] })
})()`

const LONG_TASK_INIT = `(() => {
  window.__s9LongTasks = []
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__s9LongTasks.push({ start: entry.startTime, duration: entry.duration })
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch (error) {
    window.__s9LongTaskError = String(error && error.message || error)
  }
})()`

async function waitReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', null, { timeout: 30000 })
  await page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8, null, { timeout: 10000 })
}

async function heapUsage(cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  const usage = await cdp.send('Runtime.getHeapUsage')
  return { usedBytes: usage.usedSize, totalBytes: usage.totalSize }
}

export async function runPlayground({ config, expected, golden, prepare, recorder, module: lib, tools }) {
  const limits = expected.predeclaredMonitoringLimits
  const { chromium } = tools.playwright
  const siteRoot = path.join(config.repo, 'dist-site')
  const artifacts = path.join(config.out, 'playground', 'artifacts')
  await fsp.mkdir(artifacts, { recursive: true })
  const started = new Date().toISOString()
  const serverInfo = await startStaticServer(siteRoot)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const chromiumVersion = browser.version()
  const screenshots = []
  let mainContext = null
  let normalContext = null
  let assetContext = null
  const pageErrors = []
  const consoleErrors = []
  const results = {
    startedAt: started,
    baseUrl: serverInfo.baseUrl,
    throttling: { cpuThrottleRate: expected.method.throttling.cpuThrottleRate, network: expected.method.throttling.network },
    limits,
    cases: {},
    measurements: {},
    screenshots: [],
  }

  async function runCase(id, scenario, title, fn, meta = {}) {
    const record = recorder.case(id, scenario, title, meta)
    try {
      await fn(record)
      recorder.finish(record, record.failedAssertions > 0 ? 'failed' : 'completed')
    } catch (error) {
      recorder.check(record, 'case completed without exception', false, 'no exception', error.stack || String(error))
      recorder.finish(record, 'failed')
    }
    results.cases[id] = {
      scenario,
      status: record.status,
      assertions: record.assertions,
      failedAssertions: record.failedAssertions,
    }
    return record
  }

  try {
    mainContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false })
    const page = await mainContext.newPage()
    page.on('pageerror', (error) => pageErrors.push({ page: 'main', error: String(error) }))
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push({ page: 'main', text: message.text() }) })
    await page.addInitScript(LONG_TASK_INIT)
    const cdp = await mainContext.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: expected.method.throttling.network.latencyMs,
      downloadThroughput: expected.method.throttling.network.downloadBytesPerSecond,
      uploadThroughput: expected.method.throttling.network.uploadBytesPerSecond,
      connectionType: 'cellular3g',
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: expected.method.throttling.cpuThrottleRate })

    const throttleUrl = `${serverInfo.baseUrl}/?seed=s9-throttle&style=pixel-sprite&size=80&name=Ada`
    const loadStarted = performance.now()
    await page.goto(throttleUrl, { waitUntil: 'load', timeout: 45000 })
    await runCase('playground-throttled-load', 'S9-06', 'Throttled playground load and readiness', async (record) => {
      await waitReady(page)
      const readyMs = performance.now() - loadStarted
      const state = await page.evaluate(() => ({
        galleryButtons: document.querySelectorAll('#gallery button').length,
        previewSvgs: document.querySelectorAll('#preview svg').length,
        appReady: document.documentElement.dataset.appReady,
        status: document.getElementById('status').textContent,
        statusState: document.getElementById('status').dataset.state ?? null,
        controlsDisabled: [...document.querySelectorAll('#seed, #name, #size, #copy-svg, #download-svg, #copy-code, #share')].filter((element) => element.disabled).length,
        navigation: performance.getEntriesByType('navigation')[0] ? {
          domContentLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
          load: performance.getEntriesByType('navigation')[0].loadEventEnd,
          transferSize: performance.getEntriesByType('navigation')[0].transferSize,
          duration: performance.getEntriesByType('navigation')[0].duration,
        } : null,
        resources: performance.getEntriesByType('resource').map((entry) => ({ name: entry.name.replace(location.origin, ''), duration: entry.duration, transferSize: entry.transferSize })),
      }))
      record.meta = { readyMs }
      recorder.check(record, 'eight gallery buttons rendered', state.galleryButtons === 8, 8, state.galleryButtons)
      recorder.check(record, 'one preview SVG rendered', state.previewSvgs === 1, 1, state.previewSvgs)
      recorder.check(record, 'app ready marker set', state.appReady === 'true', 'true', state.appReady)
      recorder.check(record, 'no boot failure status remains', state.status === '' && state.statusState === null, { text: '', state: null }, { text: state.status, state: state.statusState })
      recorder.check(record, 'all interactive controls enabled after boot', state.controlsDisabled === 0, 0, state.controlsDisabled)
      recorder.measure(record, 'time to ready under throttle', readyMs, 'ms', { monitoringLimitMs: limits.interaction.readyMaxMs, withinPredeclaredLimit: readyMs <= limits.interaction.readyMaxMs })
      results.measurements.throttledLoad = { readyMs, navigation: state.navigation, resources: state.resources, withinPredeclaredLimit: readyMs <= limits.interaction.readyMaxMs, monitoringLimitMs: limits.interaction.readyMaxMs }
    })

    await runCase('playground-rapid-input', 'S9-06', 'Rapid seed input, style and size interaction under throttle', async (record) => {
      const interaction = await page.evaluate(async () => {
        const seed = document.getElementById('seed')
        const times = []
        for (let index = 0; index < 20; index += 1) {
          const started = performance.now()
          seed.value = `s9-throttle-${index}`
          seed.dispatchEvent(new Event('input', { bubbles: true }))
          times.push(performance.now() - started)
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return {
          times,
          seed: seed.value,
          source: document.getElementById('svg-source').value,
          previewSvgs: document.querySelectorAll('#preview svg').length,
          url: location.search,
        }
      })
      const totalMs = interaction.times.reduce((sum, value) => sum + value, 0)
      recorder.check(record, 'all 20 rapid input events completed', interaction.times.length === 20, 20, interaction.times.length)
      recorder.check(record, 'final seed reflects last input', interaction.seed === 's9-throttle-19', 's9-throttle-19', interaction.seed)
      recorder.check(record, 'preview still renders one SVG', interaction.previewSvgs === 1, 1, interaction.previewSvgs)
      recorder.check(record, 'source remains a non-empty SVG', interaction.source.startsWith('<svg') && interaction.source.trimEnd().endsWith('</svg>'), 'well-formed SVG wrapper', interaction.source.slice(0, 80))
      recorder.check(record, 'URL state reflects final seed', interaction.url.includes('seed=s9-throttle-19'), 'seed=s9-throttle-19', interaction.url)
      recorder.measure(record, '20 rapid input events total', totalMs, 'ms', { monitoringLimitMs: limits.interaction.rapidInputTotalMaxMs, withinPredeclaredLimit: totalMs <= limits.interaction.rapidInputTotalMaxMs })
      recorder.measure(record, 'single rapid input max', Math.max(...interaction.times), 'ms')
      results.measurements.rapidInput = {
        totalMs,
        timesMs: interaction.times,
        ...stats(interaction.times),
        withinPredeclaredLimit: totalMs <= limits.interaction.rapidInputTotalMaxMs,
        monitoringLimitMs: limits.interaction.rapidInputTotalMaxMs,
      }

      const styleResults = await page.evaluate(async (slugs) => {
        const output = []
        for (const slug of slugs) {
          const button = document.querySelector(`button[data-style="${slug}"]`)
          if (!button) {
            output.push({ slug, missing: true })
            continue
          }
          const started = performance.now()
          button.click()
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const source = document.getElementById('svg-source').value
          output.push({
            slug,
            durationMs: performance.now() - started,
            pressed: button.getAttribute('aria-pressed'),
            title: document.getElementById('selected-title').textContent,
            previewSvgs: document.querySelectorAll('#preview svg').length,
            sourceBytes: new TextEncoder().encode(source).length,
          })
        }
        return output
      }, golden.styles.map((entry) => entry.slug))
      for (const entry of styleResults) {
        recorder.check(record, `style ${entry.slug} selected and rendered`, entry.missing !== true && entry.pressed === 'true' && entry.previewSvgs === 1 && entry.sourceBytes > 0, { pressed: 'true', previewSvgs: 1, sourceBytes: '>0' }, { pressed: entry.pressed, previewSvgs: entry.previewSvgs, sourceBytes: entry.sourceBytes })
      }
      results.measurements.styleSwitchMs = styleResults.map((entry) => ({ slug: entry.slug, durationMs: entry.durationMs }))

      const sizeResults = await page.evaluate(async (sizes) => {
        const output = []
        const select = document.getElementById('size')
        for (const size of sizes) {
          select.value = String(size)
          const started = performance.now()
          select.dispatchEvent(new Event('change', { bubbles: true }))
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const svg = document.querySelector('#preview svg')
          output.push({
            size,
            durationMs: performance.now() - started,
            widthAttribute: svg?.getAttribute('width') ?? null,
            heightAttribute: svg?.getAttribute('height') ?? null,
            renderedWidth: svg?.getBoundingClientRect().width ?? null,
            previewSvgs: document.querySelectorAll('#preview svg').length,
          })
        }
        return output
      }, [48, 80, 128, 192])
      for (const entry of sizeResults) {
        recorder.check(record, `size ${entry.size} renders at requested box`, entry.widthAttribute === String(entry.size) && entry.heightAttribute === String(entry.size) && entry.previewSvgs === 1, String(entry.size), { width: entry.widthAttribute, height: entry.heightAttribute })
      }
      results.measurements.sizeSwitch = sizeResults

      const finalState = await page.evaluate(async () => {
        const seed = document.getElementById('seed')
        const name = document.getElementById('name')
        const select = document.getElementById('size')
        seed.value = 's9-final'
        seed.dispatchEvent(new Event('input', { bubbles: true }))
        name.value = 'Throttled Ada'
        name.dispatchEvent(new Event('input', { bubbles: true }))
        select.value = '192'
        select.dispatchEvent(new Event('change', { bubbles: true }))
        const button = document.querySelector('button[data-style="pixelify-letter"]')
        button.click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const started = performance.now()
        await new Promise((resolve) => requestAnimationFrame(resolve))
        return {
          source: document.getElementById('svg-source').value,
          previewSvgs: document.querySelectorAll('#preview svg').length,
          seed: seed.value,
          name: name.value,
          size: select.value,
          pressed: button.getAttribute('aria-pressed'),
          settleMs: performance.now() - started,
          status: document.getElementById('status').textContent,
          url: location.search,
        }
      })
      const expectedFinal = lib.ditherFace('s9-final', { style: 'pixelify-letter', px: 192, name: 'Throttled Ada' })
      recorder.check(record, 'final throttled state matches exact Node-rendered bytes', finalState.source === expectedFinal, sha256(expectedFinal), sha256(finalState.source))
      recorder.check(record, 'final state has one preview SVG', finalState.previewSvgs === 1, 1, finalState.previewSvgs)
      recorder.check(record, 'final style is selected', finalState.pressed === 'true', 'true', finalState.pressed)
      recorder.check(record, 'final URL captures seed/style/size/name', finalState.url.includes('seed=s9-final') && finalState.url.includes('style=pixelify-letter') && finalState.url.includes('size=192') && finalState.url.includes('name=Throttled+Ada'), 'full final URL state', finalState.url)
      recorder.measure(record, 'final state settle after last input', finalState.settleMs, 'ms', { monitoringLimitMs: limits.interaction.finalStateSettleMaxMs, withinPredeclaredLimit: finalState.settleMs <= limits.interaction.finalStateSettleMaxMs })
      results.measurements.finalState = { ...finalState, expectedSha256: sha256(expectedFinal), actualSha256: sha256(finalState.source), withinPredeclaredLimit: finalState.settleMs <= limits.interaction.finalStateSettleMaxMs }

      const longTasks = await page.evaluate(() => window.__s9LongTasks ?? [])
      const durations = longTasks.map((entry) => entry.duration)
      results.measurements.longTasks = { entries: longTasks, ...stats(durations) }
      recorder.measure(record, 'max long task under throttle', durations.length ? Math.max(...durations) : 0, 'ms', { monitoringLimitMs: limits.interaction.singleLongTaskMaxMs })
      recorder.measure(record, 'p95 long task under throttle', durations.length ? percentile(durations, 0.95) : 0, 'ms', { monitoringLimitMs: limits.interaction.p95LongTaskMaxMs })
      recorder.check(record, 'no page script exception during interaction', pageErrors.filter((entry) => entry.page === 'main').length === 0, 0, pageErrors.filter((entry) => entry.page === 'main'))
    })

    const screenshotPath = path.join(artifacts, 's9-throttled-final.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    const screenshotBytes = await fsp.readFile(screenshotPath)
    screenshots.push({ name: 's9-throttled-final.png', bytes: screenshotBytes.length, sha256: sha256(screenshotBytes), role: 'final throttled playground state' })

    // Clean URL lifecycle: normal context, rapid real download clicks, then settle.
    normalContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false })
    const normalPage = await normalContext.newPage()
    normalPage.on('pageerror', (error) => pageErrors.push({ page: 'normal', error: String(error) }))
    normalPage.on('console', (message) => { if (message.type() === 'error') consoleErrors.push({ page: 'normal', text: message.text() }) })
    await normalPage.addInitScript(URL_TRACKER_INIT)
    await normalPage.goto(`${serverInfo.baseUrl}/?seed=s9-url&style=pixel-sprite&size=80`, { waitUntil: 'load', timeout: 30000 })
    await waitReady(normalPage)
    const normalCdp = await normalContext.newCDPSession(normalPage)
    await normalCdp.send('HeapProfiler.enable')
    await runCase('playground-url-cleanup', 'S9-05', 'Playground download create/revoke lifecycle and URL detector', async (record) => {
      const before = await heapUsage(normalCdp)
      const clickResult = await normalPage.evaluate(async (cycles) => {
        for (let index = 0; index < cycles; index += 1) {
          document.getElementById('download-svg').click()
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        return { created: window.__s9UrlStats.created, live: window.__s9UrlStats.live, errors: window.__s9UrlStats.errors }
      }, limits.soak.browserDownloadCycles)
      await normalPage.waitForTimeout(1300)
      const after = await heapUsage(normalCdp)
      const stats = await normalPage.evaluate(() => ({ ...window.__s9UrlStats, detector: window.__s9UrlDetector() }))
      recorder.check(record, 'all requested download clicks created object URLs', clickResult.created === limits.soak.browserDownloadCycles, limits.soak.browserDownloadCycles, clickResult.created)
      recorder.check(record, 'all created object URLs revoked after settling', stats.created === limits.soak.browserDownloadCycles && stats.revoked === limits.soak.browserDownloadCycles && stats.live === 0, { created: limits.soak.browserDownloadCycles, revoked: limits.soak.browserDownloadCycles, live: 0 }, { created: stats.created, revoked: stats.revoked, live: stats.live })
      recorder.check(record, 'shared URL detector reports no leak for clean downloads', stats.detector.leaked === false, false, stats.detector.leaked)
      recorder.check(record, 'no createObjectURL errors during clean downloads', stats.errors.length === 0, [], stats.errors)
      recorder.measure(record, 'browser heap before downloads', mib(before.usedBytes), 'MiB')
      recorder.measure(record, 'browser heap after downloads and GC', mib(after.usedBytes), 'MiB', { deltaMiB: mib(after.usedBytes - before.usedBytes), monitoringLimitMiB: limits.soak.browserHeapGrowthMiB })
      results.measurements.urlCleanup = { before, after, deltaBytes: after.usedBytes - before.usedBytes, stats, cycles: limits.soak.browserDownloadCycles }

      // Same detector, deliberately unrevoked URLs.
      const negativePage = await normalContext.newPage()
      await negativePage.addInitScript(URL_TRACKER_INIT)
      await negativePage.goto(`${serverInfo.baseUrl}/`, { waitUntil: 'load', timeout: 30000 })
      await waitReady(negativePage)
      const negative = await negativePage.evaluate(() => {
        for (let index = 0; index < 3; index += 1) {
          URL.createObjectURL(new Blob([`negative-${index}`], { type: 'text/plain' }))
        }
        return { ...window.__s9UrlStats, detector: window.__s9UrlDetector() }
      })
      recorder.check(record, 'intentionally unrevoked URLs are detected as a leak', negative.detector.leaked === true && negative.detector.live === 3, { leaked: true, live: 3 }, negative.detector)
      const cleaned = await negativePage.evaluate(() => {
        for (const url of window.__s9UrlLive()) URL.revokeObjectURL(url)
        return { ...window.__s9UrlStats, detector: window.__s9UrlDetector() }
      })
      recorder.check(record, 'negative-control URLs can be revoked back to zero', cleaned.detector.leaked === false && cleaned.detector.live === 0, { leaked: false, live: 0 }, cleaned.detector)
      await negativePage.close()
      results.measurements.urlNegativeControl = { negative, cleaned }
    })

    // Consumer create/revoke cycles in the page (not the site download path).
    await runCase('playground-consumer-url-cycles', 'S9-05', 'Consumer Blob URL create/revoke cycles', async (record) => {
      const before = await heapUsage(normalCdp)
      const beforeStats = await normalPage.evaluate(() => ({ ...window.__s9UrlStats }))
      const cycles = await normalPage.evaluate((count) => {
        const started = performance.now()
        for (let index = 0; index < count; index += 1) {
          const url = URL.createObjectURL(new Blob([`consumer-${index}`], { type: 'text/plain' }))
          URL.revokeObjectURL(url)
        }
        return { durationMs: performance.now() - started, ...window.__s9UrlStats, detector: window.__s9UrlDetector() }
      }, limits.soak.browserConsumerUrlCycles)
      const after = await heapUsage(normalCdp)
      const createdDelta = cycles.created - beforeStats.created
      const revokedDelta = cycles.revoked - beforeStats.revoked
      recorder.check(record, 'all consumer URLs revoked', cycles.live === 0 && cycles.detector.leaked === false, { live: 0, leaked: false }, cycles.detector)
      recorder.check(record, 'consumer cycle count', createdDelta === limits.soak.browserConsumerUrlCycles && revokedDelta === limits.soak.browserConsumerUrlCycles, limits.soak.browserConsumerUrlCycles, { created: createdDelta, revoked: revokedDelta })
      recorder.measure(record, 'consumer URL cycle duration', cycles.durationMs, 'ms', { cycles: limits.soak.browserConsumerUrlCycles })
      recorder.measure(record, 'browser heap delta after consumer cycles', mib(after.usedBytes - before.usedBytes), 'MiB', { monitoringLimitMiB: limits.soak.browserHeapGrowthMiB })
      results.measurements.consumerUrlCycles = { before, after, deltaBytes: after.usedBytes - before.usedBytes, ...cycles, createdDelta, revokedDelta, cycles: limits.soak.browserConsumerUrlCycles }
    })

    // Download failure and manual retry cycles.
    await runCase('playground-download-failure-retry', 'S9-07', 'Download failure status and bounded manual retry', async (record) => {
      const failureMessage = 'Download unavailable. Use Copy SVG or the manual copy panel instead.'
      const cycles = []
      for (let index = 0; index < limits.resilience.downloadFailureRetryCycles; index += 1) {
        await normalPage.evaluate(() => {
          window.__s9OriginalCreate = URL.createObjectURL.bind(URL)
          URL.createObjectURL = () => { throw new Error('S9 forced createObjectURL failure') }
        })
        const failedStarted = Date.now()
        await normalPage.evaluate(() => document.getElementById('download-svg').click())
        await normalPage.waitForTimeout(50)
        const failedStatus = await normalPage.evaluate(() => document.getElementById('status').textContent)
        await normalPage.evaluate(() => { URL.createObjectURL = window.__s9OriginalCreate })
        const retryStarted = Date.now()
        await normalPage.evaluate(() => document.getElementById('download-svg').click())
        await normalPage.waitForTimeout(1100)
        const retryStatus = await normalPage.evaluate(() => document.getElementById('status').textContent)
        cycles.push({
          index,
          failure: failedStatus,
          failureMs: Date.now() - failedStarted,
          retry: retryStatus,
          retryMs: Date.now() - retryStarted,
        })
        recorder.check(record, `retry ${index + 1} reports the fixed failure message`, failedStatus === failureMessage, failureMessage, failedStatus)
        recorder.check(record, `retry ${index + 1} succeeds after restoring createObjectURL`, retryStatus === 'SVG downloaded.', 'SVG downloaded.', retryStatus)
        recorder.check(record, `retry ${index + 1} completes within predeclared limit`, Date.now() - retryStarted <= limits.resilience.retrySuccessMaxMs, `<=${limits.resilience.retrySuccessMaxMs}ms`, `${Date.now() - retryStarted}ms`)
      }
      await normalPage.waitForTimeout(1200)
      const stats = await normalPage.evaluate(() => ({ ...window.__s9UrlStats, detector: window.__s9UrlDetector() }))
      recorder.check(record, 'failure/retry cycles leave no live object URLs', stats.live === 0 && stats.detector.leaked === false, { live: 0, leaked: false }, stats.detector)
      recorder.check(record, 'no uncaught page error during failure/retry', pageErrors.filter((entry) => entry.page === 'normal').length === 0, 0, pageErrors.filter((entry) => entry.page === 'normal'))
      results.measurements.downloadFailureRetry = { cycles, stats, retryCycles: limits.resilience.downloadFailureRetryCycles }
    })

    // Aborted app.js load: no auto-retry, readable fallback, explicit reload recovery.
    assetContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false })
    const assetPage = await assetContext.newPage()
    assetPage.on('pageerror', (error) => pageErrors.push({ page: 'asset', error: String(error) }))
    await assetPage.addInitScript(LONG_TASK_INIT)
    const appRequests = []
    assetPage.on('request', (request) => { if (request.url().includes('/assets/app.js')) appRequests.push({ url: request.url(), at: Date.now() }) })
    await assetContext.route('**/assets/app.js', (route) => route.abort('failed'))
    await runCase('playground-asset-failure', 'S9-07', 'Aborted app.js fallback, no auto-retry and reload recovery', async (record) => {
      const failedStarted = Date.now()
      await assetPage.goto(`${serverInfo.baseUrl}/?seed=s9-asset-failure`, { waitUntil: 'load', timeout: 30000 })
      await assetPage.waitForFunction(() => document.getElementById('status')?.dataset.state === 'failed', null, { timeout: 15000 })
      const failed = await assetPage.evaluate(() => ({
        status: document.getElementById('status').textContent,
        state: document.getElementById('status').dataset.state ?? null,
        disabled: [...document.querySelectorAll('#seed, #name, #size, #copy-svg, #download-svg, #copy-code, #share')].filter((element) => element.disabled).length,
        galleryButtons: document.querySelectorAll('#gallery button').length,
        docsCharacters: document.querySelector('.docs')?.textContent?.length ?? 0,
        appReady: document.documentElement.dataset.appReady ?? null,
        bodyText: document.body.textContent?.length ?? 0,
      }))
      const failureMessage = 'The interactive playground could not start. Its script may be blocked, unavailable, or have failed while loading. The controls stay unavailable; the rest of this page and its documentation remain readable after a reload with scripts working.'
      recorder.check(record, 'static failure message is shown', failed.status === failureMessage, failureMessage, failed.status)
      recorder.check(record, 'status is marked failed', failed.state === 'failed', 'failed', failed.state)
      recorder.check(record, 'interactive controls remain disabled', failed.disabled === 7, 7, failed.disabled)
      recorder.check(record, 'gallery is not falsely populated', failed.galleryButtons === 0, 0, failed.galleryButtons)
      recorder.check(record, 'documentation remains readable', failed.docsCharacters > 1000 && failed.bodyText > 1000, '>1000 characters', { docs: failed.docsCharacters, body: failed.bodyText })
      recorder.check(record, 'app readiness marker is absent', failed.appReady !== 'true', 'not true', failed.appReady)
      const failureMs = Date.now() - failedStarted
      await assetPage.waitForTimeout(limits.resilience.assetFailureNoAutoRetryWindowMs)
      const requestsDuringWindow = appRequests.length
      recorder.check(record, 'failed app request occurred exactly once', requestsDuringWindow === 1, 1, requestsDuringWindow)
      const screenshotPath = path.join(artifacts, 's9-asset-failure.png')
      await assetPage.screenshot({ path: screenshotPath, fullPage: true })
      const screenshotBytes = await fsp.readFile(screenshotPath)
      screenshots.push({ name: 's9-asset-failure.png', bytes: screenshotBytes.length, sha256: sha256(screenshotBytes), role: 'aborted app.js static fallback' })
      await assetContext.unroute('**/assets/app.js')
      const recoveryStarted = Date.now()
      await assetPage.reload({ waitUntil: 'load', timeout: 30000 })
      await waitReady(assetPage)
      const recovered = await assetPage.evaluate(() => ({
        status: document.getElementById('status').textContent,
        state: document.getElementById('status').dataset.state ?? null,
        galleryButtons: document.querySelectorAll('#gallery button').length,
        disabled: [...document.querySelectorAll('#seed, #name, #size, #copy-svg, #download-svg, #copy-code, #share')].filter((element) => element.disabled).length,
        appReady: document.documentElement.dataset.appReady,
      }))
      const recoveryMs = Date.now() - recoveryStarted
      recorder.check(record, 'reload after unblocking recovers the playground', recovered.galleryButtons === 8 && recovered.disabled === 0 && recovered.appReady === 'true', { gallery: 8, disabled: 0, ready: 'true' }, recovered)
      recorder.check(record, 'recovered status is empty', recovered.status === '' && recovered.state === null, { text: '', state: null }, { text: recovered.status, state: recovered.state })
      recorder.check(record, 'no automatic retry storm before recovery', appRequests.length === 2, 2, appRequests.map((entry) => entry.url))
      recorder.measure(record, 'fallback visible after abort', failureMs, 'ms')
      recorder.measure(record, 'recovery after explicit reload', recoveryMs, 'ms')
      results.measurements.assetFailure = { failed, failureMs, requestsDuringWindow, appRequests, recovered, recoveryMs }
    })

    await runCase('playground-page-error-summary', 'S9-07', 'Page error and console error summary', async (record) => {
      const relevantPageErrors = pageErrors.filter((entry) => entry.page !== 'asset')
      recorder.check(record, 'no uncaught page errors on clean throttled/normal pages', relevantPageErrors.length === 0, 0, relevantPageErrors)
      recorder.check(record, 'no console errors on clean throttled/normal pages', consoleErrors.length === 0, 0, consoleErrors)
      results.measurements.pageErrors = { pageErrors, consoleErrors }
    })
  } finally {
    if (mainContext) await mainContext.close().catch(() => {})
    if (normalContext) await normalContext.close().catch(() => {})
    if (assetContext) await assetContext.close().catch(() => {})
    await browser.close().catch(() => {})
    await closeServer(serverInfo.server)
  }

  results.screenshots = screenshots
  results.pageErrors = pageErrors
  results.consoleErrors = consoleErrors
  results.chromiumVersion = chromiumVersion
  results.completedAt = new Date().toISOString()
  return results
}
