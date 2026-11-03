/**
 * Stage 2 browser scenarios: S2-03 (cross-engine raw bytes), S2-05 (mixed
 * repeated IDs and inline-vs-isolated rendering), S2-06 (data URLs) and
 * S2-07 (file and localhost HTTP embedding).
 *
 * Browsers are launched with Playwright defaults: no disabled web security,
 * no file-access override, and no external URL is requested. The bundle used
 * here is built by the main harness from the installed tarball.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canonicalDiagnostic,
  canonicalElement,
  corruptSingleByte,
  definitionAnalysis,
  elementsByName,
  parseSvg,
  pngMetrics,
  pixelDiff,
  rawCompare,
  removeDefs,
  rootInfo,
  sha256,
} from './s2-svg.mjs'

const ENGINES = ['chromium', 'firefox', 'webkit']

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || 'empty'
}

function localUrl(url, origin) {
  if (url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:')) return true
  if (origin) return url.startsWith(origin)
  return url.startsWith('file://')
}

async function waitForProbe(page, timeout = 15000) {
  await page.waitForFunction(() => window.__s2 && (window.__s2.loaded === true || window.__s2.error === true), undefined, { timeout })
  return page.evaluate(() => window.__s2)
}

function canvasProbeSource() {
  return `async function probe(img) {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    let opaque = 0
    const colors = new Set()
    let data
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    } catch (error) {
      return { error: String(error), loaded: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, opaque: 0, distinctColors: 0 }
    }
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        opaque += 1
        colors.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + data[i + 3])
      }
    }
    return { loaded: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, opaque, distinctColors: colors.size }
  }`
}

function buildTextMask(rects, px, pad = 3) {
  const mask = new Uint8Array(px * px)
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x) - pad)
    const y0 = Math.max(0, Math.floor(rect.y) - pad)
    const x1 = Math.min(px, Math.ceil(rect.x + rect.width) + pad)
    const y1 = Math.min(px, Math.ceil(rect.y + rect.height) + pad)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) mask[y * px + x] = 1
    }
  }
  return mask
}

async function textRectsFor(page, selector) {
  return page.evaluate((sel) => {
    const svg = document.querySelector(sel)
    if (!svg) return []
    const base = svg.getBoundingClientRect()
    return Array.from(svg.querySelectorAll('text')).map((text) => {
      const rect = text.getBoundingClientRect()
      return { x: rect.left - base.left, y: rect.top - base.top, width: rect.width, height: rect.height }
    })
  }, selector)
}

async function newPageFor(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  return { context, page }
}

async function installBundle(page, bundlePath) {
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  await page.addScriptTag({ path: bundlePath })
  const ready = await page.evaluate(() => typeof window.DitherFace?.ditherFace === 'function')
  if (!ready) throw new Error('installed-package browser bundle did not expose DitherFace.ditherFace')
}

async function runS203(ctx, browsers, outRoot) {
  const id = 'S2-03'
  const engineRows = {}
  const cases = ctx.crossEngineCases
  for (const engine of ENGINES) {
    const { context, page } = await newPageFor(browsers[engine])
    try {
      await installBundle(page, ctx.bundlePath)
      const browserSvgs = await page.evaluate((items) => items.map((item) => {
        const options = { style: item.style, px: item.px }
        if (item.name !== null) options.name = item.name
        return window.DitherFace.ditherFace(item.seed, options)
      }), cases)
      const rows = []
      for (let index = 0; index < cases.length; index += 1) {
        const testCase = cases[index]
        const expected = ctx.nodeRenders.get(ctx.caseKey(testCase))
        const actual = browserSvgs[index]
        addBrowserCase(ctx, id)
        const comparison = rawCompare(expected, actual)
        ctx.assert(id, comparison.equal, `${engine}: raw bytes equal for ${testCase.style}/${testCase.seed}/${testCase.name ?? '-'}@${testCase.px}`, {
          comparison,
          expectedSha256: sha256(expected),
          actualSha256: sha256(actual),
          canonicalEqual: comparison.equal ? null : canonicalDiagnostic(expected, ctx.DOMParserCtor) === canonicalDiagnostic(actual, ctx.DOMParserCtor),
        })
        rows.push({
          style: testCase.style,
          seed: testCase.seed,
          name: testCase.name,
          px: testCase.px,
          nodeSha256: sha256(expected),
          browserSha256: sha256(actual),
          equal: comparison.equal,
          comparison,
        })
      }
      const corrupted = corruptSingleByte(ctx.nodeRenders.get(ctx.caseKey(cases[0])))
      const corruptionComparison = rawCompare(ctx.nodeRenders.get(ctx.caseKey(cases[0])), corrupted.corrupted)
      addBrowserCase(ctx, id)
      ctx.assert(id, !corruptionComparison.equal, `${engine}: single-byte corruption negative control is detected`, {
        offset: corrupted.offset,
        originalByte: corrupted.originalByte,
        newByte: corrupted.newByte,
        comparison: corruptionComparison,
      })

      // Render observation: one contact sheet per engine, all sampled SVGs inline.
      const sheetPage = await context.newPage()
      try {
        await sheetPage.setViewportSize({ width: 1400, height: 900 })
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>
          body{margin:0;background:#f4f2ec;font:11px system-ui,sans-serif}
          .grid{display:grid;grid-template-columns:repeat(8,150px);gap:10px;padding:12px}
          figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px}
          figcaption{max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .avatar{width:120px;height:120px;display:flex;align-items:center;justify-content:center}
          .avatar svg{max-width:120px;max-height:120px}
        </style></head><body><div class="grid" id="grid"></div></body></html>`
        await sheetPage.setContent(html)
        await sheetPage.evaluate(({ items, svgs }) => {
          const grid = document.getElementById('grid')
          grid.innerHTML = items.map((item, index) => `<figure><div class="avatar">${svgs[index]}</div><figcaption>${item.style} · ${item.px}px</figcaption></figure>`).join('')
        }, { items: cases, svgs: browserSvgs })
        await sheetPage.evaluate(() => document.fonts.ready.then(() => true))
        const buffer = await sheetPage.screenshot({ fullPage: true })
        const file = path.join(outRoot, `S2-03-${engine}-contact.png`)
        await fsp.writeFile(file, buffer)
        const metrics = pngMetrics(buffer, ctx.PNG)
        ctx.assert(id, metrics.distinctColors > 4 && metrics.opaquePixels > 1000, `${engine}: contact sheet is nonblank`, { metrics, file })
        rows.push({ contactSheet: file, contactMetrics: metrics })
      } finally {
        await sheetPage.close()
      }
      engineRows[engine] = { browserVersion: await browsers[engine].version(), executablePath: browsers[engine].browserType().executablePath(), rows }
    } finally {
      await context.close()
    }
  }
  return { cases: cases.length, engines: engineRows }
}

async function runS205(ctx, browsers, outRoot) {
  const id = 'S2-05'
  const browser = browsers.chromium
  const instances = ctx.mixedInstances
  const svgs = ctx.mixedSvgs
  const dir = path.join(outRoot, 'S2-05')
  await fsp.mkdir(path.join(dir, 'inline'), { recursive: true })
  await fsp.mkdir(path.join(dir, 'isolated'), { recursive: true })

  const inlineHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;background:transparent;font:10px system-ui,sans-serif}
    .grid{display:grid;grid-template-columns:repeat(10,var(--col));gap:14px;padding:16px;align-items:start}
    .cell{display:flex;align-items:center;justify-content:center;overflow:hidden}
    .cell svg{display:block;flex:0 0 auto}
  </style></head><body><div class="grid" id="grid"></div></body></html>`
  const { context: inlineContext, page: inlinePage } = await newPageFor(browser, { viewport: { width: 1600, height: 1200 } })
  const { context: isolatedContext, page: isolatedPage } = await newPageFor(browser, { viewport: { width: 500, height: 500 } })
  const rows = []
  try {
    await inlinePage.setContent(inlineHtml)
    await inlinePage.evaluate(({ items, rendered }) => {
      const grid = document.getElementById('grid')
      grid.style.setProperty('--col', '240px')
      grid.innerHTML = items.map((item, index) =>
        `<div class="cell" id="cell-${index}" style="width:${item.px}px;height:${item.px}px">${rendered[index]}</div>`,
      ).join('')
    }, { items: instances, rendered: svgs })
    await inlinePage.evaluate(() => document.fonts.ready.then(() => true))
    const inlineSheet = await inlinePage.screenshot({ fullPage: true })
    await fsp.writeFile(path.join(dir, 'inline-contact.png'), inlineSheet)

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index]
      const expectedKey = ctx.caseKey(instance)
      const inlineTextRects = await textRectsFor(inlinePage, `#cell-${index} svg`)
      const inlineBuffer = await inlinePage.locator(`#cell-${index} svg`).screenshot({ omitBackground: true })
      await fsp.writeFile(path.join(dir, 'inline', `${String(index).padStart(3, '0')}.png`), inlineBuffer)

      await isolatedPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;font:10px system-ui,sans-serif}.wrap{display:block}</style></head><body><div class="wrap" id="solo" style="width:${instance.px}px;height:${instance.px}px">${svgs[index]}</div></body></html>`)
      await isolatedPage.evaluate(() => document.fonts.ready.then(() => true))
      const isolatedTextRects = await textRectsFor(isolatedPage, '#solo svg')
      const isolatedBuffer = await isolatedPage.locator('#solo svg').screenshot({ omitBackground: true })
      await fsp.writeFile(path.join(dir, 'isolated', `${String(index).padStart(3, '0')}.png`), isolatedBuffer)

      const inlineMetrics = pngMetrics(inlineBuffer, ctx.PNG)
      const isolatedMetrics = pngMetrics(isolatedBuffer, ctx.PNG)
      addBrowserCase(ctx, id)
      ctx.assert(id, inlineMetrics.width === instance.px && inlineMetrics.height === instance.px, `instance ${index}: inline capture dimensions equal px`, { instance, inlineMetrics })
      ctx.assert(id, isolatedMetrics.width === instance.px && isolatedMetrics.height === instance.px, `instance ${index}: isolated capture dimensions equal px`, { instance, isolatedMetrics })
      ctx.assert(id, inlineMetrics.opaquePixels > 0 && isolatedMetrics.opaquePixels > 0, `instance ${index}: both captures nonblank`, { inlineMetrics, isolatedMetrics })
      ctx.assert(id, inlineMetrics.distinctColors >= 3 && isolatedMetrics.distinctColors >= 3, `instance ${index}: both captures have multiple colors`, { inlineMetrics, isolatedMetrics })
      const textMask = buildTextMask([...inlineTextRects, ...isolatedTextRects], instance.px)
      const textMaskPixels = textMask.reduce((sum, value) => sum + value, 0)
      const diff = pixelDiff(inlineBuffer, isolatedBuffer, ctx.PNG, instance.px, textMask)
      addBrowserCase(ctx, id)
      ctx.assert(id, diff.dimensionsEqual && diff.width === instance.px && diff.height === instance.px, `instance ${index}: capture dimensions match`, { instance, diff })
      addBrowserCase(ctx, id)
      ctx.assert(id, diff.interiorNonTextDifferingPixels === 0, `instance ${index}: non-text interior pixels equal isolated capture (no cross-document clip/gradient pollution)`, {
        instance, expectedKey,
        inlinePixelSha256: inlineMetrics.pixelSha256,
        isolatedPixelSha256: isolatedMetrics.pixelSha256,
        diff,
        textMaskPixels,
        inlineTextCount: inlineTextRects.length,
        isolatedTextCount: isolatedTextRects.length,
        inlineMetrics,
        isolatedMetrics,
      })
      rows.push({
        index,
        style: instance.style,
        seed: instance.seed,
        name: instance.name,
        px: instance.px,
        inlineMetrics,
        isolatedMetrics,
        fullImageExact: diff.exact,
        textMaskPixels,
        diff,
      })
    }

    // Negative control: two inline SVGs share one ID with different definitions.
    const controlA = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 10 10"><defs><clipPath id="s2-dup-clip"><circle cx="5" cy="5" r="5"/></clipPath></defs><g clip-path="url(#s2-dup-clip)"><rect width="10" height="10" fill="#e8553e"/></g></svg>'
    const controlB = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 10 10"><defs><clipPath id="s2-dup-clip"><rect x="0" y="0" width="10" height="4"/></clipPath></defs><g clip-path="url(#s2-dup-clip)"><rect width="10" height="10" fill="#62d96b"/></g></svg>'
    const controlAnalysis = definitionAnalysis([
      { label: 'control-a', doc: parseSvg(ctx.DOMParserCtor, controlA).doc },
      { label: 'control-b', doc: parseSvg(ctx.DOMParserCtor, controlB).doc },
    ])
    addBrowserCase(ctx, id)
    ctx.assert(id, controlAnalysis.conflicts.length > 0, 'negative control: conflicting duplicate-ID definitions are rejected by the definition analysis', { controlAnalysis })

    await isolatedPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;font:10px system-ui,sans-serif}.wrap{display:block}</style></head><body><div class="wrap" id="solo-b" style="width:120px;height:120px">${controlB}</div></body></html>`)
    const controlIsolated = await isolatedPage.locator('#solo-b svg').screenshot({ omitBackground: true })
    await inlinePage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;font:10px system-ui,sans-serif}.wrap{display:inline-block}</style></head><body><div class="wrap">${controlA}</div><div class="wrap" id="inline-b">${controlB}</div></body></html>`)
    const controlInline = await inlinePage.locator('#inline-b svg').screenshot({ omitBackground: true })
    const controlDiff = pixelDiff(controlInline, controlIsolated, ctx.PNG, 120)
    addBrowserCase(ctx, id)
    ctx.assert(id, controlDiff.interiorDifferingPixels > 0, 'negative control: conflicting-ID inline pollution is detected by the interior-pixel comparison', { controlDiff })
    ctx.note(id, `crafted conflicting-ID inline-vs-isolated full-image differing pixels=${controlDiff.differingPixels}, interior differing=${controlDiff.interiorDifferingPixels}, max channel delta=${controlDiff.maxChannelDelta}`)
    await fsp.writeFile(path.join(dir, 'control-conflict-inline.png'), controlInline)
    await fsp.writeFile(path.join(dir, 'control-conflict-isolated.png'), controlIsolated)
    return {
      instances: instances.length,
      duplicateIds: ctx.definitionAnalysis.duplicateIds,
      conflicts: ctx.definitionAnalysis.conflicts,
      withinDocumentConflicts: ctx.definitionAnalysis.withinDocumentConflicts,
      definitionCount: ctx.definitionAnalysis.definitionCount,
      idCount: ctx.definitionAnalysis.idCount,
      rows,
      control: { analysis: controlAnalysis, diff: controlDiff },
      inlineContact: path.join(dir, 'inline-contact.png'),
    }
  } finally {
    await inlineContext.close()
    await isolatedContext.close()
  }
}

async function canvasProbe(page, selector) {
  return page.evaluate(async (sel) => {
    const img = document.querySelector(sel)
    if (!img) return { error: 'missing-img', loaded: false }
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    let opaque = 0
    const colors = new Set()
    let data
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    } catch (error) {
      return { error: String(error), loaded: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, opaque: 0, distinctColors: 0 }
    }
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        opaque += 1
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
      }
    }
    return {
      loaded: true,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      opaque,
      distinctColors: colors.size,
    }
  }, selector)
}

async function runS206(ctx, browsers, outRoot) {
  const id = 'S2-06'
  const cases = ctx.embeddingCases
  const dir = path.join(outRoot, 'S2-06')
  await fsp.mkdir(dir, { recursive: true })
  const dataUrls = ctx.embeddingSvgs.map((svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  const scripted = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><script>window.__S2_SVG_SCRIPT_RAN=true</script><rect width="32" height="32" fill="#f00"/></svg>')
  const broken = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22'
  const engineRows = {}
  for (const engine of ENGINES) {
    const { context, page } = await newPageFor(browsers[engine])
    const requests = []
    const failed = []
    const pageErrors = []
    page.on('request', (request) => requests.push(request.url()))
    page.on('requestfailed', (request) => failed.push({ url: request.url(), error: request.failure()?.errorText }))
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    try {
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="grid"></div></body></html>')
      const probes = []
      for (let index = 0; index < cases.length; index += 1) {
        const item = cases[index]
        const probe = await page.evaluate(async ({ dataUrl, px }) => {
          const result = await new Promise((resolve) => {
            const img = new Image()
            img.onload = async () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const context = canvas.getContext('2d')
              context.drawImage(img, 0, 0)
              let opaque = 0
              const colors = new Set()
              let data
              try {
                data = context.getImageData(0, 0, canvas.width, canvas.height).data
              } catch (error) {
                resolve({ loaded: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, opaque: 0, distinctColors: 0, error: String(error) })
                return
              }
              for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) {
                  opaque += 1
                  colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
                }
              }
              resolve({ loaded: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, opaque, distinctColors: colors.size })
            }
            img.onerror = () => resolve({ loaded: false, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasWidth: 0, canvasHeight: 0, opaque: 0, distinctColors: 0 })
            img.src = dataUrl
          })
          return result
        }, { dataUrl: dataUrls[index], px: item.px })
        addBrowserCase(ctx, id)
        ctx.assert(id, probe.loaded, `${engine}: data URL image ${index} loads`, { item, probe })
        ctx.assert(id, probe.naturalWidth === item.px && probe.naturalHeight === item.px, `${engine}: image ${index} natural dimensions are ${item.px}x${item.px}`, { item, probe })
        ctx.assert(id, probe.canvasWidth === item.px && probe.canvasHeight === item.px, `${engine}: canvas ${index} has requested dimensions`, { item, probe })
        ctx.assert(id, probe.opaque > item.px * item.px * 0.05 && probe.distinctColors >= 3, `${engine}: data URL image ${index} is nonblank with multiple colors`, { item, probe })
        probes.push({ index, style: item.style, seed: item.seed, name: item.name, px: item.px, probe })
      }

      await page.evaluate(() => { window.__S2_SVG_SCRIPT_RAN = false })
      const scriptProbe = await page.evaluate(async (dataUrl) => {
        await new Promise((resolve) => {
          const img = new Image()
          img.onload = resolve
          img.onerror = resolve
          img.src = dataUrl
        })
        return { ran: window.__S2_SVG_SCRIPT_RAN === true }
      }, scripted)
      addBrowserCase(ctx, id)
      ctx.assert(id, scriptProbe.ran === false, `${engine}: script inside an SVG image does not execute`, { scriptProbe })

      const brokenProbe = await page.evaluate(async (dataUrl) => {
        return await new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth || 1
            canvas.height = img.naturalHeight || 1
            const context = canvas.getContext('2d')
            context.drawImage(img, 0, 0)
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data
            let opaque = 0
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0) opaque += 1
            resolve({ loaded: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, opaque })
          }
          img.onerror = () => resolve({ loaded: false, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, opaque: 0 })
          img.src = dataUrl
        })
      }, broken)
      addBrowserCase(ctx, id)
      ctx.assert(id, !brokenProbe.loaded || brokenProbe.opaque === 0, `${engine}: broken/blank data URL negative control is detected`, { brokenProbe })

      await page.evaluate(({ items, urls }) => {
        const grid = document.getElementById('grid')
        grid.innerHTML = items.map((item, index) => `<figure style="display:inline-block;margin:6px;text-align:center"><img src="${urls[index]}" width="64" height="64" alt=""><figcaption style="font:10px system-ui">${item.style}</figcaption></figure>`).join('')
      }, { items: cases, urls: dataUrls })
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete))
      await fsp.writeFile(path.join(dir, `${engine}-contact.png`), await page.screenshot({ fullPage: true }))
      const externalRequests = requests.filter((url) => /^(https?|wss?):/i.test(url))
      addBrowserCase(ctx, id)
      ctx.assert(id, externalRequests.length === 0, `${engine}: data URL images make no external/network request`, { requests, externalRequests, failed })
      addBrowserCase(ctx, id)
      ctx.assert(id, pageErrors.length === 0, `${engine}: no page script error while embedding data URLs`, { pageErrors })
      engineRows[engine] = { browserVersion: await browsers[engine].version(), rows: probes, requests, failed, pageErrors, scriptProbe, brokenProbe }
    } finally {
      await context.close()
    }
  }
  return { cases: cases.length, engines: engineRows }
}

async function runS207(ctx, browsers, outRoot) {
  const id = 'S2-07'
  const dir = path.join(outRoot, 'S2-07')
  await fsp.mkdir(path.join(dir, 'file'), { recursive: true })
  const samples = ctx.transportSamples
  const serverRoutes = []
  const files = samples.map((sample, index) => {
    const base = `sample-${index}`
    const svgName = `${base}.svg`
    const htmlName = `${base}.html`
    const svgPath = path.join(dir, 'file', svgName)
    const htmlPath = path.join(dir, 'file', htmlName)
    return { sample, index, base, svgName, htmlName, svgPath, htmlPath, bytes: Buffer.from(sample.svg, 'utf8') }
  })
  for (const entry of files) {
    await fsp.writeFile(entry.svgPath, entry.bytes)
    await fsp.writeFile(entry.htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f4f2ec}img{display:block}</style></head><body><img id="probe" src="${entry.svgName}" width="${entry.sample.px}" height="${entry.sample.px}" alt=""><script>window.__s2={loaded:false,error:false,naturalWidth:0,naturalHeight:0};document.getElementById('probe').addEventListener('load',function(e){window.__s2={loaded:true,error:false,naturalWidth:e.target.naturalWidth,naturalHeight:e.target.naturalHeight}});document.getElementById('probe').addEventListener('error',function(){window.__s2={loaded:false,error:true,naturalWidth:0,naturalHeight:0}});</script></body></html>`)
  }

  const brokenSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text>broken</text>'
  const scriptedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>window.__HTTP_SCRIPT_RAN=true</script><rect width="64" height="64" fill="#62d96b"/></svg>'
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const route = url.pathname
    serverRoutes.push({ method: req.method, path: route })
    if (route === '/broken.svg') {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>broken upstream response</h1>')
      return
    }
    if (route === '/script.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(scriptedSvg) })
      res.end(scriptedSvg)
      return
    }
    if (route === '/embed-broken.html') {
      const body = '<!doctype html><html><body><img id="probe" src="/broken.svg" alt=""><script>window.__s2={loaded:false,error:false};document.getElementById("probe").addEventListener("load",function(e){window.__s2={loaded:true,error:false,naturalWidth:e.target.naturalWidth,naturalHeight:e.target.naturalHeight}});document.getElementById("probe").addEventListener("error",function(){window.__s2={loaded:false,error:true}});</script></body></html>'
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(body)
      return
    }
    if (route === '/embed-script.html') {
      const body = '<!doctype html><html><body><img id="probe" src="/script.svg" alt=""><script>window.__s2={loaded:false,error:false};window.__HTTP_SCRIPT_RAN=false;document.getElementById("probe").addEventListener("load",function(e){window.__s2={loaded:true,error:false,naturalWidth:e.target.naturalWidth,naturalHeight:e.target.naturalHeight}});document.getElementById("probe").addEventListener("error",function(){window.__s2={loaded:false,error:true}});</script></body></html>'
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(body)
      return
    }
    const embedMatch = route.match(/^\/embed-(\d+)\.html$/)
    if (embedMatch) {
      const entry = files[Number(embedMatch[1])]
      if (!entry) {
        res.writeHead(404)
        res.end('missing')
        return
      }
      const body = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f4f2ec}img{display:block}</style></head><body><img id="probe" src="/svg-${entry.index}.svg" width="${entry.sample.px}" height="${entry.sample.px}" alt=""><script>window.__s2={loaded:false,error:false};document.getElementById("probe").addEventListener("load",function(e){window.__s2={loaded:true,error:false,naturalWidth:e.target.naturalWidth,naturalHeight:e.target.naturalHeight}});document.getElementById("probe").addEventListener("error",function(){window.__s2={loaded:false,error:true}});</script></body></html>`
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(body)
      return
    }
    const svgMatch = route.match(/^\/svg-(\d+)\.svg$/)
    if (svgMatch) {
      const entry = files[Number(svgMatch[1])]
      if (!entry) {
        res.writeHead(404)
        res.end('missing')
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': entry.bytes.length, 'Cache-Control': 'no-store' })
      res.end(entry.bytes)
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const origin = `http://127.0.0.1:${port}`
  const engineRows = {}
  try {
    for (const engine of ENGINES) {
      const { context, page } = await newPageFor(browsers[engine])
      const requests = []
      const pageErrors = []
      page.on('request', (request) => requests.push(request.url()))
      page.on('pageerror', (error) => pageErrors.push(String(error)))
      const rows = []
      try {
        for (const entry of files) {
          const fileUrl = pathToFileURL(entry.svgPath).href
          const fileHtml = pathToFileURL(entry.htmlPath).href
          const httpSvg = `${origin}/svg-${entry.index}.svg`
          const httpHtml = `${origin}/embed-${entry.index}.html`

          // file:// direct SVG document
          await page.goto(fileUrl, { waitUntil: 'load' })
          const fileDirect = await page.evaluate(() => ({ root: document.documentElement.localName, outer: document.documentElement.outerHTML, width: document.documentElement.getAttribute('width'), height: document.documentElement.getAttribute('height') }))
          const fileDirectShot = await page.screenshot()
          await fsp.writeFile(path.join(dir, 'file', `${entry.base}-${engine}-direct.png`), fileDirectShot)
          const fileDirectMetrics = pngMetrics(fileDirectShot, ctx.PNG)
          addBrowserCase(ctx, id)
          ctx.assert(id, fileDirect.root === 'svg' && fileDirect.width === String(entry.sample.px), `${engine}/${entry.base}: file:// direct SVG document renders`, { fileDirect })
          ctx.assert(id, fileDirectMetrics.distinctColors > 3 && fileDirectMetrics.opaquePixels > 100, `${engine}/${entry.base}: file:// direct capture is nonblank`, { fileDirectMetrics })
          const fileTextRequests = requests.splice(0)
          addBrowserCase(ctx, id)
          ctx.assert(id, fileTextRequests.every((url) => localUrl(url)), `${engine}/${entry.base}: file:// direct request stays local`, { requests: fileTextRequests })

          // file:// img embed
          await page.goto(fileHtml, { waitUntil: 'load' })
          const fileFlag = await waitForProbe(page)
          const fileProbe = fileFlag
          const fileImgShot = await page.locator('#probe').screenshot()
          await fsp.writeFile(path.join(dir, 'file', `${entry.base}-${engine}-img.png`), fileImgShot)
          const fileImgMetrics = pngMetrics(fileImgShot, ctx.PNG)
          addBrowserCase(ctx, id)
          ctx.assert(id, fileProbe.loaded && fileProbe.naturalWidth === entry.sample.px && fileProbe.naturalHeight === entry.sample.px, `${engine}/${entry.base}: file:// img load event and dimensions`, { fileFlag, fileProbe })
          ctx.assert(id, fileImgMetrics.distinctColors > 3 && fileImgMetrics.opaquePixels > 100, `${engine}/${entry.base}: file:// img capture is nonblank`, { fileImgMetrics })
          const fileImgRequests = requests.splice(0)
          addBrowserCase(ctx, id)
          ctx.assert(id, fileImgRequests.every((url) => localUrl(url)), `${engine}/${entry.base}: file:// img requests stay local`, { requests: fileImgRequests })

          // localhost HTTP direct SVG
          const response = await context.request.get(httpSvg)
          const responseBody = Buffer.from(await response.body())
          const contentType = response.headers()['content-type'] ?? ''
          addBrowserCase(ctx, id)
          ctx.assert(id, response.status() === 200 && contentType.startsWith('image/svg+xml'), `${engine}/${entry.base}: HTTP SVG status/content-type`, { status: response.status(), contentType })
          ctx.assert(id, responseBody.equals(entry.bytes), `${engine}/${entry.base}: HTTP response bytes equal file bytes`, { httpSha256: sha256(responseBody), fileSha256: sha256(entry.bytes) })
          await page.goto(httpSvg, { waitUntil: 'load' })
          const httpDirect = await page.evaluate(() => ({ root: document.documentElement.localName, outer: document.documentElement.outerHTML, width: document.documentElement.getAttribute('width'), height: document.documentElement.getAttribute('height') }))
          const httpDirectShot = await page.screenshot()
          await fsp.writeFile(path.join(dir, 'file', `${entry.base}-${engine}-http-direct.png`), httpDirectShot)
          const httpDirectMetrics = pngMetrics(httpDirectShot, ctx.PNG)
          const fileCanonical = canonicalDiagnostic(fileDirect.outer, ctx.DOMParserCtor)
          const httpCanonical = canonicalDiagnostic(httpDirect.outer, ctx.DOMParserCtor)
          addBrowserCase(ctx, id)
          ctx.assert(id, httpDirectMetrics.distinctColors > 3 && httpDirectMetrics.opaquePixels > 100, `${engine}/${entry.base}: HTTP direct capture is nonblank`, { httpDirectMetrics })
          ctx.assert(id, fileCanonical !== null && fileCanonical === httpCanonical, `${engine}/${entry.base}: file and HTTP DOM structure identical`, { fileCanonicalSha: fileCanonical ? sha256(fileCanonical) : null, httpCanonicalSha: httpCanonical ? sha256(httpCanonical) : null })
          const httpDirectRequests = requests.splice(0)
          addBrowserCase(ctx, id)
          ctx.assert(id, httpDirectRequests.every((url) => localUrl(url, origin)), `${engine}/${entry.base}: HTTP direct requests stay on localhost`, { requests: httpDirectRequests })

          // localhost HTTP img embed
          await page.goto(httpHtml, { waitUntil: 'load' })
          const httpFlag = await waitForProbe(page)
          const httpProbe = httpFlag
          const httpImgShot = await page.locator('#probe').screenshot()
          await fsp.writeFile(path.join(dir, 'file', `${entry.base}-${engine}-http-img.png`), httpImgShot)
          const httpImgMetrics = pngMetrics(httpImgShot, ctx.PNG)
          addBrowserCase(ctx, id)
          ctx.assert(id, httpProbe.loaded && httpProbe.naturalWidth === entry.sample.px && httpProbe.naturalHeight === entry.sample.px, `${engine}/${entry.base}: HTTP img load event and dimensions`, { httpFlag, httpProbe })
          ctx.assert(id, httpImgMetrics.distinctColors > 3 && httpImgMetrics.opaquePixels > 100, `${engine}/${entry.base}: HTTP img capture is nonblank`, { httpImgMetrics })
          const httpImgRequests = requests.splice(0)
          addBrowserCase(ctx, id)
          ctx.assert(id, httpImgRequests.every((url) => localUrl(url, origin)), `${engine}/${entry.base}: HTTP img requests stay on localhost`, { requests: httpImgRequests })

          rows.push({
            index: entry.index,
            style: entry.sample.style,
            fileDirect: { metrics: fileDirectMetrics, width: fileDirect.width },
            fileImg: { probe: fileProbe, metrics: fileImgMetrics },
            httpDirect: { metrics: httpDirectMetrics, width: httpDirect.width, status: response.status(), contentType },
            httpImg: { probe: httpProbe, metrics: httpImgMetrics },
            fileHttpPixelEqual: pngMetrics(httpImgShot, ctx.PNG).pixelSha256 === pngMetrics(fileImgShot, ctx.PNG).pixelSha256,
          })
        }

        // Broken localhost response negative control.
        await page.goto(`${origin}/embed-broken.html`, { waitUntil: 'load' })
        const brokenProbe = await waitForProbe(page)
        addBrowserCase(ctx, id)
        ctx.assert(id, brokenProbe.loaded === false && brokenProbe.error === true, `${engine}: broken HTTP image response is detected as an error`, { brokenProbe })
        const brokenRequests = requests.splice(0)
        addBrowserCase(ctx, id)
        ctx.assert(id, brokenRequests.every((url) => localUrl(url, origin)), `${engine}: broken HTTP control stays local`, { brokenRequests })

        // Script-in-SVG control served over HTTP.
        await page.goto(`${origin}/embed-script.html`, { waitUntil: 'load' })
        const scriptFlag = await waitForProbe(page)
        const scriptProbe = await page.evaluate(() => ({ loaded: window.__s2, ran: window.__HTTP_SCRIPT_RAN === true }))
        addBrowserCase(ctx, id)
        ctx.assert(id, scriptProbe.loaded.loaded === true && scriptProbe.ran === false, `${engine}: HTTP SVG image script does not execute`, { scriptFlag, scriptProbe })
        addBrowserCase(ctx, id)
        ctx.assert(id, pageErrors.length === 0, `${engine}: no page script error in file/HTTP embedding`, { pageErrors })
        engineRows[engine] = { browserVersion: await browsers[engine].version(), rows }
      } finally {
        await context.close()
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  return { samples: samples.length, engines: engineRows, origin, port, routes: serverRoutes }
}

function addBrowserCase(ctx, id, count = 1) {
  ctx.addCase(id, count)
}

export async function runBrowserScenarios(ctx) {
  const outRoot = path.join(ctx.outDir, 'browser')
  await fsp.mkdir(outRoot, { recursive: true })
  const engines = {}
  try {
    for (const engine of ENGINES) {
      engines[engine] = await ctx.playwright[engine].launch({ headless: true })
    }
    const versions = {}
    for (const engine of ENGINES) {
      versions[engine] = {
        browserVersion: await engines[engine].version(),
        executablePath: engines[engine].browserType().executablePath(),
      }
    }
    const s203 = await runS203(ctx, engines, outRoot)
    const s205 = await runS205(ctx, engines, outRoot)
    const s206 = await runS206(ctx, engines, outRoot)
    const s207 = await runS207(ctx, engines, outRoot)
    return { versions, 'S2-03': s203, 'S2-05': s205, 'S2-06': s206, 'S2-07': s207 }
  } finally {
    for (const engine of ENGINES) {
      if (engines[engine]) await engines[engine].close().catch(() => {})
    }
  }
}