#!/usr/bin/env node
/**
 * Stage 6 scenarios S6-06..S6-09 plus the three negative controls.
 *
 * S6-07 uses real Playwright clipboard reads on Chromium (desktop and Pixel 7
 * emulation), a denied-clipboard fallback on all four engines, real download
 * events and bytes, and an independent XML/SVG open of the downloaded file.
 * S6-08 writes the generated usage text to .mjs files and executes each in a
 * fresh Node process in the independent consumer; it never evals browser text.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  compareDigest,
  compareState,
  compareSvg,
  makeUsage,
  optionsFor,
  scenarioRecorder,
  sha256,
} from './s6-lib.mjs'
import {
  assertClean,
  assertRendered,
  assertThumbnail,
  captureScreenshot,
  closePage,
  openPage,
  readState,
  traceRecord,
} from './s6-page.mjs'

async function runScenario(ctx, id, fn) {
  const recorder = scenarioRecorder(id, ctx.expected.expectations[id])
  recorder.state.traces = []
  recorder.state.screenshots = []
  try {
    await fn(recorder.runCase, recorder.state)
  } catch (error) {
    recorder.state.failures.push({
      case: '__scenario__',
      assertions: 0,
      failures: [{ message: `scenario threw: ${error.message}`, detail: { stack: error.stack } }],
    })
  }
  return recorder.finish()
}

async function runS606(ctx, runCase, state) {
  const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: '/?seed=rapid-start&style=pixel-sprite&size=80' })
  const page = opened.page
  page.setDefaultTimeout(120_000)
  let rapid = { actions: 0, elapsedMs: 0, chunks: [] }
  const baselineRequests = opened.rec.requests.filter((entry) => !entry.url.endsWith('/favicon.svg')).length
  try {
    await runCase('rapid-30s-completes', async (c) => {
      c.check(!opened.gotoError, 'rapid page loaded', { error: opened.gotoError })
      const started = Date.now()
      for (let chunk = 0; chunk < 6; chunk += 1) {
        const result = await page.evaluate(async (durationMs) => {
          const seed = document.getElementById('seed')
          const name = document.getElementById('name')
          const size = document.getElementById('size')
          const buttons = [...document.querySelectorAll('#gallery button')]
          const sizes = ['48', '80', '128', '192']
          const names = ['', 'Ada', 'Zoe', '李', 'N-7']
          const startedAt = performance.now()
          let actions = 0
          while (performance.now() - startedAt < durationMs) {
            seed.value = `rapid-${actions}`
            seed.dispatchEvent(new Event('input', { bubbles: true }))
            name.value = names[actions % names.length]
            name.dispatchEvent(new Event('input', { bubbles: true }))
            size.value = sizes[actions % sizes.length]
            size.dispatchEvent(new Event('change', { bubbles: true }))
            buttons[actions % buttons.length].click()
            actions += 1
            if (actions % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
          }
          return { actions, elapsedMs: performance.now() - startedAt }
        }, 5_000)
        rapid.chunks.push(result)
        rapid.actions += result.actions
        rapid.elapsedMs += result.elapsedMs
      }
      rapid.wallMs = Date.now() - started
      c.check(rapid.wallMs >= 29_000, 'rapid session lasted at least 29 seconds', rapid)
      c.check(rapid.actions > 300, 'rapid session exercised many input changes', rapid)
      c.equal(opened.rec.pageErrors.length, 0, 'no page error during rapid input', { pageErrors: opened.rec.pageErrors })
      c.check(opened.rec.external.length === 0, 'no external requests during rapid input')
      c.check(rapid.chunks.every((entry) => entry.actions > 0), 'every rapid chunk did work', rapid.chunks)
    })

    const finalSeed = 'final-state-Ω'
    const finalName = 'Zoe'
    const finalStyle = 'ascii-face'
    const finalPx = 128
    const finalOptions = optionsFor(finalStyle, finalPx, finalName)
    const finalSvg = ctx.lib.ditherFace(finalSeed, finalOptions)

    await runCase('final-state-exact', async (c) => {
      await page.locator('#seed').fill(finalSeed)
      await page.locator('#name').fill(finalName)
      await page.locator('#size').selectOption(String(finalPx))
      await page.locator('#gallery button[data-style="ascii-face"]').click()
      await page.waitForFunction(
        (expected) => document.getElementById('svg-source')?.value === expected,
        finalSvg,
      )
      const st = await readState(page)
      c.equal(st.seed, finalSeed, 'final seed is the last requested value')
      c.equal(st.name, finalName, 'final name is the last requested value')
      c.equal(st.selected[0], finalStyle, 'final style is the last requested value')
      c.equal(st.size, String(finalPx), 'final size is the last requested value')
      c.check(compareSvg(finalSvg, st.source).ok, 'final source is exactly the last requested configuration')
      c.equal(st.usage, makeUsage(finalSeed, finalOptions), 'final usage is exactly the last configuration')
      c.equal(st.paramAll.seed?.[0], finalSeed, 'final URL seed')
      c.equal(st.paramAll.style?.[0], finalStyle, 'final URL style')
      c.equal(st.paramAll.size?.[0], String(finalPx), 'final URL size')
      c.equal(st.paramAll.name?.[0], finalName, 'final URL name')
      await assertRendered(c, page, '#preview', finalSvg, 'final preview matches the expected last state')
      const shot = await ctx.screenshot(page, 'S6-06-final')
      state.screenshots.push(shot)
    })

    await runCase('all-eight-thumbnails-final', async (c) => {
      const st = await readState(page)
      c.equal(st.galleryButtons, 8, 'eight gallery buttons after rapid input')
      for (let index = 0; index < ctx.lib.STYLES.length; index += 1) {
        const style = ctx.lib.STYLES[index]
        const expected = ctx.lib.ditherFace(finalSeed, optionsFor(style.slug, 64, finalName))
        await assertThumbnail(c, page, index, expected, `thumbnail ${style.slug} equals final seed/name at 64px`)
      }
    })

    await runCase('name-affects-only-letter-styles', async (c) => {
      const letter = new Set(['pixel-letter', 'ascii-letter', 'pixelify-letter'])
      for (const style of ctx.lib.STYLES) {
        const withoutName = ctx.lib.ditherFace(finalSeed, optionsFor(style.slug, 64, ''))
        const withName = ctx.lib.ditherFace(finalSeed, optionsFor(style.slug, 64, finalName))
        if (letter.has(style.slug)) {
          c.check(withoutName !== withName, `${style.slug} changes when the name changes`)
        } else {
          c.check(withoutName === withName, `${style.slug} is byte-identical when only the name changes`)
        }
      }
    })

    await runCase('no-orphan-async-stale', async (c) => {
      const before = await readState(page)
      const beforeThumbs = await page.$$eval('#gallery .thumb', (elements) => elements.map((element) => element.innerHTML))
      await page.waitForTimeout(2_000)
      const after = await readState(page)
      const afterThumbs = await page.$$eval('#gallery .thumb', (elements) => elements.map((element) => element.innerHTML))
      const comparison = compareState(
        {
          seed: before.seed,
          name: before.name,
          style: before.selected[0],
          size: before.size,
          source: before.source,
          url: before.url,
        },
        {
          seed: after.seed,
          name: after.name,
          style: after.selected[0],
          size: after.size,
          source: after.source,
          url: after.url,
        },
        ['seed', 'name', 'style', 'size', 'source', 'url'],
      )
      c.check(comparison.ok, 'settled state is stable after two seconds', comparison)
      c.equal(JSON.stringify(beforeThumbs), JSON.stringify(afterThumbs), 'no later async render replaced the gallery')
      c.equal(opened.rec.pageErrors.length, 0, 'no stale async page error')
    })

    await runCase('bounded-dom-no-runaway', async (c) => {
      const bounds = await page.evaluate(() => ({
        galleryButtons: document.querySelectorAll('#gallery button').length,
        thumbs: document.querySelectorAll('#gallery .thumb').length,
        previewSvgs: document.querySelectorAll('#preview svg').length,
        sourceLength: document.getElementById('svg-source')?.value.length ?? 0,
      }))
      c.equal(bounds.galleryButtons, 8, 'galleries stay at eight entries')
      c.equal(bounds.thumbs, 8, 'thumbnail spans stay at eight')
      c.equal(bounds.previewSvgs, 1, 'preview stays at one SVG')
      c.equal(bounds.sourceLength, finalSvg.length, 'source length stays exactly the expected SVG length')
      const currentRequests = opened.rec.requests.filter((entry) => !entry.url.endsWith('/favicon.svg')).length
      c.check(currentRequests === baselineRequests, 'rapid input caused no extra network requests', {
        before: baselineRequests,
        after: currentRequests,
        requests: opened.rec.requests.slice(-10),
      })
      c.check(rapid.actions > 300, 'no runaway was needed to produce the final stable state', rapid)
      assertClean(c, opened.rec, { label: 'rapid input' })
    })
  } finally {
    state.traces.push(traceRecord('rapid-sequence', opened.rec))
    await closePage(opened)
  }
}

function blobSpy() {
  const original = URL.createObjectURL.bind(URL)
  window.__blobSpy = []
  URL.createObjectURL = (value) => {
    const entry = {
      type: null,
      size: null,
      text: null,
      source: document.getElementById('svg-source')?.value ?? null,
      url: location.href,
    }
    try {
      entry.type = value.type
      entry.size = value.size
    } catch {
      // Keep the entry even if the blob is not a Blob.
    }
    window.__blobSpy.push(entry)
    if (value instanceof Blob) {
      value.text().then((text) => { entry.text = text }).catch(() => {})
    }
    return original(value)
  }
}

function denyClipboard() {
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => { throw new DOMException('denied', 'NotAllowedError') },
      },
    })
  } catch {
    // A browser that cannot override this will fail the fallback assertion.
  }
}

async function waitStatus(page, text) {
  await page.waitForFunction(
    (expected) => (document.getElementById('status')?.textContent ?? '').includes(expected),
    text,
    { timeout: 10_000 },
  )
}

async function runS607(ctx, runCase, state) {
  const actualUrl = '/?seed=copy-real&name=Ada&style=ascii-letter&size=80#frag'
  const actual = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: actualUrl,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  try {
    await runCase('chromium-copy-svg-actual', async (c) => {
      c.check(!actual.permissionError, 'Chromium clipboard permission granted', { error: actual.permissionError })
      const st = await readState(actual.page)
      await actual.page.locator('#copy-svg').click()
      await waitStatus(actual.page, 'SVG copied.')
      const clip = await actual.page.evaluate(() => navigator.clipboard.readText())
      c.equal(clip, st.source, 'actual clipboard contains the exact displayed SVG')
      assertClean(c, actual.rec, { label: 'actual copy svg' })
    })

    await runCase('chromium-copy-usage-actual', async (c) => {
      const st = await readState(actual.page)
      await actual.page.locator('#copy-code').click()
      await waitStatus(actual.page, 'Usage code copied.')
      const clip = await actual.page.evaluate(() => navigator.clipboard.readText())
      c.equal(clip, st.usage, 'actual clipboard contains the exact usage text')
    })

    await runCase('chromium-copy-link-current-url', async (c) => {
      const st = await readState(actual.page)
      await actual.page.locator('#share').click()
      await waitStatus(actual.page, 'Share link copied.')
      const clip = await actual.page.evaluate(() => navigator.clipboard.readText())
      c.equal(clip, st.url, 'actual clipboard contains the current share URL')
      c.check(clip.endsWith('#frag'), 'share URL keeps the current hash', { clip })
    })
  } finally {
    state.traces.push(traceRecord('actual-clipboard', actual.rec))
    await closePage(actual)
  }

  const download = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: '/?seed=download-real&name=7even&style=pixelify-letter&size=192',
    initScripts: [blobSpy],
  })
  let downloadText = null
  let downloadPath = null
  try {
    const st = await readState(download.page)
    const expected = ctx.lib.ditherFace('download-real', { style: 'pixelify-letter', px: 192, name: '7even' })
    cCheckShape(st, expected)

    await runCase('download-bytes-exact', async (c) => {
      const [event] = await Promise.all([
        download.page.waitForEvent('download'),
        download.page.locator('#download-svg').click(),
      ])
      c.equal(event.suggestedFilename(), 'dither-face.svg', 'download filename')
      downloadPath = path.join(ctx.downloadsDir, 'downloaded-dither-face.svg')
      await fsp.mkdir(ctx.downloadsDir, { recursive: true })
      await event.saveAs(downloadPath)
      downloadText = await fsp.readFile(downloadPath, 'utf8')
      c.check(compareSvg(st.source, downloadText).ok, 'download bytes equal the displayed source exactly')
      c.equal(Buffer.byteLength(downloadText), Buffer.byteLength(st.source), 'download byte length')
      c.equal(await event.failure(), null, 'download did not report a failure')
    })

    await runCase('download-blob-mime-xml', async (c) => {
      await download.page.waitForFunction(() => window.__blobSpy?.length && window.__blobSpy.at(-1).text !== null)
      const spy = await download.page.evaluate(() => window.__blobSpy.at(-1))
      c.equal(spy.type, 'image/svg+xml;charset=utf-8', 'Download Blob MIME type is SVG XML')
      c.equal(spy.size, Buffer.byteLength(st.source), 'Download Blob byte size equals the displayed SVG')
      c.equal(spy.text, st.source, 'Download Blob text captured at click equals the display')
    })

    await runCase('downloaded-svg-parses-and-opens', async (c) => {
      c.check(Boolean(downloadText), 'downloaded SVG text captured')
      c.check(compareSvg(st.source, downloadText ?? '').ok, 'downloaded bytes still equal the preview source')
      const probe = await download.context.newPage()
      try {
        const parsed = await probe.evaluate((text) => {
          const documentNode = new DOMParser().parseFromString(text, 'image/svg+xml')
          return {
            parserError: documentNode.querySelector('parsererror')?.textContent ?? null,
            root: documentNode.documentElement?.localName ?? null,
            xmlns: documentNode.documentElement?.getAttribute('xmlns') ?? null,
          }
        }, downloadText)
        c.equal(parsed.parserError, null, 'download parses as XML without parsererror')
        c.equal(parsed.root, 'svg', 'download XML root is svg')
        c.equal(parsed.xmlns, 'http://www.w3.org/2000/svg', 'download XML has the SVG namespace')
        await probe.goto(pathToFileURL(downloadPath).href, { waitUntil: 'load' })
        const openedDocument = await probe.evaluate(() => ({
          contentType: document.contentType,
          root: document.documentElement?.localName ?? null,
          textLength: document.documentElement?.textContent?.length ?? 0,
        }))
        c.equal(openedDocument.root, 'svg', 'downloaded SVG independently opens as an SVG document')
        c.equal(openedDocument.contentType, 'image/svg+xml', 'independent document MIME is image/svg+xml')
      } finally {
        await probe.close()
      }
    })
  } finally {
    state.traces.push(traceRecord('download', download.rec))
    await closePage(download)
  }

  await runCase('copy-during-rapid-input', async (c) => {
    const rapid = await openPage(ctx.chromium, {
      origin: ctx.origin,
      url: '/?seed=rapid-copy&style=ascii-letter&size=80',
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    try {
      c.check(!rapid.permissionError, 'rapid clipboard permission granted', { error: rapid.permissionError })
      await rapid.page.evaluate(() => {
        const seed = document.getElementById('seed')
        const name = document.getElementById('name')
        const size = document.getElementById('size')
        const buttons = [...document.querySelectorAll('#gallery button')]
        const sizes = ['48', '80', '128', '192']
        let index = 0
        window.__rapidTimer = setInterval(() => {
          seed.value = `rapid-copy-${index}`
          seed.dispatchEvent(new Event('input', { bubbles: true }))
          name.value = index % 2 ? 'Ada' : 'Zoe'
          name.dispatchEvent(new Event('input', { bubbles: true }))
          size.value = sizes[index % sizes.length]
          size.dispatchEvent(new Event('change', { bubbles: true }))
          buttons[index % buttons.length].click()
          index += 1
        }, 5)
      })
      await rapid.page.waitForTimeout(500)
      const captured = await rapid.page.evaluate(() => {
        clearInterval(window.__rapidTimer)
        const source = document.getElementById('svg-source').value
        document.getElementById('copy-svg').click()
        return { source, url: location.href }
      })
      await waitStatus(rapid.page, 'SVG copied.')
      const clip = await rapid.page.evaluate(() => navigator.clipboard.readText())
      c.equal(clip, captured.source, 'clipboard triggered during rapid input captured the click-time SVG')
      c.equal(captured.url, await rapid.page.evaluate(() => location.href), 'rapid copy did not navigate')
      assertClean(c, rapid.rec, { label: 'rapid copy' })
      state.traces.push(traceRecord('rapid-copy', rapid.rec))
    } finally {
      await closePage(rapid)
    }
  })

  await runCase('download-during-rapid-input', async (c) => {
    const rapid = await openPage(ctx.chromium, {
      origin: ctx.origin,
      url: '/?seed=rapid-download&style=pixel-landscape&size=80',
      initScripts: [blobSpy],
    })
    try {
      await rapid.page.evaluate(() => {
        const seed = document.getElementById('seed')
        const size = document.getElementById('size')
        const buttons = [...document.querySelectorAll('#gallery button')]
        const sizes = ['48', '80', '128', '192']
        let index = 0
        window.__rapidTimer = setInterval(() => {
          seed.value = `rapid-download-${index}`
          seed.dispatchEvent(new Event('input', { bubbles: true }))
          size.value = sizes[index % sizes.length]
          size.dispatchEvent(new Event('change', { bubbles: true }))
          buttons[index % buttons.length].click()
          index += 1
        }, 5)
      })
      await rapid.page.waitForTimeout(500)
      const eventPromise = rapid.page.waitForEvent('download')
      const capturedPromise = rapid.page.evaluate(() => {
        clearInterval(window.__rapidTimer)
        const source = document.getElementById('svg-source').value
        document.getElementById('download-svg').click()
        return { source }
      })
      const [event, captured] = await Promise.all([eventPromise, capturedPromise])
      const target = path.join(ctx.downloadsDir, 'rapid-dither-face.svg')
      await fsp.mkdir(ctx.downloadsDir, { recursive: true })
      await event.saveAs(target)
      const bytes = await fsp.readFile(target, 'utf8')
      c.equal(bytes, captured.source, 'download triggered during rapid input captured the click-time SVG')
      c.equal(event.suggestedFilename(), 'dither-face.svg', 'rapid download filename')
      assertClean(c, rapid.rec, { label: 'rapid download' })
      state.traces.push(traceRecord('rapid-download', rapid.rec))
    } finally {
      await closePage(rapid)
    }
  })

  async function fallbackCase(c, browser, label, options = {}) {
    const opened = await openPage(browser, {
      origin: ctx.origin,
      url: `/?seed=fallback-${label}&style=ascii-letter&name=Ada`,
      initScripts: [denyClipboard],
      contextOptions: options.contextOptions ?? {},
    })
    try {
      const st = await readState(opened.page)
      if (options.share) {
        await opened.page.locator('#share').click()
      } else {
        await opened.page.locator('#copy-svg').click()
      }
      await waitStatus(opened.page, 'Clipboard unavailable')
      const after = await readState(opened.page)
      const focus = await opened.page.evaluate(() => {
        const element = document.getElementById('manual-copy')
        return {
          active: document.activeElement === element,
          start: element?.selectionStart ?? null,
          end: element?.selectionEnd ?? null,
          length: element?.value.length ?? 0,
          status: document.getElementById('status')?.textContent ?? '',
        }
      })
      const expected = options.share ? st.url : st.source
      c.equal(after.manualValue, expected, `${label}: manual fallback contains the exact ${options.share ? 'share URL' : 'SVG'}`)
      c.check(after.manualOpen, `${label}: manual panel opens`)
      c.check(focus.active, `${label}: manual textarea is focused`)
      c.check(focus.start === 0 && focus.end === focus.length, `${label}: manual text is fully selected`, focus)
      c.check(focus.status.includes('Clipboard unavailable'), `${label}: visible unavailable status`, focus)
      c.equal(opened.rec.pageErrors.length, 0, `${label}: no unhandled page errors`, { pageErrors: opened.rec.pageErrors })
      c.equal(opened.rec.external.length, 0, `${label}: no external requests`, { external: opened.rec.external })
      c.equal(opened.rec.failed.length, 0, `${label}: no failed requests`, { failed: opened.rec.failed })
      c.equal(opened.rec.httpErrors.length, 0, `${label}: no HTTP >=400 responses`, { httpErrors: opened.rec.httpErrors })
      const unexpectedConsole = opened.rec.consoleErrors.filter((message) => !/Content Security Policy/.test(message))
      c.equal(unexpectedConsole.length, 0, `${label}: no unexpected console errors`, {
        unexpectedConsole,
        consoleErrors: opened.rec.consoleErrors,
      })
      state.traces.push(traceRecord(label, opened.rec))
    } finally {
      await closePage(opened)
    }
  }

  await runCase('fallback-chromium', (c) => fallbackCase(c, ctx.chromium, 'chromium'))
  await runCase('fallback-firefox', (c) => fallbackCase(c, ctx.firefox, 'firefox'))
  await runCase('fallback-webkit', (c) => fallbackCase(c, ctx.webkit, 'webkit'))
  await runCase('fallback-mobile-chromium', (c) => fallbackCase(c, ctx.chromium, 'mobile-chromium', {
    contextOptions: ctx.devices['Pixel 7'],
  }))
  await runCase('fallback-share-link', (c) => fallbackCase(c, ctx.chromium, 'share-link', { share: true }))

  await runCase('mobile-chromium-copy-svg-actual', async (c) => {
    const mobile = await openPage(ctx.chromium, {
      origin: ctx.origin,
      url: '/?seed=mobile-copy&name=Ada&style=ascii-letter&size=128',
      permissions: ['clipboard-read', 'clipboard-write'],
      contextOptions: ctx.devices['Pixel 7'],
    })
    try {
      c.check(!mobile.permissionError, 'mobile Chromium clipboard permission granted', { error: mobile.permissionError })
      const st = await readState(mobile.page)
      await mobile.page.locator('#copy-svg').click()
      await waitStatus(mobile.page, 'SVG copied.')
      const clip = await mobile.page.evaluate(() => navigator.clipboard.readText())
      c.equal(clip, st.source, 'mobile Chromium actual clipboard equals the displayed SVG')
      state.traces.push(traceRecord('mobile-actual-copy', mobile.rec))
    } finally {
      await closePage(mobile)
    }
  })
}

function cCheckShape(st, expected) {
  if (st.source !== expected) throw new Error('download fixture source did not match the expected library output')
}

async function runS608(ctx, runCase, state) {
  const consumer = ctx.consumerDir
  const dependency = await fsp.readFile(path.join(consumer, 'package.json'), 'utf8')
  const installedPackage = JSON.parse(await fsp.readFile(path.join(consumer, 'node_modules/dither-face/package.json'), 'utf8'))
  const installedPath = await fsp.realpath(path.join(consumer, 'node_modules/dither-face'))
  const installedStat = await fsp.lstat(path.join(consumer, 'node_modules/dither-face'))
  const tarballSha = sha256(await fsp.readFile(ctx.tarballPath))
  const snippetsDir = path.join(consumer, 'snippets')
  await fsp.mkdir(snippetsDir, { recursive: true })
  const usages = new Map()

  const writeAndRun = async (c, name, usage, guard = true) => {
    const file = path.join(snippetsDir, `${name}.mjs`)
    const content = `${usage}\n${guard ? "if (globalThis.__pwned !== undefined) throw new Error('injection sentinel set')\n" : ''}process.stdout.write(svg)\n`
    await fsp.writeFile(file, content)
    const result = await ctx.cmd(`s6-08-node-${name}`, `node snippets/${name}.mjs`, consumer, { timeout: 60_000 })
    c.equal(result.exitCode, 0, `${name}: Node consumer exited 0`, { stderr: result.stderr.slice(-1000) })
    c.equal(result.timedOut, false, `${name}: Node consumer did not time out`)
    return result.stdout
  }

  await runCase('install-actual-tarball', async (c) => {
    c.check(dependency.includes('dither-face'), 'consumer declares dither-face from the local tarball')
    c.equal(installedPackage.name, 'dither-face', 'installed package name')
    c.equal(installedPackage.version, '0.1.0', 'installed package version')
    c.equal(installedStat.isSymbolicLink(), false, 'installed package is not a symlink')
    c.equal(installedPath, path.join(consumer, 'node_modules/dither-face'), 'installed package real path is the consumer node_modules copy')
    c.equal(tarballSha, 'ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021', 'fixture tarball SHA-256')
    const probe = await ctx.cmd('s6-08-installed-import', `node -e "import('dither-face').then(m => console.log(typeof m.ditherFace, typeof m.STYLES, m.ditherFace('probe').length > 0))"`, consumer, { timeout: 60_000 })
    c.equal(probe.exitCode, 0, 'installed package imports in a fresh Node process')
    c.equal(probe.stdout.trim(), 'function object true', 'installed package exposes ditherFace/STYLES and renders')
    c.equal(ctx.setup.consumer.installExitCode, 0, 'npm install of the actual tarball exited 0')
  })

  const opened = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: '/?seed=preview-output&name=7even&style=pixel-sprite&size=80',
  })
  try {
    for (let index = 0; index < ctx.lib.STYLES.length; index += 1) {
      const style = ctx.lib.STYLES[index]
      await runCase(`exec-${style.slug}`, async (c) => {
        await opened.page.locator(`#gallery button[data-style="${style.slug}"]`).click()
        const st = await readState(opened.page)
        const expected = ctx.lib.ditherFace('preview-output', optionsFor(style.slug, 80, '7even'))
        c.check(compareSvg(expected, st.source).ok, `${style.slug}: displayed source before snippet execution`)
        const golden = compareDigest(ctx.goldenHashes[style.slug], st.source)
        c.check(golden.ok, `${style.slug}: displayed source matches recorded golden`, golden)
        c.equal(st.usage, makeUsage('preview-output', optionsFor(style.slug, 80, '7even')), `${style.slug}: generated usage text`)
        usages.set(style.slug, st.usage)
        const stdout = await writeAndRun(c, `exec-${style.slug}`, st.usage)
        c.equal(stdout, st.source, `${style.slug}: Node consumer stdout equals displayed source`)
        c.check(compareDigest(ctx.goldenHashes[style.slug], stdout).ok, `${style.slug}: Node consumer output matches golden`)
      })
    }
  } finally {
    state.traces.push(traceRecord('snippet-site', opened.rec))
    await closePage(opened)
  }

  await runCase('name-empty-behavior', async (c) => {
    const opened = await openPage(ctx.chromium, {
      origin: ctx.origin,
      url: '/?seed=snippet-empty&style=ascii-letter&size=80',
    })
    try {
      const st = await readState(opened.page)
      c.equal(st.name, '', 'name is empty in the site')
      c.check(st.usage.includes('"name"') === false, 'usage omits the name option when empty')
      c.equal(st.usage, makeUsage('snippet-empty', optionsFor('ascii-letter', 80, '')), 'usage is the seed-only call')
      c.check(compareSvg(ctx.lib.ditherFace('snippet-empty', { style: 'ascii-letter', px: 80 }), st.source).ok, 'display is seed-only render')
      const stdout = await writeAndRun(c, 'name-empty', st.usage)
      c.equal(stdout, st.source, 'empty-name snippet output equals display')
    } finally {
      state.traces.push(traceRecord('snippet-empty', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('hostile-strings-safe', async (c) => {
    const seed = '"><script>globalThis.__pwned=1</script> \\ 東京 "quoted"'
    const name = 'x" onload="globalThis.__pwned=2'
    const params = new URLSearchParams({ seed, name, style: 'ascii-letter', size: '80' })
    const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: `/?${params}` })
    try {
      const st = await readState(opened.page)
      const usage = st.usage
      c.check(usage.startsWith("import { ditherFace } from 'dither-face'"), 'hostile usage starts with the real import')
      c.check(!usage.includes('eval('), 'hostile usage contains no eval call')
      c.check(!usage.includes('Function('), 'hostile usage contains no Function constructor')
      c.check(!usage.includes('require('), 'hostile usage contains no require call')
      c.check(usage.includes(JSON.stringify(seed)), 'hostile seed is embedded as a JSON string literal')
      c.check(usage.includes(JSON.stringify(name)), 'hostile name is embedded as a JSON string literal')
      const stdout = await writeAndRun(c, 'hostile', usage)
      c.equal(stdout, st.source, 'hostile snippet output equals the displayed source')
      c.check(!stdout.includes('<script>'), 'hostile output contains no raw script tag')
      c.check(!stdout.includes('<img'), 'hostile output contains no raw image tag')
      const injected = await opened.page.evaluate(() => window.__pwned ?? null)
      c.equal(injected, null, 'hostile page did not execute a sentinel')
      assertClean(c, opened.rec, { label: 'hostile snippet' })
    } finally {
      state.traces.push(traceRecord('hostile-snippet', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('import-present-code-valid', async (c) => {
    c.equal(usages.size, 8, 'all eight generated usages captured')
    for (const [slug, usage] of usages) {
      c.equal(usage.split('\n')[0], "import { ditherFace } from 'dither-face'", `${slug}: exact import line`)
      c.equal((usage.match(/^import /gm) ?? []).length, 1, `${slug}: exactly one import statement`)
      c.check(usage.includes('const svg = ditherFace('), `${slug}: renders through ditherFace`)
      c.check(!/eval\(|Function\(|require\(|process\.|document\.|window\./.test(usage), `${slug}: no forbidden execution or browser globals`)
      const file = path.join(snippetsDir, `exec-${slug}.mjs`)
      const check = await ctx.cmd(`s6-08-check-${slug}`, `node --check snippets/exec-${slug}.mjs`, consumer, { timeout: 60_000 })
      c.equal(check.exitCode, 0, `${slug}: generated module passes node --check`, { stderr: check.stderr.slice(-500) })
      c.check((await fsp.stat(file)).size > usage.length, `${slug}: snippet file contains the generated usage plus output line`)
    }
  })
}

async function runS609(ctx, runCase, state) {
  const jsBlocked = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: '/',
    waitReady: false,
    blocks: [{ glob: '**/assets/app.js' }],
  })
  let cssBlocked = null
  let disabled = null
  let bootThrow = null
  let goodLoad = null
  await jsBlocked.page.waitForTimeout(1_500)
  await runCase('js-blocked-static-fallback', async (c) => {
      const view = await jsBlocked.page.evaluate(() => ({
        text: document.body.innerText,
        h1: document.querySelector('h1')?.innerText ?? '',
        galleryButtons: document.querySelectorAll('#gallery button').length,
        previewSvgs: document.querySelectorAll('#preview svg').length,
        status: document.getElementById('status')?.textContent ?? '',
        statusState: document.getElementById('status')?.getAttribute('data-state') ?? null,
        statusRole: document.getElementById('status')?.getAttribute('role') ?? null,
        statusVisible: (() => {
          const element = document.getElementById('status')
          if (!element) return false
          const style = getComputedStyle(element)
          return element.offsetParent !== null && style.display !== 'none' && style.visibility !== 'hidden'
        })(),
        controlsDisabled: ['seed', 'name', 'size', 'copy-svg', 'download-svg', 'copy-code', 'share']
          .every((id) => document.getElementById(id)?.disabled === true),
        noscriptVisible: (() => {
          const element = document.querySelector('noscript')
          if (!element) return null
          const style = getComputedStyle(element)
          return element.offsetParent !== null && style.display !== 'none'
        })(),
      }))
      c.check(view.text.length > 500, 'static fallback has meaningful text', { length: view.text.length })
      c.check(view.h1.includes('One seed'), 'hero heading remains visible', { h1: view.h1 })
      c.check(view.text.includes('Make an identity'), 'playground heading remains visible')
      c.check(view.text.includes('Plain SVG. Clear rules.'), 'documentation remains visible')
      c.equal(view.galleryButtons, 0, 'playground controls do not render without the JS bundle')
      c.equal(view.previewSvgs, 0, 'avatar preview does not render without the JS bundle')
      c.check(view.status.includes('could not start'), 'explicit in-page failure status is shown', { status: view.status })
      c.equal(view.statusState, 'failed', 'failure status is marked failed')
      c.equal(view.statusRole, 'status', 'failure status uses the existing status role')
      c.check(view.statusVisible, 'failure status is rendered', { status: view.status })
      c.check(view.controlsDisabled, 'playground controls stay disabled when the bundle fails')
      c.check(view.noscriptVisible === false, 'noscript notice is not shown while scripting is enabled')
      state.notes.push({
        severity: 'info',
        message: 'JS bundle blocked: static hero/docs/footer remain readable, the existing status region shows explicit failure feedback, controls stay disabled, and no gallery is presented as active. Q-002 recheck evidence recorded; disposition remains parent-owned.',
      })
    })

    await runCase('js-blocked-explicit-status', async (c) => {
      const view = await jsBlocked.page.evaluate(() => ({
        message: document.getElementById('status')?.textContent ?? '',
        state: document.getElementById('status')?.getAttribute('data-state') ?? null,
        appReady: document.documentElement.dataset.appReady ?? null,
        ariaBusy: document.querySelector('.playground')?.getAttribute('aria-busy') ?? null,
        galleryButtons: document.querySelectorAll('#gallery button').length,
        previewSvgs: document.querySelectorAll('#preview svg').length,
        seedValue: document.getElementById('seed')?.value ?? null,
        nameValue: document.getElementById('name')?.value ?? null,
      }))
      c.check(view.message.includes('could not start'), 'failure message explains the app did not start', { message: view.message })
      c.equal(view.state, 'failed', 'failure message state remains failed')
      c.equal(view.appReady, null, 'app never marked itself ready')
      c.equal(view.ariaBusy, 'true', 'playground remains busy while unavailable')
      c.equal(view.galleryButtons, 0, 'no falsely active blank gallery')
      c.equal(view.previewSvgs, 0, 'no blank preview is presented as rendered')
      c.equal(view.seedValue, '', 'static seed stays empty before the app initializes')
      c.equal(view.nameValue, '', 'static name stays empty before the app initializes')
    })

    await runCase('js-blocked-network-vs-pageerror', async (c) => {
      const appFailures = jsBlocked.rec.failed.filter((entry) => entry.url.endsWith('/assets/app.js'))
      c.equal(appFailures.length, 1, 'exactly one failed app.js request', { failed: jsBlocked.rec.failed })
      c.check(appFailures[0]?.errorText, 'failed asset has a network error text', appFailures[0])
      c.equal(jsBlocked.rec.pageErrors.length, 0, 'no application unhandled exception', { pageErrors: jsBlocked.rec.pageErrors })
      c.equal(jsBlocked.rec.httpErrors.length, 0, 'no HTTP >=400 response for the blocked asset')
      c.check(!jsBlocked.rec.pageErrors.some((message) => /TypeError|ReferenceError|Uncaught/.test(message)), 'no app exception text')
      state.notes.push({
        severity: 'info',
        message: 'Blocked asset produced a network request failure, not an application page error; console error entries (if any) are recorded separately in the trace.',
      })
    })

    await runCase('js-blocked-no-retry-no-blank', async (c) => {
      const before = await jsBlocked.page.evaluate(() => document.body.innerText.length)
      await jsBlocked.page.waitForTimeout(5_000)
      const after = await jsBlocked.page.evaluate(() => document.body.innerText.length)
      const requests = jsBlocked.rec.requests.filter((entry) => entry.url.endsWith('/assets/app.js'))
      c.equal(requests.length, 1, 'JS bundle is requested exactly once, no retry loop', { requests })
      c.check(after > 500, 'page remains non-blank after five seconds', { before, after })
      c.check(Math.abs(after - before) < 200, 'static fallback text is stable', { before, after })
      const shot = await captureScreenshot(jsBlocked.page, ctx.screenshotsDir, 'S6-09-js-blocked')
      state.screenshots.push(shot)
      assertClean(c, jsBlocked.rec, { allowFailed: 1, allowConsoleErrors: jsBlocked.rec.consoleErrors.length, label: 'js blocked' })
    })

    cssBlocked = await openPage(ctx.chromium, {
      origin: ctx.origin,
      url: '/?seed=css-blocked',
      blocks: [{ glob: '**/site.css' }],
    })
    await runCase('css-blocked-playground-functional', async (c) => {
      const initial = await readState(cssBlocked.page)
      c.equal(initial.galleryButtons, 8, 'playground renders without CSS')
      c.equal(initial.previewSvgCount, 1, 'preview renders without CSS')
      await cssBlocked.page.locator('#seed').fill('css-blocked-seed')
      const st = await readState(cssBlocked.page)
      const expected = ctx.lib.ditherFace('css-blocked-seed', { style: st.selected[0], px: Number(st.size) })
      c.check(compareSvg(expected, st.source).ok, 'controls still update the SVG without CSS')
      const failures = cssBlocked.rec.failed.filter((entry) => entry.url.endsWith('/site.css'))
      c.equal(failures.length, 1, 'exactly one failed CSS request', { failed: cssBlocked.rec.failed })
      c.equal(cssBlocked.rec.pageErrors.length, 0, 'no page error without CSS')
      assertClean(c, cssBlocked.rec, { allowFailed: 1, allowConsoleErrors: cssBlocked.rec.consoleErrors.length, label: 'css blocked' })
    })

    await runCase('css-blocked-no-retry-unstyled', async (c) => {
      await cssBlocked.page.waitForTimeout(5_000)
      const stateView = await cssBlocked.page.evaluate(() => {
        const rootStyle = getComputedStyle(document.documentElement)
        const bodyStyle = getComputedStyle(document.body)
        return {
          textLength: document.body.innerText.length,
          fontFamily: rootStyle.fontFamily,
          backgroundColor: rootStyle.backgroundColor,
          bodyBackground: bodyStyle.backgroundColor,
          cssRequests: performance.getEntriesByType('resource').length,
        }
      })
      const cssRequests = cssBlocked.rec.requests.filter((entry) => entry.url.endsWith('/site.css'))
      c.equal(cssRequests.length, 1, 'CSS is requested exactly once, no retry loop', { cssRequests })
      c.check(!stateView.fontFamily.includes('ui-monospace'), 'page is visibly unstyled without CSS', stateView)
      c.check(stateView.textLength > 500, 'content remains readable without CSS', { length: stateView.textLength })
      c.equal(cssBlocked.rec.pageErrors.length, 0, 'still no page error after settle')
      const shot = await captureScreenshot(cssBlocked.page, ctx.screenshotsDir, 'S6-09-css-blocked')
      state.screenshots.push(shot)
      state.notes.push({
        severity: 'S3',
        message: 'CSS blocked: playground remains fully functional and readable, but the page is unstyled. Cosmetic user impact recorded for parent review.',
      })
    })

  disabled = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: '/',
    waitReady: false,
    contextOptions: { javaScriptEnabled: false },
  })
  await runCase('js-disabled-noscript', async (c) => {
      const noscript = disabled.page.locator('noscript')
      const noscriptText = (await noscript.textContent()) ?? ''
      const noscriptVisible = await noscript.isVisible()
      const bodyText = await disabled.page.locator('body').innerText()
      const heading = await disabled.page.locator('h1').first().innerText()
      const galleryButtons = await disabled.page.locator('#gallery button').count()
      c.check(noscriptVisible, 'noscript content is rendered when JavaScript is disabled')
      c.check(noscriptText.includes('needs JavaScript'), 'noscript explains that JavaScript is required', { text: noscriptText })
      c.check(bodyText.includes('This playground needs JavaScript'), 'visible body text includes the noscript explanation')
      c.check(heading.includes('One seed'), 'static hero remains visible with JavaScript disabled')
      c.equal(galleryButtons, 0, 'no gallery without JavaScript')
      c.check((await disabled.page.locator('#status').innerText()).includes('Loading the interactive playground'), 'static status explains the app has not loaded')
      c.check(await disabled.page.locator('#seed').isDisabled(), 'controls stay disabled without JavaScript')
      c.equal(disabled.rec.pageErrors.length, 0, 'no page error with JavaScript disabled')
      const shot = await captureScreenshot(disabled.page, ctx.screenshotsDir, 'S6-09-js-disabled')
      state.screenshots.push(shot)
      state.notes.push({
        severity: 'info',
        message: 'JavaScript disabled: the documented noscript notice is visible, the static status explains the app is unavailable, controls stay disabled, and static content remains.',
      })
    })

  bootThrow = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: '/?seed=boot-throw',
    waitReady: false,
    routes: [{
      glob: '**/assets/app.js',
      handler: (route) => route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: 'throw new Error("S6 boot regression")',
      }),
    }],
  })
  await bootThrow.page.waitForTimeout(1_000)
  await runCase('js-bootthrow-explicit-status', async (c) => {
    const view = await bootThrow.page.evaluate(() => ({
      message: document.getElementById('status')?.textContent ?? '',
      state: document.getElementById('status')?.getAttribute('data-state') ?? null,
      appReady: document.documentElement.dataset.appReady ?? null,
      galleryButtons: document.querySelectorAll('#gallery button').length,
      previewSvgs: document.querySelectorAll('#preview svg').length,
      controlsDisabled: ['seed', 'name', 'size', 'copy-svg', 'download-svg', 'copy-code', 'share']
        .every((id) => document.getElementById(id)?.disabled === true),
    }))
    c.check(view.message.includes('could not start'), 'boot error produces readable failure feedback', { message: view.message })
    c.equal(view.state, 'failed', 'boot error marks the status failed')
    c.equal(view.appReady, null, 'boot error never marks the app ready')
    c.equal(view.galleryButtons, 0, 'boot error leaves no falsely active gallery')
    c.equal(view.previewSvgs, 0, 'boot error leaves no blank preview')
    c.check(view.controlsDisabled, 'boot error keeps controls disabled')
    c.equal(bootThrow.rec.failed.length, 0, 'boot error is not a network failure')
    c.equal(bootThrow.rec.pageErrors.length, 1, 'boot error is recorded as one page error', { pageErrors: bootThrow.rec.pageErrors })
    c.check(bootThrow.rec.pageErrors.some((message) => message.includes('S6 boot regression')), 'recorded boot error matches the injected throw')
  })

  goodLoad = await openPage(ctx.chromium, { origin: ctx.origin, url: '/?seed=good-load' })
  await runCase('good-load-loading-cleared', async (c) => {
    const view = await goodLoad.page.evaluate(() => ({
      statusText: document.getElementById('status')?.textContent ?? '',
      statusState: document.getElementById('status')?.getAttribute('data-state') ?? null,
      appReady: document.documentElement.dataset.appReady ?? null,
      ariaBusy: document.querySelector('.playground')?.getAttribute('aria-busy') ?? null,
      controlsDisabled: ['seed', 'name', 'size', 'copy-svg', 'download-svg', 'copy-code', 'share']
        .some((id) => document.getElementById(id)?.disabled === true),
      galleryButtons: document.querySelectorAll('#gallery button').length,
      previewSvgs: document.querySelectorAll('#preview svg').length,
      bodyHasLoadingText: document.body.innerText.includes('Loading the interactive playground'),
    }))
    c.equal(view.statusText, '', 'successful initial render clears the loading status')
    c.equal(view.statusState, null, 'successful render removes the loading state marker')
    c.equal(view.appReady, 'true', 'successful render marks the app ready')
    c.equal(view.ariaBusy, 'false', 'successful render clears the playing busy flag')
    c.check(!view.controlsDisabled, 'successful render enables every playground control')
    c.equal(view.galleryButtons, 8, 'successful render exposes all eight gallery buttons')
    c.equal(view.previewSvgs, 1, 'successful render exposes one preview SVG')
    c.check(!view.bodyHasLoadingText, 'no loading text remains after a good load')
    assertClean(c, goodLoad.rec, { label: 'good load' })
  })

  await runCase('no-permanent-blank-both-modes', async (c) => {
    const jsText = await jsBlocked.page.evaluate(() => document.body.innerText.length)
    const cssText = await cssBlocked.page.evaluate(() => document.body.innerText.length)
    c.check(jsText > 500, 'JS-blocked page is not a permanent blank after settle', { length: jsText })
    c.check(cssText > 500, 'CSS-blocked page is not a permanent blank after settle', { length: cssText })
    c.check(await jsBlocked.page.locator('h1').first().isVisible(), 'JS-blocked hero is still visible')
    c.check(await cssBlocked.page.locator('h1').first().isVisible(), 'CSS-blocked hero is still visible')
  })

  state.traces.push(traceRecord('js-blocked', jsBlocked.rec))
  if (cssBlocked) state.traces.push(traceRecord('css-blocked', cssBlocked.rec))
  if (disabled) state.traces.push(traceRecord('js-disabled', disabled.rec))
  if (bootThrow) state.traces.push(traceRecord('js-bootthrow', bootThrow.rec))
  if (goodLoad) state.traces.push(traceRecord('good-load', goodLoad.rec))
  await closePage(jsBlocked)
  await closePage(cssBlocked)
  await closePage(disabled)
  await closePage(bootThrow)
  await closePage(goodLoad)
}

export async function runScenariosB(ctx) {
  const results = {}
  results['S6-06'] = await runScenario(ctx, 'S6-06', (runCase, state) => runS606(ctx, runCase, state))
  results['S6-07'] = await runScenario(ctx, 'S6-07', (runCase, state) => runS607(ctx, runCase, state))
  results['S6-08'] = await runScenario(ctx, 'S6-08', (runCase, state) => runS608(ctx, runCase, state))
  results['S6-09'] = await runScenario(ctx, 'S6-09', (runCase, state) => runS609(ctx, runCase, state))
  return results
}

export async function runNegativeControls(ctx) {
  const controls = []

  const goldenSvg = ctx.lib.ditherFace('preview-output', { style: 'pixel-sprite', px: 80, name: '7even' })
  const exact = compareSvg(goldenSvg, goldenSvg)
  const decoded = Buffer.from(goldenSvg, 'utf8').toString('base64')
  const decodedSvg = Buffer.from(decoded, 'base64').toString('utf8')
  const mutatedSvg = decodedSvg.replace('width="80"', 'width="81"')
  const wrongDecoded = compareSvg(goldenSvg, mutatedSvg)
  const wrongDigest = compareDigest('0'.repeat(64), goldenSvg)
  controls.push({
    id: 'S6-NC1',
    name: 'wrong decoded SVG and wrong digest',
    detected: exact.ok === true && wrongDecoded.ok === false && wrongDigest.ok === false,
    details: { exact: exact.ok, wrongDecoded: wrongDecoded.ok, wrongDigest: wrongDigest.ok, mutatedChanged: goldenSvg !== mutatedSvg },
  })

  const stalePage = await openPage(ctx.chromium, { origin: ctx.origin, url: '/?seed=stale-a&style=pixel-sprite&size=80' })
  let staleState = null
  try {
    const st = await readState(stalePage.page)
    staleState = {
      seed: st.seed,
      name: st.name,
      style: st.selected[0],
      size: st.size,
      source: st.source,
      url: st.url,
    }
    await stalePage.page.goto(`${ctx.origin}/?seed=stale-b&style=ascii-letter&size=128&name=Zoe`, { waitUntil: 'load' })
    await stalePage.page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8)
    const changed = await readState(stalePage.page)
    const changedState = {
      seed: changed.seed,
      name: changed.name,
      style: changed.selected[0],
      size: changed.size,
      source: changed.source,
      url: changed.url,
    }
    const same = compareState(staleState, staleState, ['seed', 'name', 'style', 'size', 'source', 'url'])
    const stale = compareState(staleState, changedState, ['seed', 'name', 'style', 'size', 'source', 'url'])
    controls.push({
      id: 'S6-NC2',
      name: 'stale URL state',
      detected: same.ok === true && stale.ok === false,
      details: { same: same.ok, stale: stale.ok, differences: stale.differences },
    })
  } finally {
    if (stalePage) await closePage(stalePage)
  }

  const fallback = await openPage(ctx.chromium, {
    origin: ctx.origin,
    url: '/?seed=nc-clipboard&style=ascii-letter&name=Ada',
    initScripts: [denyClipboard],
  })
  try {
    const st = await readState(fallback.page)
    await fallback.page.locator('#copy-svg').click()
    await waitStatus(fallback.page, 'Clipboard unavailable')
    const after = await readState(fallback.page)
    const exactClipboard = compareState({ source: st.source }, { source: after.manualValue }, ['source'])
    const wrongClipboard = compareState({ source: st.source }, { source: `${after.manualValue} ` }, ['source'])
    controls.push({
      id: 'S6-NC3',
      name: 'clipboard denial fallback and wrong clipboard value',
      detected:
        after.manualOpen === true &&
        exactClipboard.ok === true &&
        wrongClipboard.ok === false &&
        after.status.includes('Clipboard unavailable'),
      details: { manualOpen: after.manualOpen, exact: exactClipboard.ok, wrong: wrongClipboard.ok, status: after.status },
    })
  } finally {
    await closePage(fallback)
  }

  return controls
}
