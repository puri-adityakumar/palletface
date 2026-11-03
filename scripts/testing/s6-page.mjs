#!/usr/bin/env node
/**
 * Stage 6 browser page helpers.
 *
 * Every page records bounded request/failure/console/page-error traces. The
 * rendered-SVG comparator serializes the same expected library string into a
 * detached element in the same browser, so DOM normalization can never hide a
 * mismatch between the display and the expected SVG.
 */
import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { isLocalRequest } from './s6-lib.mjs'

export function bounded(values, limit = 200) {
  return values.slice(-limit)
}

function compactUrl(url) {
  if (typeof url !== 'string') return url
  if (url.length <= 300) return url
  return `${url.slice(0, 300)}…(${url.length} chars)`
}

function compactRequest(entry) {
  return { ...entry, url: compactUrl(entry.url) }
}

function attachRecorder(page, origin) {
  const rec = {
    requests: [],
    failed: [],
    httpErrors: [],
    pageErrors: [],
    consoleErrors: [],
    external: [],
  }
  page.on('request', (request) => {
    const url = request.url()
    if (!isLocalRequest(url, origin)) {
      rec.external.push({ url, resourceType: request.resourceType() })
      return
    }
    rec.requests.push({ url, method: request.method(), resourceType: request.resourceType() })
  })
  page.on('requestfailed', (request) => {
    rec.failed.push({
      url: request.url(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText ?? null,
    })
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      rec.httpErrors.push({ url: response.url(), status: response.status() })
    }
  })
  page.on('pageerror', (error) => {
    rec.pageErrors.push(String(error?.message ?? error))
  })
  page.on('console', (message) => {
    if (message.type() === 'error') rec.consoleErrors.push(message.text())
  })
  return rec
}

export async function openPage(browser, {
  origin,
  url,
  waitReady = true,
  contextOptions = {},
  permissions = null,
  initScripts = [],
  blocks = [],
  loadTimeout = 30_000,
  waitTimeout = 15_000,
}) {
  const context = await browser.newContext({ acceptDownloads: true, ...contextOptions })
  let permissionError = null
  if (permissions) {
    try {
      await context.grantPermissions(permissions, { origin })
    } catch (error) {
      permissionError = error.message
    }
  }
  for (const script of initScripts) await context.addInitScript(script)
  for (const block of blocks) {
    await context.route(block.glob, (route) => route.abort(block.error ?? 'failed'))
  }
  const page = await context.newPage()
  const rec = attachRecorder(page, origin)
  const started = Date.now()
  let gotoError = null
  try {
    await page.goto(`${origin}${url}`, { waitUntil: 'load', timeout: loadTimeout })
  } catch (error) {
    gotoError = error.message
  }
  let readyError = null
  if (waitReady && !gotoError) {
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('#gallery button').length === 8,
        null,
        { timeout: waitTimeout },
      )
    } catch (error) {
      readyError = error.message
    }
  }
  const durationMs = Date.now() - started
  return { context, page, rec, permissionError, gotoError, readyError, durationMs }
}

export async function closePage(opened) {
  if (!opened?.context) return
  try {
    await opened.context.close()
  } catch {
    // The trace already records the failure that mattered.
  }
}

export async function readState(page) {
  return page.evaluate(() => {
    const value = (id) => document.getElementById(id)?.value ?? null
    const previewSvg = document.querySelector('#preview svg')
    const params = new URL(location.href).searchParams
    const paramAll = {}
    for (const key of new Set(params.keys())) paramAll[key] = params.getAll(key)
    return {
      seed: value('seed'),
      name: value('name'),
      size: value('size'),
      source: value('svg-source'),
      usage: document.getElementById('usage')?.textContent ?? '',
      status: document.getElementById('status')?.textContent ?? '',
      url: location.href,
      search: location.search,
      hash: location.hash,
      pathname: location.pathname,
      paramAll,
      selected: [...document.querySelectorAll('#gallery button[aria-pressed="true"]')].map((button) => button.dataset.style),
      selectedTitle: document.getElementById('selected-title')?.textContent ?? '',
      galleryButtons: document.querySelectorAll('#gallery button').length,
      gallerySvgs: document.querySelectorAll('#gallery .thumb svg').length,
      previewSvgCount: document.querySelectorAll('#preview svg').length,
      previewWidth: previewSvg?.getAttribute('width') ?? null,
      previewHeight: previewSvg?.getAttribute('height') ?? null,
      previewViewBox: previewSvg?.getAttribute('viewBox') ?? null,
      manualOpen: document.getElementById('manual-panel')?.open ?? false,
      manualValue: value('manual-copy'),
      historyLength: history.length,
      sizeOptions: [...document.querySelectorAll('#size option')].map((option) => option.value),
    }
  })
}

export async function assertRendered(c, page, selector, expectedSvg, label) {
  const result = await page.evaluate(({ selector, svg }) => {
    const element = document.querySelector(selector)
    if (!element) return { ok: false, reason: 'missing element', selector }
    const reference = document.createElement('span')
    reference.innerHTML = svg
    const actualHtml = element.innerHTML
    const expectedHtml = reference.innerHTML
    // The site decorates only the preview SVG with aria-hidden="true" after
    // inserting the library bytes. That single site-owned attribute is not
    // part of the library output; every other byte still has to match.
    const allowAriaHidden = selector === '#preview' ? 1 : 0
    const removedActual = (actualHtml.match(/ aria-hidden="true"/g) ?? []).length
    const removedExpected = (expectedHtml.match(/ aria-hidden="true"/g) ?? []).length
    const normalize = (html) => html.replace(/ aria-hidden="true"/g, '')
    return {
      ok:
        removedActual <= allowAriaHidden &&
        removedExpected === 0 &&
        normalize(actualHtml) === normalize(expectedHtml),
      removedActual,
      removedExpected,
      allowAriaHidden,
      actual: actualHtml.slice(0, 600),
      expected: expectedHtml.slice(0, 600),
    }
  }, { selector, svg: expectedSvg })
  c.check(result.ok, label, result)
  return result
}

export async function assertThumbnail(c, page, index, expectedSvg, label) {
  return assertRendered(c, page, `#gallery button:nth-child(${index + 1}) .thumb`, expectedSvg, label)
}

export function assertClean(c, rec, {
  allowFailed = 0,
  allowConsoleErrors = 0,
  label = 'clean',
} = {}) {
  c.check(rec.pageErrors.length === 0, `${label}: no unhandled page errors`, { pageErrors: rec.pageErrors })
  c.check(rec.external.length === 0, `${label}: no external requests`, { external: rec.external })
  c.check(rec.httpErrors.length === 0, `${label}: no HTTP >=400 responses`, { httpErrors: rec.httpErrors })
  c.check(rec.failed.length === allowFailed, `${label}: failed request count`, {
    expected: allowFailed,
    failed: rec.failed,
  })
  c.check(rec.consoleErrors.length === allowConsoleErrors, `${label}: console error count`, {
    expected: allowConsoleErrors,
    consoleErrors: rec.consoleErrors,
  })
}

export function traceRecord(caseName, rec) {
  if (!rec) return { case: caseName, missing: true }
  return {
    case: caseName,
    requests: bounded(rec.requests, 200).map(compactRequest),
    failed: bounded(rec.failed, 50).map(compactRequest),
    httpErrors: bounded(rec.httpErrors, 50).map(compactRequest),
    pageErrors: bounded(rec.pageErrors, 50),
    consoleErrors: bounded(rec.consoleErrors, 50),
    external: bounded(rec.external, 50).map(compactRequest),
  }
}

export async function captureScreenshot(page, directory, name, { fullPage = false } = {}) {
  await fsp.mkdir(directory, { recursive: true })
  const pathName = path.join(directory, `${name}.png`)
  await page.screenshot({ path: pathName, fullPage, animations: 'disabled', caret: 'hide' })
  const bytes = await fsp.readFile(pathName)
  return {
    name,
    path: pathName,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}
