#!/usr/bin/env node
/**
 * Stage 4 real-browser checks. Playwright is loaded from the sandbox tools
 * project; the pages are the actual Vite dev/preview apps, not synthetic HTML.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  decodeSvgDataUrl,
  isLocalRequest,
  sha256,
  SVG_DATA_URL_PREFIX,
} from './s4-lib.mjs'

export function loadPlaywright(toolsDir) {
  const requireFromTools = createRequire(path.join(toolsDir, 'package.json'))
  return requireFromTools('playwright')
}

function attachEvents(page) {
  const consoleErrors = []
  const pageErrors = []
  const requests = []
  const requestFailures = []
  const badResponses = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), location: message.location() })
    }
  })
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)))
  page.on('request', (request) => requests.push(request.url()))
  page.on('requestfailed', (request) => {
    requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? null })
  })
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() })
  })
  return { consoleErrors, pageErrors, requests, requestFailures, badResponses }
}

async function waitForImages(page, selector, count) {
  await page.waitForFunction(
    ({ selector, count }) => {
      const images = [...document.querySelectorAll(selector)]
      return images.length === count && images.every((img) => img.complete && img.naturalWidth > 0)
    },
    { selector, count },
    { timeout: 45_000 },
  )
}

async function readVanilla(page) {
  return page.evaluate(() => {
    const state = window.__s4
    const figures = [...document.querySelectorAll('#grid figure')]
    return {
      state: {
        seed: state.seed,
        name: state.name,
        size: state.size,
        renders: state.renders,
      },
      images: document.querySelectorAll('#grid img').length,
      status: document.querySelector('#status')?.textContent ?? null,
      records: figures.map((figure) => {
        const img = figure.querySelector('img')
        return {
          style: figure.dataset.style,
          src: img.src,
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
        }
      }),
    }
  })
}

async function waitForVanilla(page, expected) {
  await page.waitForFunction(
    (expected) => {
      const state = window.__s4
      if (!state) return false
      for (const [key, value] of Object.entries(expected)) {
        if (state[key] !== value) return false
      }
      const images = [...document.querySelectorAll('#grid img')]
      return images.length === 8 && images.every((img) => img.complete && img.naturalWidth > 0)
    },
    expected,
    { timeout: 30_000 },
  )
}

function hashRecords(ctx, records, golden, label, { expectGolden = true } = {}) {
  const hashes = {}
  const expected = Object.fromEntries(golden.styles.map((row) => [row.slug, row.sha256]))
  ctx.assert(records.length === 8, `${label}: eight avatar records`)
  for (const record of records) {
    const decoded = decodeSvgDataUrl(record.src)
    ctx.assert(decoded !== null, `${label}: ${record.style} src is an SVG data URL`)
    if (decoded === null) continue
    const hash = sha256(decoded)
    hashes[record.style] = { sha256: hash, bytes: Buffer.byteLength(decoded) }
    if (expectGolden) {
      ctx.assert(hash === expected[record.style], `${label}: ${record.style} decoded golden`, {
        actual: hash,
        expected: expected[record.style],
      })
    }
  }
  return hashes
}

function checkEvents(ctx, events, origin, label, mark = 0) {
  const external = events.requests.filter((url) => !isLocalRequest(url, origin))
  const externalAfterLoad = events.requests.slice(mark).filter((url) => !isLocalRequest(url, origin))
  ctx.assert(events.consoleErrors.length === 0, `${label}: no console errors`, {
    consoleErrors: events.consoleErrors,
  })
  ctx.assert(events.pageErrors.length === 0, `${label}: no page errors`, { pageErrors: events.pageErrors })
  ctx.assert(events.requestFailures.length === 0, `${label}: no failed requests`, {
    requestFailures: events.requestFailures,
  })
  ctx.assert(events.badResponses.length === 0, `${label}: no HTTP >=400 responses`, {
    badResponses: events.badResponses,
  })
  ctx.assert(external.length === 0, `${label}: no external requests`, { external })
  ctx.assert(externalAfterLoad.length === 0, `${label}: no external requests after load`, {
    externalAfterLoad,
    requestsAfterLoad: events.requests.slice(mark),
  })
  return {
    requestCount: events.requests.length,
    external,
    externalAfterLoad,
    consoleErrorCount: events.consoleErrors.length,
    pageErrorCount: events.pageErrors.length,
    requestFailureCount: events.requestFailures.length,
    badResponseCount: events.badResponses.length,
  }
}

async function screenshot(page, file) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file, fullPage: true })
  return { path: file, sha256: sha256(await fs.readFile(file)) }
}

export async function runVanilla(ctx, options) {
  const { engineName, url, mode, scenarioId, golden, toolsDir, outDir } = options
  const playwright = loadPlaywright(toolsDir)
  const browser = await playwright[engineName].launch({ headless: true })
  const browserVersion = browser.version()
  const executablePath = playwright[engineName].executablePath()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  const events = attachEvents(page)
  const origin = new URL(url).origin
  const label = `${scenarioId}/${engineName}/${mode}`

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await waitForVanilla(page, { seed: 'preview-output', name: '7even', size: 80 })
    await waitForImages(page, '#grid img', 8)
    const initial = await readVanilla(page)
    const initialHashes = hashRecords(ctx, initial.records, golden, `${label}/initial`)
    ctx.assert(initial.state.renders >= 1, `${label}: app rendered`)
    ctx.assert(initial.records.every((row) => row.naturalWidth === 80), `${label}: initial size is 80px`)
    const mark = events.requests.length

    // Size update.
    const beforeSize = initial.state.renders
    await page.selectOption('#size', '120')
    await waitForVanilla(page, { seed: 'preview-output', name: '7even', size: 120 })
    await waitForImages(page, '#grid img', 8)
    const sized = await readVanilla(page)
    ctx.assert(sized.state.renders > beforeSize, `${label}: size update re-rendered`)
    ctx.assert(sized.records.every((row) => row.naturalWidth === 120), `${label}: size update renders at 120px`)
    ctx.assert(sized.records.every((row) => row.width === 120), `${label}: width attribute updates`)

    // Reset, then name-only update: only the three letter styles may change.
    await page.click('#reset')
    await waitForVanilla(page, { seed: 'preview-output', name: '7even', size: 80 })
    await waitForImages(page, '#grid img', 8)
    const baseline = await readVanilla(page)
    const baselineHashes = hashRecords(ctx, baseline.records, golden, `${label}/baseline`)
    await page.fill('#name', 'Ada')
    await waitForVanilla(page, { seed: 'preview-output', name: 'Ada', size: 80 })
    await waitForImages(page, '#grid img', 8)
    const renamed = await readVanilla(page)
    const renamedHashes = hashRecords(ctx, renamed.records, golden, `${label}/renamed-non-golden`, {
      expectGolden: false,
    })
    const letterSlugs = new Set(['pixel-letter', 'ascii-letter', 'pixelify-letter'])
    for (const record of renamed.records) {
      const before = baselineHashes[record.style]?.sha256
      const after = renamedHashes[record.style]?.sha256
      if (letterSlugs.has(record.style)) {
        ctx.assert(before !== after, `${label}: name changes ${record.style}`)
      } else {
        ctx.assert(before === after, `${label}: name does not change ${record.style}`)
      }
    }

    // Reset, then a Unicode seed/name update: every style changes and loads.
    await page.click('#reset')
    await waitForVanilla(page, { seed: 'preview-output', name: '7even', size: 80 })
    const beforeSeed = await readVanilla(page)
    const beforeSeedHashes = hashRecords(ctx, beforeSeed.records, golden, `${label}/before-seed`)
    await page.fill('#seed', '用户-42')
    await page.fill('#name', 'Élodie')
    await waitForVanilla(page, { seed: '用户-42', name: 'Élodie', size: 80 })
    await waitForImages(page, '#grid img', 8)
    const seeded = await readVanilla(page)
    const seededHashes = hashRecords(ctx, seeded.records, golden, `${label}/seeded-non-golden`, {
      expectGolden: false,
    })
    for (const record of seeded.records) {
      ctx.assert(
        beforeSeedHashes[record.style]?.sha256 !== seededHashes[record.style]?.sha256,
        `${label}: Unicode seed/name changes ${record.style}`,
      )
    }
    ctx.assert(seeded.status?.includes('用户-42') === true, `${label}: status reflects seed`)

    // Final reset proves the page returns to the recorded golden state.
    await page.click('#reset')
    await waitForVanilla(page, { seed: 'preview-output', name: '7even', size: 80 })
    await waitForImages(page, '#grid img', 8)
    const final = await readVanilla(page)
    hashRecords(ctx, final.records, golden, `${label}/final`)

    const network = checkEvents(ctx, events, origin, label, mark)
    const shot = await screenshot(page, path.join(outDir, 'screenshots', `${scenarioId}-${engineName}-${mode}.png`))
    ctx.assert(Boolean(shot.sha256), `${label}: smoke screenshot captured`)

    return {
      engine: engineName,
      browserVersion,
      executablePath,
      mode,
      url,
      origin,
      initialHashes,
      finalHashes: baselineHashes,
      seededHashes,
      network,
      screenshot: shot,
    }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

async function readReact(page) {
  return page.evaluate(() => {
    const state = window.__s4react
    const main = document.querySelector('[data-testid="avatar-main"]')
    const mainImg = document.querySelector('[data-testid="avatar-main"][data-mode="img"]')
    const inline = document.querySelector('[data-testid="avatar-inline"]')
    const list = [...document.querySelectorAll('[data-testid="avatar-list-item"]')]
    return {
      state,
      mainCount: main === null ? 0 : 1,
      mainMode: main?.getAttribute('data-mode') ?? null,
      mainSrc: mainImg?.src ?? null,
      mainWidth: mainImg?.width ?? null,
      mainNaturalWidth: mainImg?.naturalWidth ?? null,
      mainComplete: mainImg?.complete ?? null,
      inlineCount: inline === null ? 0 : 1,
      inlineHasSvg: inline?.querySelector('svg') !== null && inline?.querySelector('svg') !== undefined,
      inlineViewBox: inline?.querySelector('svg')?.getAttribute('viewBox') ?? null,
      listCount: list.length,
      listLoaded: list.length > 0 && list.every((img) => img.complete && img.naturalWidth > 0),
      listUniqueSources: new Set(list.map((img) => img.src)).size,
      status: document.querySelector('#status')?.textContent ?? null,
    }
  })
}

async function waitForReact(page, expected) {
  await page.waitForFunction(
    (expected) => {
      const state = window.__s4react
      if (!state) return false
      for (const [key, value] of Object.entries(expected)) {
        if (state[key] !== value) return false
      }
      const img = document.querySelector('[data-testid="avatar-main"][data-mode="img"]')
      if (expected.showMain !== false) {
        if (img === null || !img.complete || img.naturalWidth === 0) return false
      }
      return true
    },
    expected,
    { timeout: 30_000 },
  )
}

export async function runReact(ctx, options) {
  const { engineName, url, mode, scenarioId, golden, toolsDir, outDir } = options
  const playwright = loadPlaywright(toolsDir)
  const browser = await playwright[engineName].launch({ headless: true })
  const browserVersion = browser.version()
  const executablePath = playwright[engineName].executablePath()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  const events = attachEvents(page)
  const origin = new URL(url).origin
  const label = `${scenarioId}/${engineName}/${mode}`
  const goldenSprite = golden.styles.find((row) => row.slug === 'pixel-sprite')?.sha256

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await waitForReact(page, { seed: 'preview-output', name: '7even', size: 80, showMain: true })
    const initial = await readReact(page)
    ctx.assert(initial.mainCount === 1 && initial.mainMode === 'img', `${label}: typed <img> main avatar mounted`)
    const initialDecoded = decodeSvgDataUrl(initial.mainSrc)
    ctx.assert(initialDecoded !== null, `${label}: main src is an SVG data URL`)
    const initialHash = initialDecoded === null ? null : sha256(initialDecoded)
    ctx.assert(initialHash === goldenSprite, `${label}: main pixel-sprite golden`, {
      actual: initialHash,
      expected: goldenSprite,
    })
    ctx.assert(initial.mainNaturalWidth === 80, `${label}: main avatar renders at 80px`)
    ctx.assert(initial.inlineCount === 0, `${label}: inline specimen initially absent`)
    const mark = events.requests.length

    // Optional inline specimen.
    await page.click('#toggle-inline')
    await page.waitForFunction(
      () => document.querySelector('[data-testid="avatar-inline"] svg') !== null,
      undefined,
      { timeout: 15_000 },
    )
    const inline = await readReact(page)
    ctx.assert(inline.inlineCount === 1 && inline.inlineHasSvg, `${label}: inline specimen renders an SVG`)
    ctx.assert(Boolean(inline.inlineViewBox), `${label}: inline SVG has a viewBox`)
    await page.click('#toggle-inline')
    await page.waitForFunction(
      () => document.querySelector('[data-testid="avatar-inline"]') === null,
      undefined,
      { timeout: 15_000 },
    )
    ctx.assert((await readReact(page)).inlineCount === 0, `${label}: inline specimen unmounts`)

    // Prop/state updates.
    await page.fill('#seed', '用户-42')
    await page.fill('#name', 'Élodie')
    await page.selectOption('#size', '120')
    await waitForReact(page, { seed: '用户-42', name: 'Élodie', size: 120, showMain: true })
    const updated = await readReact(page)
    ctx.assert(updated.mainSrc !== initial.mainSrc, `${label}: prop/state update changes src`)
    ctx.assert(updated.mainNaturalWidth === 120, `${label}: prop/state size update renders at 120px`)
    ctx.assert(updated.status?.includes('用户-42') === true, `${label}: status reflects state`)

    // Mount/unmount the main avatar.
    await page.click('#toggle-main')
    await page.waitForFunction(
      () => document.querySelector('[data-testid="avatar-main"]') === null,
      undefined,
      { timeout: 15_000 },
    )
    ctx.assert((await readReact(page)).mainCount === 0, `${label}: main avatar unmounts`)
    await page.click('#toggle-main')
    await waitForReact(page, { seed: '用户-42', name: 'Élodie', size: 120, showMain: true })
    ctx.assert((await readReact(page)).mainCount === 1, `${label}: main avatar remounts`)

    // 100-avatar list.
    await page.click('#toggle-list')
    await page.waitForFunction(
      () => {
        const images = [...document.querySelectorAll('[data-testid="avatar-list-item"]')]
        return images.length === 100 && images.every((img) => img.complete && img.naturalWidth > 0)
      },
      undefined,
      { timeout: 45_000 },
    )
    const listed = await readReact(page)
    ctx.assert(listed.listCount === 100, `${label}: 100-avatar list mounts`)
    ctx.assert(listed.listLoaded, `${label}: all 100 list avatars load`)
    ctx.assert(listed.listUniqueSources === 100, `${label}: 100 list avatars have distinct data URLs`, {
      unique: listed.listUniqueSources,
    })
    await page.click('#toggle-list')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="avatar-list-item"]').length === 0,
      undefined,
      { timeout: 15_000 },
    )
    ctx.assert((await readReact(page)).listCount === 0, `${label}: 100-avatar list unmounts`)

    // Reset to the recorded golden state.
    await page.fill('#seed', 'preview-output')
    await page.fill('#name', '7even')
    await page.selectOption('#size', '80')
    await waitForReact(page, { seed: 'preview-output', name: '7even', size: 80, showMain: true })
    const final = await readReact(page)
    const finalDecoded = decodeSvgDataUrl(final.mainSrc)
    const finalHash = finalDecoded === null ? null : sha256(finalDecoded)
    ctx.assert(finalHash === goldenSprite, `${label}: reset main golden`, {
      actual: finalHash,
      expected: goldenSprite,
    })

    const network = checkEvents(ctx, events, origin, label, mark)
    const shot = await screenshot(page, path.join(outDir, 'screenshots', `${scenarioId}-${engineName}-${mode}.png`))
    ctx.assert(Boolean(shot.sha256), `${label}: smoke screenshot captured`)

    return {
      engine: engineName,
      browserVersion,
      executablePath,
      mode,
      url,
      origin,
      initialHash,
      finalHash,
      main300Bytes: initialDecoded === null ? 0 : Buffer.byteLength(initialDecoded),
      network,
      screenshot: shot,
    }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}
