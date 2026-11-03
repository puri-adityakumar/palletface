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
  compareFullPixels,
  corruptSingleByte,
  definitionAnalysis,
  elementsByName,
  parseSvg,
  pngMetrics,
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

const MATCHED_VIEWPORT = { width: 2600, height: 2200 }
const MATCHED_CSS = `*{box-sizing:border-box}html,body{margin:0;padding:0;background:#ffffff}
body{font:10px/1.2 system-ui,sans-serif}
.grid{display:grid;grid-template-columns:repeat(10,240px);gap:14px;padding:16px;align-items:start}
.cell{display:flex;align-items:center;justify-content:center;overflow:hidden}
.cell svg{display:block;flex:0 0 auto}`
// Firefox/WebKit cover one target per style plus both exact repeats; the full
// 82-instance corpus runs in Chromium.
const REPRESENTATIVE_ENGINE_INDICES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 81]

function matchedGridHtml(instances, svgs) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${MATCHED_CSS}</style></head><body><div class="grid" id="grid">${instances
    .map((instance, index) => `<div class="cell" id="cell-${index}" style="width:${instance.px}px;height:${instance.px}px">${svgs[index]}</div>`)
    .join('')}</div></body></html>`
}

async function settleRaster(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

async function cellClip(page, index) {
  return page.evaluate((cellIndex) => {
    const cell = document.getElementById(`cell-${cellIndex}`)
    if (!cell) return { missing: true }
    const rect = cell.getBoundingClientRect()
    return { missing: false, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }, index)
}

function integralClip(clip, px) {
  const values = [clip.x, clip.y, clip.width, clip.height]
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value - Math.round(value)) > 1e-9)) return null
  const rounded = { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.width), height: Math.round(clip.height) }
  if (rounded.width !== px || rounded.height !== px || rounded.width <= 0 || rounded.height <= 0) return null
  return rounded
}

async function captureClip(page, clip) {
  return page.screenshot({ clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } })
}

async function targetSnapshot(page, index) {
  return page.evaluate((cellIndex) => {
    const cell = document.getElementById(`cell-${cellIndex}`)
    const svg = cell?.querySelector('svg')
    if (!cell || !svg) return { missing: true }
    const rect = (element) => {
      const value = element.getBoundingClientRect()
      return { x: value.x, y: value.y, width: value.width, height: value.height, top: value.top, left: value.left, right: value.right, bottom: value.bottom }
    }
    const styleOf = (element) => {
      const style = getComputedStyle(element)
      const out = {}
      for (const key of [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant',
        'lineHeight', 'letterSpacing', 'wordSpacing', 'textRendering', 'textTransform',
        'whiteSpace', 'direction', 'writingMode', 'color', 'opacity',
      ]) out[key] = style[key]
      return out
    }
    return {
      missing: false,
      dpr: window.devicePixelRatio,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      cell: rect(cell),
      svg: rect(svg),
      bodyStyle: styleOf(document.body),
      cellStyle: styleOf(cell),
      svgStyle: styleOf(svg),
      texts: Array.from(svg.querySelectorAll('text')).map((text) => {
        const style = getComputedStyle(text)
        return {
          rect: rect(text),
          text: text.textContent,
          fill: style.fill,
          opacity: style.opacity,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          textAnchor: style.textAnchor,
          dominantBaseline: style.dominantBaseline,
        }
      }),
    }
  }, index)
}

async function removeOtherSvgs(page, keepIndex) {
  return page.evaluate((cellIndex) => {
    window.__s2RemovedSvgs = []
    const grid = document.getElementById('grid')
    for (const cell of Array.from(grid.children)) {
      if (cell.id === `cell-${cellIndex}`) continue
      const svg = cell.querySelector('svg')
      if (!svg) continue
      const parent = svg.parentNode
      const next = svg.nextSibling
      parent.removeChild(svg)
      window.__s2RemovedSvgs.push({ parent, next, svg })
    }
    return window.__s2RemovedSvgs.length
  }, keepIndex)
}

async function restoreOtherSvgs(page) {
  return page.evaluate(() => {
    const removed = window.__s2RemovedSvgs ?? []
    for (const entry of removed) entry.parent.insertBefore(entry.svg, entry.next)
    window.__s2RemovedSvgs = []
    return removed.length
  })
}

const CONTROL_CSS = `*{box-sizing:border-box}html,body{margin:0;padding:0;background:#ffffff}
body{font:10px/1.2 system-ui,sans-serif}
.slot{position:absolute;left:16px;top:16px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.slot svg{display:block;flex:0 0 auto}
.grid{display:grid;grid-template-columns:repeat(10,240px);gap:14px;padding:16px;align-items:start}
.cell{display:flex;align-items:center;justify-content:center;overflow:hidden}
.cell svg{display:block;flex:0 0 auto}`

async function captureDisposable(page, svg, px) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CONTROL_CSS}</style></head><body><div class="slot" style="width:${px}px;height:${px}px">${svg}</div></body></html>`)
  await settleRaster(page)
  const clip = { x: 16, y: 16, width: px, height: px }
  return { buffer: await captureClip(page, clip), clip }
}

function mutateOnce(svg, pattern, replacement, label) {
  if (!pattern.test(svg)) throw new Error(`control mutation ${label}: pattern not found`)
  const mutated = svg.replace(pattern, replacement)
  if (mutated === svg) throw new Error(`control mutation ${label}: no byte changed`)
  return mutated
}

function controlVariants(instances, svgs) {
  const byStyle = (style) => {
    const index = instances.findIndex((instance) => instance.style === style)
    if (index < 0) throw new Error(`control style missing: ${style}`)
    return { index, instance: instances[index], svg: svgs[index] }
  }
  const ascii = byStyle('ascii-letter')
  const field = byStyle('ascii-field')
  const sprite = byStyle('pixel-sprite')
  return {
    ascii,
    field,
    sprite,
    clipGeometry: mutateOnce(ascii.svg, /(<clipPath[^>]*><circle[^>]*\br=")([^"]+)(")/, (_match, before, radius, after) => `${before}${Number(radius) / 2}${after}`, 'clip-geometry'),
    gradientStop: mutateOnce(field.svg, /(<stop offset="0" stop-color=")(#[0-9a-fA-F]{6})(")/, (_match, before, color, after) => `${before}${color.toLowerCase() === '#101010' ? '#f0f0f0' : '#101010'}${after}`, 'gradient-stop'),
    flatColor: mutateOnce(sprite.svg, /(fill=")(#[0-9a-fA-F]{6})(")/, (_match, before, color, after) => `${before}${color.toLowerCase() === '#010203' ? '#f4f0e8' : '#010203'}${after}`, 'flat-color'),
    // The central (4.5,4.5) cell carries the ASCII initial and is inside the
    // circular clip, so a glyph or opacity change is guaranteed to be painted.
    textGlyph: mutateOnce(ascii.svg, /(<text x="4\.5" y="4\.5"[^>]*>)([^<])(<\/text>)/, (_match, before, glyph, after) => `${before}${glyph === 'Z' ? 'Y' : 'Z'}${after}`, 'text-glyph'),
    textOpacity: mutateOnce(ascii.svg, /<text x="4\.5" y="4\.5"/, '<text x="4.5" y="4.5" opacity="0.5"', 'text-opacity'),
  }
}

function pollutionSvg(targetSvg) {
  return mutateOnce(
    targetSvg,
    /<clipPath([^>]*)><circle[^>]*\/><\/clipPath>/,
    '<clipPath$1><rect x="0" y="0" width="18" height="4"/></clipPath>',
    'pollution-clip',
  )
}

async function runS205(ctx, browsers, outRoot) {
  const id = 'S2-05'
  const instances = ctx.mixedInstances
  const svgs = ctx.mixedSvgs
  const dir = path.join(outRoot, 'S2-05')
  await fsp.mkdir(path.join(dir, 'matched'), { recursive: true })
  await fsp.mkdir(path.join(dir, 'controls'), { recursive: true })

  const rowsByEngine = {}
  const controlsByEngine = {}
  const summaries = {}
  const variants = controlVariants(instances, svgs)
  for (const engine of ENGINES) {
    const targetIndices = engine === 'chromium' ? instances.map((_instance, index) => index) : REPRESENTATIVE_ENGINE_INDICES
    const engineRows = []
    const engineControls = {}
    let context = null
    let engineError = null
    try {
      const created = await newPageFor(browsers[engine], { viewport: MATCHED_VIEWPORT })
      context = created.context
      const page = created.page
      await page.setContent(matchedGridHtml(instances, svgs))
      await settleRaster(page)
      if (engine === 'chromium') {
        await fsp.writeFile(path.join(dir, 'matched', `${engine}-contact.png`), await page.screenshot())
      }

      // Comparator controls run in Chromium. WebKit resolves inline-SVG
      // fragment IDs inside each SVG rather than document-wide, so a
      // cross-SVG duplicate-ID pollution control is not applicable there;
      // its matched-context corpus comparison still runs below.
      if (engine === 'chromium') {
      const controlPage = await context.newPage()
      try {
        const positiveA = await captureDisposable(controlPage, variants.ascii.svg, variants.ascii.instance.px)
        const positiveB = await captureDisposable(controlPage, variants.ascii.svg, variants.ascii.instance.px)
        const positive = compareFullPixels(positiveA.buffer, positiveB.buffer, ctx.PNG)
        addBrowserCase(ctx, id)
        ctx.assert(id, positive.accepted && positive.eligibleFraction === 1, `${engine} positive control: identical disposable documents compare pixel-identical over every eligible pixel`, { positive })
        await fsp.writeFile(path.join(dir, 'controls', `${engine}-positive-original-a.png`), positiveA.buffer)
        await fsp.writeFile(path.join(dir, 'controls', `${engine}-positive-original-b.png`), positiveB.buffer)
        engineControls.positiveIdentical = positive

        const corruptionControls = [
          { name: 'clip-geometry', px: variants.ascii.instance.px, original: variants.ascii.svg, corrupted: variants.clipGeometry },
          { name: 'gradient-stop', px: variants.field.instance.px, original: variants.field.svg, corrupted: variants.gradientStop },
          { name: 'flat-color', px: variants.sprite.instance.px, original: variants.sprite.svg, corrupted: variants.flatColor },
          { name: 'text-glyph-ascii', px: variants.ascii.instance.px, original: variants.ascii.svg, corrupted: variants.textGlyph },
          { name: 'text-opacity-ascii', px: variants.ascii.instance.px, original: variants.ascii.svg, corrupted: variants.textOpacity },
        ]
        for (const control of corruptionControls) {
          const original = await captureDisposable(controlPage, control.original, control.px)
          const corrupted = await captureDisposable(controlPage, control.corrupted, control.px)
          const metrics = compareFullPixels(original.buffer, corrupted.buffer, ctx.PNG)
          addBrowserCase(ctx, id)
          ctx.assert(id, metrics.dimensionsEqual && metrics.eligibleFraction === 1 && metrics.eligiblePixels === control.px * control.px, `${engine} control ${control.name}: every pixel of the target box is eligible`, { metrics, control: control.name })
          addBrowserCase(ctx, id)
          ctx.assert(id, !metrics.accepted, `${engine} control ${control.name}: the production full-pixel comparator rejects the corruption`, { metrics, control: control.name })
          ctx.negativeControl(`S2-05-${engine}-${control.name}`, { accepted: metrics.accepted, eligibleFraction: metrics.eligibleFraction, differingPixels: metrics.differingPixels, maxChannelDelta: metrics.maxChannelDelta })
          await fsp.writeFile(path.join(dir, 'controls', `${engine}-${control.name}-original.png`), original.buffer)
          await fsp.writeFile(path.join(dir, 'controls', `${engine}-${control.name}-corrupted.png`), corrupted.buffer)
          engineControls[control.name] = metrics
        }

        // Conflicting duplicate-ID control measured through the same
        // populated-vs-sibling-removed acceptance path as the real corpus.
        const pollution = pollutionSvg(variants.ascii.svg)
        const controlAnalysis = definitionAnalysis([
          { label: 'control-target', doc: parseSvg(ctx.DOMParserCtor, variants.ascii.svg).doc },
          { label: 'control-sibling', doc: parseSvg(ctx.DOMParserCtor, pollution).doc },
        ])
        addBrowserCase(ctx, id)
        ctx.assert(id, controlAnalysis.conflicts.length > 0, `${engine} control conflicting-id: definition analysis rejects the differing duplicate ID`, { controlAnalysis })
        const px = variants.ascii.instance.px
        await controlPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CONTROL_CSS}</style></head><body><div class="grid" id="grid"><div class="cell" id="cell-0" style="width:${px}px;height:${px}px">${pollution}</div><div class="cell" id="cell-1" style="width:${px}px;height:${px}px">${variants.ascii.svg}</div></div></body></html>`)
        await settleRaster(controlPage)
        const rawClip = await cellClip(controlPage, 1)
        const clip = integralClip(rawClip, px)
        addBrowserCase(ctx, id)
        ctx.assert(id, clip !== null, `${engine} control conflicting-id: target box is at integral coordinates`, { rawClip, px })
        if (clip) {
          const present = await captureClip(controlPage, clip)
          await removeOtherSvgs(controlPage, 1)
          await settleRaster(controlPage)
          const afterRawClip = await cellClip(controlPage, 1)
          addBrowserCase(ctx, id)
          ctx.assert(id, JSON.stringify(integralClip(afterRawClip, px)) === JSON.stringify(clip), `${engine} control conflicting-id: sibling removal does not move the target`, { before: clip, after: afterRawClip })
          const isolated = await captureClip(controlPage, clip)
          await restoreOtherSvgs(controlPage)
          const metrics = compareFullPixels(present, isolated, ctx.PNG)
          addBrowserCase(ctx, id)
          ctx.assert(id, metrics.dimensionsEqual && metrics.eligibleFraction === 1, `${engine} control conflicting-id: every pixel is eligible`, { metrics })
          addBrowserCase(ctx, id)
          ctx.assert(id, !metrics.accepted, `${engine} control conflicting-id: the production comparator rejects sibling ID pollution`, { metrics })
          ctx.negativeControl(`S2-05-${engine}-conflicting-id`, { accepted: metrics.accepted, eligibleFraction: metrics.eligibleFraction, differingPixels: metrics.differingPixels, maxChannelDelta: metrics.maxChannelDelta })
          await fsp.writeFile(path.join(dir, 'controls', `${engine}-conflicting-id-present.png`), present)
          await fsp.writeFile(path.join(dir, 'controls', `${engine}-conflicting-id-isolated.png`), isolated)
          engineControls.conflictingId = { analysis: controlAnalysis, metrics }
        }
      } finally {
        await controlPage.close()
      }
      }

      for (const index of targetIndices) {
        const instance = instances[index]
        const expectedKey = ctx.caseKey(instance)
        const rawClip = await cellClip(page, index)
        const clip = integralClip(rawClip, instance.px)
        addBrowserCase(ctx, id)
        ctx.assert(id, clip !== null, `${engine} instance ${index}: target box is at integral screen coordinates with deviceScaleFactor 1`, { rawClip, instance })
        if (!clip) continue
        const before = await targetSnapshot(page, index)
        addBrowserCase(ctx, id)
        ctx.assert(id, before.missing === false && before.dpr === 1 && before.scrollX === 0 && before.scrollY === 0, `${engine} instance ${index}: target snapshot is present at deviceScaleFactor 1 with no scroll offset`, { before })
        const populatedA = await captureClip(page, clip)
        await settleRaster(page)
        const populatedB = await captureClip(page, clip)
        const baseline = compareFullPixels(populatedA, populatedB, ctx.PNG)
        const removed = await removeOtherSvgs(page, index)
        await settleRaster(page)
        const afterRawClip = await cellClip(page, index)
        const after = await targetSnapshot(page, index)
        const afterClip = integralClip(afterRawClip, instance.px)
        addBrowserCase(ctx, id)
        ctx.assert(id, removed === instances.length - 1, `${engine} instance ${index}: every other avatar SVG is removed while every cell wrapper remains`, { removed, expected: instances.length - 1 })
        addBrowserCase(ctx, id)
        ctx.assert(id, JSON.stringify(afterClip) === JSON.stringify(clip), `${engine} instance ${index}: target clip coordinates are unchanged by sibling removal`, { before: clip, after: afterClip })
        addBrowserCase(ctx, id)
        ctx.assert(id, JSON.stringify(after) === JSON.stringify(before), `${engine} instance ${index}: target bounding box and computed font environment are unchanged by sibling removal`, { before, after })
        const isolatedA = await captureClip(page, clip)
        await settleRaster(page)
        const isolatedB = await captureClip(page, clip)
        const isolatedStability = compareFullPixels(isolatedA, isolatedB, ctx.PNG)
        const restored = await restoreOtherSvgs(page)
        await settleRaster(page)
        const restoredSnapshot = await targetSnapshot(page, index)
        addBrowserCase(ctx, id)
        ctx.assert(id, restored === removed, `${engine} instance ${index}: removed sibling SVGs are restored`, { restored, removed })
        addBrowserCase(ctx, id)
        ctx.assert(id, JSON.stringify(restoredSnapshot) === JSON.stringify(before), `${engine} instance ${index}: target geometry/font environment is unchanged after restoration`, { before, restoredSnapshot })
        const acceptance = compareFullPixels(populatedA, isolatedA, ctx.PNG)
        addBrowserCase(ctx, id)
        ctx.assert(id, acceptance.dimensionsEqual && acceptance.eligibleFraction === 1 && acceptance.eligiblePixels === instance.px * instance.px, `${engine} instance ${index}: full target box (${instance.px * instance.px} pixels) is eligible; no mask`, { instance, acceptance })
        if (!baseline.accepted || !isolatedStability.accepted) {
          ctx.block(id, `${engine} instance ${index}: repeated captures are not pixel-identical, so full-pixel isolation equality is not measurable`, { instance, baseline, isolatedStability })
        } else {
          addBrowserCase(ctx, id)
          ctx.assert(id, acceptance.accepted, `${engine} instance ${index}: full target raster equals the sibling-removed render over every eligible pixel`, {
            instance,
            expectedKey,
            populatedSha256: pngMetrics(populatedA, ctx.PNG).pixelSha256,
            isolatedSha256: pngMetrics(isolatedA, ctx.PNG).pixelSha256,
            baseline,
            isolatedStability,
            acceptance,
            before,
          })
        }
        const stem = `${engine}-${String(index).padStart(3, '0')}`
        await fsp.writeFile(path.join(dir, 'matched', `${stem}-populated-a.png`), populatedA)
        await fsp.writeFile(path.join(dir, 'matched', `${stem}-populated-b.png`), populatedB)
        await fsp.writeFile(path.join(dir, 'matched', `${stem}-isolated-a.png`), isolatedA)
        await fsp.writeFile(path.join(dir, 'matched', `${stem}-isolated-b.png`), isolatedB)
        engineRows.push({
          engine,
          index,
          style: instance.style,
          seed: instance.seed,
          name: instance.name,
          px: instance.px,
          clip,
          populatedSha256: pngMetrics(populatedA, ctx.PNG).pixelSha256,
          populatedRepeatSha256: pngMetrics(populatedB, ctx.PNG).pixelSha256,
          isolatedSha256: pngMetrics(isolatedA, ctx.PNG).pixelSha256,
          isolatedRepeatSha256: pngMetrics(isolatedB, ctx.PNG).pixelSha256,
          baseline,
          isolatedStability,
          acceptance,
          fullImageExact: acceptance.accepted,
          targetGeometryAndFontUnchanged: JSON.stringify(after) === JSON.stringify(before),
        })
      }
    } catch (error) {
      engineError = error
      ctx.block(id, `${engine}: matched-context measurement failed: ${error.message}`, { stack: error.stack })
    } finally {
      if (context) await context.close()
    }
    rowsByEngine[engine] = engineRows
    controlsByEngine[engine] = engineControls
    const acceptedRows = engineRows.filter((row) => row.acceptance?.accepted)
    const eligiblePixelsTotal = engineRows.reduce((sum, row) => sum + (row.acceptance?.eligiblePixels ?? 0), 0)
    const differingPixelsTotal = engineRows.reduce((sum, row) => sum + (row.acceptance?.differingPixels ?? 0), 0)
    summaries[engine] = {
      browserVersion: await browsers[engine].version(),
      targetIndices,
      targetCount: engineRows.length,
      stylesCovered: new Set(engineRows.map((row) => row.style)).size,
      eligiblePixelsTotal,
      eligibleFractionMinimum: engineRows.length ? Math.min(...engineRows.map((row) => row.acceptance?.eligibleFraction ?? 0)) : 0,
      acceptedTargets: acceptedRows.length,
      rejectedTargets: engineRows.length - acceptedRows.length,
      baselineUnstableTargets: engineRows.filter((row) => !row.baseline.accepted).length,
      isolatedUnstableTargets: engineRows.filter((row) => !row.isolatedStability.accepted).length,
      differingPixelsTotal,
      controlsScope: engine === 'chromium' ? 'all comparator controls' : 'matched equality only; comparator controls are Chromium-only',
      error: engineError ? { message: engineError.message, stack: engineError.stack } : null,
    }
    await fsp.writeFile(path.join(dir, `S2-05-matched-${engine}.json`), `${JSON.stringify({ engine, summary: summaries[engine], rows: engineRows, controls: engineControls }, null, 2)}\n`)
    ctx.note(id, `${engine}: ${engineRows.length} matched targets (${summaries[engine].stylesCovered} styles), ${acceptedRows.length} full-pixel equal, ${eligiblePixelsTotal} eligible pixels, ${differingPixelsTotal} differing`)
  }
  ctx.note(id, `comparator controls use the same compareFullPixels acceptance; ${Object.keys(controlsByEngine.chromium ?? {}).length} groups in Chromium; Firefox/WebKit ran matched equality only`)
  await fsp.writeFile(path.join(dir, 'S2-05-matched.json'), `${JSON.stringify({ engines: summaries, rows: rowsByEngine, controls: controlsByEngine }, null, 2)}\n`)
  return {
    instances: instances.length,
    duplicateIds: ctx.definitionAnalysis.duplicateIds,
    conflicts: ctx.definitionAnalysis.conflicts,
    withinDocumentConflicts: ctx.definitionAnalysis.withinDocumentConflicts,
    definitionCount: ctx.definitionAnalysis.definitionCount,
    idCount: ctx.definitionAnalysis.idCount,
    engines: summaries,
    rows: rowsByEngine,
    controls: controlsByEngine,
    matchedFile: path.join(dir, 'S2-05-matched.json'),
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