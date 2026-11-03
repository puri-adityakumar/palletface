#!/usr/bin/env node
/**
 * Stage 5 qualification harness: Next SSR/hydration, Vue, Svelte, Cloudflare
 * workerd, browser Web Worker, plain-HTML offline, and raw framework parity.
 *
 * This file is a test instrument, not a product change. It installs the
 * approved tarball into disposable framework apps outside the repository,
 * starts real servers, drives real Chromium/Firefox pages, and writes raw
 * evidence under the ignored out/qualification/S5 tree.
 *
 * Phases are sequential and are never resumed:
 *   prepare -> install -> build -> test
 * Every child command is bounded (10 minutes by default). No expected value is
 * derived from a run under test; acceptance hashes come from
 * tests/qualification/s5/fixtures/golden.json.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
function arg(name, fallback = null) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

const repo = path.resolve(arg('--repo', process.cwd()))
const outDir = path.resolve(arg('--out', path.join(repo, 'out/qualification/S5')))
const workDir = path.resolve(arg('--work', path.join(outDir, 'work')))
const fixturesArg = path.resolve(arg('--fixtures', path.join(repo, 'tests/qualification/s5')))
const expectedPath = path.resolve(arg('--expected', path.join(fixturesArg, 'expected-results.json')))
const goldenPath = path.resolve(arg('--golden', path.join(fixturesArg, 'fixtures/golden.json')))
const tarballPath = path.resolve(arg('--tarball', path.join(outDir, 'dither-face-0.1.0.tgz')))
const sourceManifestPath = arg('--source-manifest', null)
const commitArg = arg('--commit', null)
const sandboxArg = arg('--sandbox', 'unknown-sandbox')
const imageArg = arg('--image', 'blaxel/ts-app:latest')
const regionArg = arg('--region', 'us-pdx-1')
const memoryArg = Number(arg('--memory', '4096'))
const phase = arg('--phase', 'test')
const expectedShaArg = arg('--expected-sha', null)
const goldenShaArg = arg('--golden-sha', null)

const appsDir = path.join(workDir, 'apps')
const toolsDir = path.join(workDir, 'tools')
const browsersPath = path.join(workDir, 'pw-browsers')
const extractedPackageDir = path.join(workDir, 'package-extracted')
const logsDir = path.join(outDir, 'logs')
const screenshotsDir = path.join(outDir, 'screenshots')
const artifactsDir = path.join(outDir, 'artifacts')
const controlsDir = path.join(workDir, 'controls')

const perCommandMs = 600_000
const appNames = ['next', 'vue', 'svelte', 'worker', 'webworker', 'plain']
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
const baseEnv = {
  ...process.env,
  CI: '1',
  NO_UPDATE_NOTIFIER: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  WRANGLER_SEND_METRICS: 'false',
  PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
}
delete baseEnv.CLOUDFLARE_API_TOKEN
delete baseEnv.CLOUDFLARE_API_KEY

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
async function sha256File(file) {
  return sha256(await fsp.readFile(file))
}
async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}
async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function rel(file) {
  return path.relative(outDir, file).split(path.sep).join('/')
}
function sanitize(label) {
  return label.replace(/[^A-Za-z0-9_.-]+/g, '-')
}

async function runCommand({ label, command, cwd = repo, env = {}, timeoutMs = perCommandMs }) {
  const started = Date.now()
  const child = spawn('/bin/bash', ['-lc', command], {
    cwd,
    env: { ...baseEnv, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = []
  const stderr = []
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }, timeoutMs)
  child.stdout.on('data', (chunk) => stdout.push(chunk))
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  const { code, signal } = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (value, sig) => resolve({ code: value, signal: sig }))
  })
  clearTimeout(timer)
  const stdoutText = Buffer.concat(stdout).toString('utf8')
  const stderrText = Buffer.concat(stderr).toString('utf8')
  const record = {
    label,
    command,
    cwd,
    exitCode: code,
    signal,
    timedOut,
    durationMs: Date.now() - started,
    stdout: stdoutText.slice(-30000),
    stderr: stderrText.slice(-30000),
    log: null,
  }
  await fsp.mkdir(logsDir, { recursive: true })
  const logPath = path.join(logsDir, `${sanitize(label)}.log`)
  await fsp.writeFile(
    logPath,
    `$ ${command}\n# cwd=${cwd}\n# exit=${code} signal=${signal ?? 'none'} timedOut=${timedOut} durationMs=${record.durationMs}\n\n${stdoutText}${stderrText}\n`,
  )
  record.log = rel(logPath)
  return record
}

function startProcess({ label, command, cwd, env = {} }) {
  const logPath = path.join(logsDir, `${sanitize(label)}.server.log`)
  fs.mkdirSync(logsDir, { recursive: true })
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  const child = spawn('/bin/bash', ['-lc', `exec ${command}`], {
    cwd,
    env: { ...baseEnv, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(stream)
  child.stderr.pipe(stream)
  let exit = null
  child.on('close', (code, signal) => {
    exit = { code, signal, at: new Date().toISOString() }
  })
  return { label, child, logPath, log: rel(logPath), get exit() { return exit } }
}

async function stopProcess(handle, timeoutMs = 8000) {
  if (!handle) return
  try {
    process.kill(-handle.child.pid, 'SIGTERM')
  } catch {
    try {
      handle.child.kill('SIGTERM')
    } catch {
      // Already gone.
    }
  }
  const started = Date.now()
  while (handle.exit === null && Date.now() - started < timeoutMs) await sleep(100)
  if (handle.exit === null) {
    try {
      process.kill(-handle.child.pid, 'SIGKILL')
    } catch {
      try {
        handle.child.kill('SIGKILL')
      } catch {
        // Already gone.
      }
    }
  }
  return handle.exit
}

async function waitForHttp(url, { timeoutMs = 90000, expect = (response) => response.ok } = {}) {
  const started = Date.now()
  let lastError = null
  let lastStatus = null
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' })
      lastStatus = response.status
      if (expect(response)) return response
    } catch (error) {
      lastError = error.message
    }
    await sleep(250)
  }
  throw new Error(`HTTP wait failed for ${url} after ${timeoutMs}ms: status=${lastStatus} error=${lastError}`)
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractImages(html, marker) {
  const images = []
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0]
    const attrs = {}
    for (const attribute of tag.matchAll(/([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g)) {
      attrs[attribute[1]] = decodeHtmlAttribute(attribute[2])
    }
    if (attrs[marker]) images.push({ style: attrs[marker], src: attrs.src ?? '' })
  }
  return images
}

const dataPrefix = 'data:image/svg+xml;charset=utf-8,'
function decodeDataUrl(src) {
  const clean = decodeHtmlAttribute(String(src ?? ''))
  if (!clean.startsWith(dataPrefix)) return { ok: false, error: `unexpected data URL prefix: ${clean.slice(0, 64)}` }
  try {
    return { ok: true, svg: decodeURIComponent(clean.slice(dataPrefix.length)) }
  } catch (error) {
    return { ok: false, error: `decodeURIComponent failed: ${error.message}` }
  }
}

function imagesToRaw(images, label) {
  const raw = {}
  const errors = []
  for (const image of images) {
    const decoded = decodeDataUrl(image.src)
    if (!decoded.ok) errors.push({ style: image.style, error: decoded.error })
    else raw[image.style] = decoded.svg
  }
  return { label, raw, errors }
}

function hashRawMap(raw) {
  return Object.fromEntries(Object.entries(raw).map(([style, svg]) => [style, sha256(svg)]))
}

function firstDifference(expected, actual) {
  const length = Math.min(expected.length, actual.length)
  for (let index = 0; index < length; index += 1) {
    if (expected[index] !== actual[index]) {
      return {
        index,
        expectedCode: expected.codePointAt(index),
        actualCode: actual.codePointAt(index),
        expectedContext: expected.slice(Math.max(0, index - 40), index + 40),
        actualContext: actual.slice(Math.max(0, index - 40), index + 40),
      }
    }
  }
  if (expected.length !== actual.length) {
    return {
      index: length,
      reason: 'length-difference',
      expectedLength: expected.length,
      actualLength: actual.length,
      expectedContext: expected.slice(Math.max(0, length - 40), length + 40),
      actualContext: actual.slice(Math.max(0, length - 40), length + 40),
    }
  }
  return null
}

function compareRawMaps(expected, actual, label, diagnostics = null) {
  const issues = []
  const styles = Object.keys(expected)
  for (const style of styles) {
    if (actual[style] === undefined) {
      issues.push({ style, issue: 'missing-style' })
      continue
    }
    if (expected[style] !== actual[style]) {
      issues.push({
        style,
        issue: 'raw-byte-mismatch',
        expectedSha256: sha256(expected[style]),
        actualSha256: sha256(actual[style]),
        normalizationApplied: false,
        diff: firstDifference(expected[style], actual[style]),
        diagnosticNodeDiff:
          diagnostics && diagnostics[style] ? firstDifference(diagnostics[style], actual[style]) : null,
      })
    }
  }
  for (const style of Object.keys(actual)) {
    if (expected[style] === undefined) issues.push({ style, issue: 'unexpected-style' })
  }
  return { label, issues }
}

function compareHashes(expected, actual, label) {
  const issues = []
  for (const [style, hash] of Object.entries(expected)) {
    if (actual[style] === undefined) issues.push({ style, issue: 'missing-style', expectedSha256: hash })
    else if (actual[style] !== hash) {
      issues.push({ style, issue: 'hash-mismatch', expectedSha256: hash, actualSha256: actual[style] })
    }
  }
  for (const style of Object.keys(actual)) {
    if (expected[style] === undefined) issues.push({ style, issue: 'unexpected-style' })
  }
  return { label, issues }
}

class Scenario {
  constructor(id, title) {
    this.id = id
    this.title = title
    this.cases = 0
    this.assertions = 0
    this.failures = []
    this.notes = []
    this.currentCase = null
    this.startedAt = new Date().toISOString()
  }

  case(name) {
    this.cases += 1
    this.currentCase = name
  }

  assert(condition, label, detail = {}) {
    this.assertions += 1
    if (!condition) {
      this.failures.push({ case: this.currentCase, label, detail })
    }
    return Boolean(condition)
  }

  note(message) {
    this.notes.push(message)
  }

  error(error) {
    this.assertions += 1
    this.failures.push({
      case: this.currentCase,
      label: 'uncaught exception',
      detail: { message: error?.message ?? String(error), stack: error?.stack ?? String(error) },
    })
  }

  finish() {
    const status = this.failures.length === 0 && this.cases > 0 ? 'PASS' : 'FAIL'
    return {
      id: this.id,
      title: this.title,
      expectedStatus: 'PASS',
      actualStatus: status,
      cases: this.cases,
      assertions: this.assertions,
      failures: this.failures.length,
      failureDetails: this.failures,
      notes: this.notes,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
    }
  }
}

async function loadPlaywright() {
  const entry = path.join(toolsDir, 'node_modules/@playwright/test/index.mjs')
  return import(pathToFileURL(entry).href)
}

function attachPageEvents(page) {
  const events = {
    console: [],
    consoleErrors: [],
    pageErrors: [],
    requests: [],
    requestFailures: [],
    badResponses: [],
  }
  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: message.text(),
      location: typeof message.location === 'function' ? message.location() : null,
    }
    events.console.push(entry)
    if (entry.type === 'error') events.consoleErrors.push(entry)
  })
  page.on('pageerror', (error) => {
    events.pageErrors.push(String(error?.stack ?? error))
  })
  page.on('request', (request) => {
    events.requests.push({ url: request.url(), resourceType: request.resourceType() })
  })
  page.on('requestfailed', (request) => {
    events.requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? 'unknown',
    })
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      events.badResponses.push({ url: response.url(), status: response.status() })
    }
  })
  return events
}

function isLocalUrl(url) {
  return (
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('http://localhost') ||
    url.startsWith('file://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  )
}

function externalRequests(events) {
  return events.requests.filter((request) => !isLocalUrl(request.url))
}

async function openPage(browser, { javaScriptEnabled = true, viewport = { width: 1280, height: 900 } } = {}) {
  const context = await browser.newContext({ javaScriptEnabled, viewport })
  const page = await context.newPage()
  const events = attachPageEvents(page)
  return { context, page, events }
}

async function pageImages(page, marker) {
  const images = await page.evaluate((attribute) => {
    return Array.from(document.querySelectorAll(`img[${attribute}]`)).map((image) => ({
      style: image.getAttribute(attribute),
      src: image.getAttribute('src') ?? '',
    }))
  }, marker)
  return images
}

async function pageCurrent(page) {
  return page.evaluate(() => {
    const container = document.getElementById('current')
    const image = document.getElementById('current-avatar')
    return {
      style: container?.getAttribute('data-style') ?? null,
      src: image?.getAttribute('src') ?? '',
    }
  })
}

async function waitForHydrated(page) {
  await page.waitForSelector('#explorer[data-hydrated="true"]', { timeout: 30000 })
}

async function waitForLiveHashes(page, expected, timeoutMs = 15000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    const images = await pageImages(page, 'data-live')
    const converted = imagesToRaw(images, 'live')
    const hashes = hashRawMap(converted.raw)
    last = { images: converted, hashes }
    if (compareHashes(expected, hashes, 'live-wait').issues.length === 0) return { matched: true, ...last }
    await sleep(200)
  }
  return { matched: false, ...last }
}

async function takeScreenshot(page, name) {
  await fsp.mkdir(screenshotsDir, { recursive: true })
  const file = path.join(screenshotsDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return { path: rel(file), sha256: await sha256File(file), bytes: (await fsp.stat(file)).size }
}

function scenarioConsolePath(id) {
  return path.join(logsDir, `console-${id}.json`)
}

async function saveConsole(id, events) {
  await writeJson(scenarioConsolePath(id), {
    console: events.console,
    consoleErrors: events.consoleErrors,
    pageErrors: events.pageErrors,
    requests: events.requests,
    requestFailures: events.requestFailures,
    badResponses: events.badResponses,
    externalRequests: externalRequests(events),
  })
}

async function controlUpdateChecks(sc, page, golden, label) {
  const base = golden.sets.base
  const seedSet = golden.sets.seed
  const nameSet = golden.sets.name

  sc.case(`${label}: style control all eight`)
  const baseRaw = imagesToRaw(await pageImages(page, 'data-live'), 'base')
  sc.assert(baseRaw.errors.length === 0, `${label}: all live data URLs decode`, { errors: baseRaw.errors })
  const baseHashes = hashRawMap(baseRaw.raw)
  const baseCompare = compareHashes(base.styles, baseHashes, `${label}-base`)
  sc.assert(baseCompare.issues.length === 0, `${label}: initial live grid matches base golden`, {
    issues: baseCompare.issues,
  })

  for (const style of Object.keys(base.styles)) {
    await page.selectOption('#style', style)
    const started = Date.now()
    let current = null
    while (Date.now() - started < 5000) {
      current = await pageCurrent(page)
      if (current.style === style) break
      await sleep(50)
    }
    sc.assert(current?.style === style, `${label}: style control selects ${style}`, { actual: current?.style })
    const decoded = decodeDataUrl(current?.src ?? '')
    sc.assert(decoded.ok, `${label}: ${style} current data URL decodes`, { error: decoded.error })
    if (decoded.ok) {
      sc.assert(
        sha256(decoded.svg) === base.styles[style],
        `${label}: ${style} current raw hash matches golden`,
        { expected: base.styles[style], actual: sha256(decoded.svg) },
      )
    }
  }

  sc.case(`${label}: seed control updates all eight`)
  await page.fill('#seed', seedSet.seed)
  const seedWait = await waitForLiveHashes(page, seedSet.styles)
  sc.assert(seedWait.matched, `${label}: all eight live hashes update after seed change`, {
    hashes: seedWait.hashes,
  })
  sc.assert((await page.inputValue('#seed')) === seedSet.seed, `${label}: seed input holds expected value`)

  sc.case(`${label}: name control updates only letter styles`)
  await page.fill('#name', nameSet.name)
  const nameWait = await waitForLiveHashes(page, nameSet.styles)
  sc.assert(nameWait.matched, `${label}: all eight live hashes update after name change`, {
    hashes: nameWait.hashes,
  })
  const afterNameHashes = nameWait.hashes ?? {}
  for (const style of golden.nameInvariance.unchangedStyles) {
    sc.assert(
      afterNameHashes[style] === seedSet.styles[style],
      `${label}: name leaves ${style} background unchanged (Q-001 invariance)`,
      { expected: seedSet.styles[style], actual: afterNameHashes[style] },
    )
  }
  for (const style of golden.nameInvariance.changedStyles) {
    sc.assert(
      afterNameHashes[style] === nameSet.styles[style] &&
        afterNameHashes[style] !== seedSet.styles[style],
      `${label}: name changes ${style} glyph as expected`,
      { expected: nameSet.styles[style], actual: afterNameHashes[style] },
    )
  }
  return { baseRaw: baseRaw.raw, seedHashes: seedWait.hashes, nameHashes: afterNameHashes }
}

async function basicGridChecks(sc, page, golden, label, marker = 'data-live') {
  sc.case(`${label}: initial eight avatars`)
  const converted = imagesToRaw(await pageImages(page, marker), label)
  sc.assert(converted.errors.length === 0, `${label}: eight data URLs decode`, { errors: converted.errors })
  sc.assert(Object.keys(converted.raw).length === 8, `${label}: eight avatars present`, {
    count: Object.keys(converted.raw).length,
  })
  const hashes = hashRawMap(converted.raw)
  const comparison = compareHashes(golden.sets.base.styles, hashes, `${label}-base`)
  sc.assert(comparison.issues.length === 0, `${label}: all eight raw hashes match frozen base`, {
    issues: comparison.issues,
  })
  return converted.raw
}

async function runPhasePrepare() {
  const record = { phase: 'prepare', assertions: 0, failures: [], commands: [], artifacts: {} }
  const assert = (condition, label, detail = {}) => {
    record.assertions += 1
    if (!condition) record.failures.push({ label, detail })
    return Boolean(condition)
  }
  const expected = await readJson(expectedPath)
  const golden = await readJson(goldenPath)
  record.expectedSha256 = await sha256File(expectedPath)
  record.goldenSha256 = await sha256File(goldenPath)
  const tarballSha = await sha256File(tarballPath)
  record.tarballSha256 = tarballSha
  record.tarballBytes = (await fsp.stat(tarballPath)).size
  record.expected = expected
  record.golden = golden

  if (expectedShaArg) assert(record.expectedSha256 === expectedShaArg, 'expected-results SHA matches pre-run value', {
    expected: expectedShaArg,
    actual: record.expectedSha256,
  })
  if (goldenShaArg) assert(record.goldenSha256 === goldenShaArg, 'golden SHA matches pre-run value', {
    expected: goldenShaArg,
    actual: record.goldenSha256,
  })
  assert(tarballSha === expected.expectedTarball.sha256, 'tarball SHA equals frozen approved value', {
    expected: expected.expectedTarball.sha256,
    actual: tarballSha,
  })
  assert(record.tarballBytes === expected.expectedTarball.gzipBytes, 'tarball byte count equals frozen value', {
    expected: expected.expectedTarball.gzipBytes,
    actual: record.tarballBytes,
  })

  if (sourceManifestPath) {
    const manifest = await readJson(sourceManifestPath)
    record.sourceManifest = { commit: manifest.commit, sha256: manifest.sha256, fileCount: manifest.fileCount }
    assert(manifest.commit === commitArg, 'source manifest commit matches orchestration commit', {
      expected: commitArg,
      actual: manifest.commit,
    })
    record.sourceFileCount = manifest.fileCount
  }

  await fsp.rm(appsDir, { recursive: true, force: true })
  await fsp.rm(toolsDir, { recursive: true, force: true })
  await fsp.rm(extractedPackageDir, { recursive: true, force: true })
  await fsp.mkdir(extractedPackageDir, { recursive: true })
  await fsp.rm(controlsDir, { recursive: true, force: true })
  await fsp.mkdir(appsDir, { recursive: true })
  await fsp.cp(path.join(fixturesArg, 'apps'), appsDir, { recursive: true })
  await fsp.cp(path.join(fixturesArg, 'tools'), toolsDir, { recursive: true })
  await fsp.cp(path.join(fixturesArg, 'controls'), controlsDir, { recursive: true })

  for (const app of appNames) {
    await fsp.copyFile(tarballPath, path.join(appsDir, app, 'dither-face-0.1.0.tgz'))
  }

  const extract = await runCommand({
    label: 'prepare-extract-tarball',
    command: `tar -xzf ${shellQuote(tarballPath)} -C ${shellQuote(extractedPackageDir)} --strip-components=1`,
    cwd: workDir,
  })
  record.commands.push(extract)
  assert(extract.exitCode === 0, 'tarball extracts for entry-hash comparison', { exitCode: extract.exitCode })

  const toolsCi = await runCommand({
    label: 'prepare-tools-npm-ci',
    command: 'npm ci --no-audit --no-fund',
    cwd: toolsDir,
  })
  record.commands.push(toolsCi)
  assert(toolsCi.exitCode === 0, 'tools npm ci succeeds', { exitCode: toolsCi.exitCode })

  const browserInstall = await runCommand({
    label: 'prepare-playwright-browsers',
    command: './node_modules/.bin/playwright install --with-deps chromium firefox',
    cwd: toolsDir,
    env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    timeoutMs: 600_000,
  })
  record.commands.push(browserInstall)
  assert(browserInstall.exitCode === 0, 'Chromium and Firefox installed with system dependencies', {
    exitCode: browserInstall.exitCode,
    stderr: browserInstall.stderr.slice(-3000),
  })

  const packageHashes = {
    'package.json': await sha256File(path.join(extractedPackageDir, 'package.json')),
    'dist/index.js': await sha256File(path.join(extractedPackageDir, 'dist/index.js')),
    'dist/dither-face.js': await sha256File(path.join(extractedPackageDir, 'dist/dither-face.js')),
  }
  record.packageHashes = packageHashes

  await writeJson(path.join(outDir, 'prepare.json'), record)
  if (record.failures.length) throw new Error(`prepare phase failed: ${JSON.stringify(record.failures)}`)
  return record
}

async function runPhaseInstall() {
  const record = { phase: 'install', assertions: 0, failures: [], commands: [], apps: {}, locks: {} }
  const assert = (condition, label, detail = {}) => {
    record.assertions += 1
    if (!condition) record.failures.push({ label, detail })
    return Boolean(condition)
  }
  const expected = await readJson(expectedPath)
  const extractedCount = fs.existsSync(extractedPackageDir)
  assert(extractedCount, 'extracted tarball tree exists from prepare')

  for (const app of appNames) {
    const appDir = path.join(appsDir, app)
    const lockPath = path.join(appDir, 'package-lock.json')
    const lockBefore = await sha256File(lockPath)
    record.locks[`apps/${app}/package-lock.json`] = { before: lockBefore }
    const expectedLock = expected.fixedArtifacts.locks[`apps/${app}/package-lock.json`]
    assert(lockBefore === expectedLock, `${app}: committed lock hash matches expected-before-run`, {
      expected: expectedLock,
      actual: lockBefore,
    })
    assert(fs.existsSync(path.join(appDir, 'dither-face-0.1.0.tgz')), `${app}: approved tarball staged beside fixture`)

    const ci = await runCommand({
      label: `install-${app}-npm-ci`,
      command: 'npm ci --no-audit --no-fund',
      cwd: appDir,
    })
    record.commands.push(ci)
    assert(ci.exitCode === 0, `${app}: npm ci succeeds`, { exitCode: ci.exitCode, stderr: ci.stderr.slice(-3000) })

    const lockAfter = await sha256File(lockPath)
    record.locks[`apps/${app}/package-lock.json`].after = lockAfter
    assert(lockAfter === lockBefore, `${app}: npm ci leaves lockfile byte-identical`, {
      before: lockBefore,
      after: lockAfter,
    })

    const ls = await runCommand({ label: `install-${app}-npm-ls`, command: 'npm ls dither-face --json', cwd: appDir })
    record.commands.push(ls)
    assert(ls.exitCode === 0, `${app}: npm ls resolves dither-face`, { exitCode: ls.exitCode })
    let parsed = null
    try {
      parsed = JSON.parse(ls.stdout)
    } catch {
      parsed = null
    }
    const dependency = parsed?.dependencies?.['dither-face']
    assert(Boolean(dependency), `${app}: dependency tree contains dither-face`)

    const installedRoot = path.join(appDir, 'node_modules/dither-face')
    const stat = fs.existsSync(installedRoot) ? await fsp.lstat(installedRoot) : null
    assert(Boolean(stat?.isDirectory()) && !stat?.isSymbolicLink(), `${app}: installed package is a real directory`, {
      installedRoot,
      isSymlink: stat?.isSymbolicLink() ?? null,
    })
    const realRoot = stat ? await fsp.realpath(installedRoot) : null
    assert(Boolean(realRoot?.startsWith(`${appDir}${path.sep}`)), `${app}: package real path is inside the disposable app`, {
      realRoot,
    })
    assert(!String(realRoot ?? '').includes('/repo/'), `${app}: package real path is never the repository`)

    const installedHashes = {
      'package.json': await sha256File(path.join(installedRoot, 'package.json')),
      'dist/index.js': await sha256File(path.join(installedRoot, 'dist/index.js')),
      'dist/dither-face.js': await sha256File(path.join(installedRoot, 'dist/dither-face.js')),
    }
    const expectedHashes = {
      'package.json': await sha256File(path.join(extractedPackageDir, 'package.json')),
      'dist/index.js': await sha256File(path.join(extractedPackageDir, 'dist/index.js')),
      'dist/dither-face.js': await sha256File(path.join(extractedPackageDir, 'dist/dither-face.js')),
    }
    for (const key of Object.keys(expectedHashes)) {
      assert(installedHashes[key] === expectedHashes[key], `${app}: installed ${key} matches tarball bytes`, {
        expected: expectedHashes[key],
        actual: installedHashes[key],
      })
    }
    record.apps[app] = {
      lockBefore,
      lockAfter,
      resolved: dependency?.resolved ?? null,
      installedRoot,
      realRoot,
      version: JSON.parse(await fsp.readFile(path.join(installedRoot, 'package.json'), 'utf8')).version,
      installedHashes,
      expectedHashes,
    }

    if (app === 'plain' || app === 'webworker') {
      const source = path.join(installedRoot, 'dist/dither-face.js')
      await fsp.copyFile(source, path.join(appDir, 'dither-face.js'))
      assert(
        (await sha256File(path.join(appDir, 'dither-face.js'))) === expectedHashes['dist/dither-face.js'],
        `${app}: classic IIFE copied from installed package`,
      )
    }
  }

  await writeJson(path.join(outDir, 'install.json'), record)
  if (record.failures.length) throw new Error(`install phase failed: ${JSON.stringify(record.failures)}`)
  return record
}

async function scanBundle(file, marker, forbidden = []) {
  const text = await fsp.readFile(file, 'utf8')
  return {
    file,
    bytes: Buffer.byteLength(text),
    containsPackageMarker: text.includes(marker),
    forbiddenHits: forbidden.filter((value) => text.includes(value)),
  }
}

async function listFiles(root, filter) {
  const found = []
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (filter(full)) found.push(full)
    }
  }
  if (fs.existsSync(root)) await walk(root)
  return found.sort()
}

async function runPhaseBuild() {
  const record = { phase: 'build', assertions: 0, failures: [], commands: [], builds: {}, bundles: {} }
  const assert = (condition, label, detail = {}) => {
    record.assertions += 1
    if (!condition) record.failures.push({ label, detail })
    return Boolean(condition)
  }
  const marker = 'ditherFace: unknown style'
  const forbidden = ['/blaxel/s5/', `${repo}/`, 'tests/qualification/s5/apps']

  const nextTelemetry = await runCommand({
    label: 'build-next-telemetry-disable',
    command: './node_modules/.bin/next telemetry disable',
    cwd: path.join(appsDir, 'next'),
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  })
  record.commands.push(nextTelemetry)
  assert(nextTelemetry.exitCode === 0, 'Next telemetry disabled without network dependency', {
    exitCode: nextTelemetry.exitCode,
  })

  const nextBuild = await runCommand({
    label: 'build-next-production',
    command: 'npm run build',
    cwd: path.join(appsDir, 'next'),
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  })
  record.commands.push(nextBuild)
  assert(nextBuild.exitCode === 0, 'Next production build succeeds', { exitCode: nextBuild.exitCode })
  const nextBuildId = path.join(appsDir, 'next/.next/BUILD_ID')
  assert(fs.existsSync(nextBuildId), 'Next build emits BUILD_ID')
  record.builds.next = {
    exitCode: nextBuild.exitCode,
    buildId: fs.existsSync(nextBuildId) ? (await fsp.readFile(nextBuildId, 'utf8')).trim() : null,
    durationMs: nextBuild.durationMs,
  }
  const nextChunks = await listFiles(path.join(appsDir, 'next/.next/static/chunks'), (file) => file.endsWith('.js'))
  const nextScans = []
  for (const file of nextChunks) nextScans.push(await scanBundle(file, marker, forbidden))
  record.bundles.next = {
    chunks: nextScans.length,
    packageMarkerChunks: nextScans.filter((scan) => scan.containsPackageMarker).length,
    forbiddenHits: nextScans.flatMap((scan) => scan.forbiddenHits),
  }
  assert(nextScans.some((scan) => scan.containsPackageMarker), 'Next client bundle includes installed dither-face code')
  assert(record.bundles.next.forbiddenHits.length === 0, 'Next client bundle has no repository/qualification source path')

  for (const app of ['vue', 'svelte']) {
    const build = await runCommand({
      label: `build-${app}-production`,
      command: 'npm run build',
      cwd: path.join(appsDir, app),
    })
    record.commands.push(build)
    assert(build.exitCode === 0, `${app} production build succeeds`, { exitCode: build.exitCode })
    const assets = await listFiles(path.join(appsDir, app, 'dist/assets'), (file) => file.endsWith('.js'))
    const scans = []
    for (const file of assets) scans.push(await scanBundle(file, marker, forbidden))
    record.builds[app] = { exitCode: build.exitCode, assets: assets.length, durationMs: build.durationMs }
    record.bundles[app] = {
      assets: scans.length,
      packageMarkerAssets: scans.filter((scan) => scan.containsPackageMarker).length,
      forbiddenHits: scans.flatMap((scan) => scan.forbiddenHits),
    }
    assert(scans.some((scan) => scan.containsPackageMarker), `${app} browser bundle includes installed dither-face code`)
    assert(record.bundles[app].forbiddenHits.length === 0, `${app} browser bundle has no repository/source path`)
  }

  const workerDryRun = await runCommand({
    label: 'build-worker-wrangler-dry-run',
    command: 'npx wrangler deploy --dry-run --outdir dist',
    cwd: path.join(appsDir, 'worker'),
    timeoutMs: 600_000,
  })
  record.commands.push(workerDryRun)
  assert(workerDryRun.exitCode === 0, 'wrangler dry-run bundle succeeds without deployment', {
    exitCode: workerDryRun.exitCode,
  })
  const workerBundle = path.join(appsDir, 'worker/dist/index.js')
  assert(fs.existsSync(workerBundle), 'wrangler dry-run emits bundle')
  if (fs.existsSync(workerBundle)) {
    const scan = await scanBundle(workerBundle, marker, forbidden)
    record.bundles.worker = {
      bytes: scan.bytes,
      containsPackageMarker: scan.containsPackageMarker,
      forbiddenHits: scan.forbiddenHits,
      hasNodeImport: /(?:from|require\()\s*["']node:/.test(await fsp.readFile(workerBundle, 'utf8')),
    }
    assert(scan.containsPackageMarker, 'workerd bundle includes installed dither-face code')
    assert(record.bundles.worker.forbiddenHits.length === 0, 'workerd bundle has no repository/source path')
    assert(record.bundles.worker.hasNodeImport === false, 'workerd bundle has no node: import')
  }
  record.builds.worker = { exitCode: workerDryRun.exitCode, dryRun: true }

  await writeJson(path.join(outDir, 'build.json'), record)
  if (record.failures.length) throw new Error(`build phase failed: ${JSON.stringify(record.failures)}`)
  return record
}

async function runPhaseTest() {
  const expected = await readJson(expectedPath)
  const golden = await readJson(goldenPath)
  const prepare = await readJson(path.join(outDir, 'prepare.json'))
  const install = await readJson(path.join(outDir, 'install.json'))
  const build = await readJson(path.join(outDir, 'build.json'))
  const tests = {
    startedAt: new Date().toISOString(),
    expectedSha256: await sha256File(expectedPath),
    goldenSha256: await sha256File(goldenPath),
    tarballSha256: await sha256File(tarballPath),
    checks: {},
  }
  if (expectedShaArg) {
    tests.checks.expectedShaMatches = tests.expectedSha256 === expectedShaArg
  }
  tests.checks.goldenShaMatches = tests.goldenSha256 === expected.fixedArtifacts.golden.sha256AtCreation
  tests.checks.tarballMatches = tests.tarballSha256 === expected.expectedTarball.sha256
  if (!Object.values(tests.checks).every(Boolean)) {
    throw new Error(`pre-test fixed-artifact check failed: ${JSON.stringify(tests.checks)}`)
  }

  const nodePackageEntry = path.join(appsDir, 'plain/node_modules/dither-face/dist/index.js')
  const nodePackage = await import(pathToFileURL(nodePackageEntry).href)
  const nodeRaw = Object.fromEntries(
    Object.keys(golden.sets.base.styles).map((style) => [
      style,
      nodePackage.ditherFace(golden.sets.base.seed, {
        style,
        name: golden.sets.base.name,
        px: golden.sets.base.px,
      }),
    ]),
  )
  tests.nodeDiagnostic = hashRawMap(nodeRaw)

  const playwright = await loadPlaywright()
  const chromium = await playwright.chromium.launch({ headless: true })
  const firefox = await playwright.firefox.launch({ headless: true })
  tests.browserVersions = {
    chromium: chromium.version(),
    firefox: firefox.version(),
    playwright: '1.64.1',
  }

  const scenarios = []
  const parityHosts = []
  const artifacts = { screenshots: [], html: [], controls: [] }

  const nextUrl = 'http://127.0.0.1:3100/'
  let nextServer = null
  const s501 = new Scenario('S5-01', expected.expectations['S5-01'].title)
  const s502 = new Scenario('S5-02', expected.expectations['S5-02'].title)
  let nextReady = false
  try {
    try {
      nextServer = startProcess({
        label: 'server-next-production',
        command: 'npm run start -- --hostname 127.0.0.1 --port 3100',
        cwd: path.join(appsDir, 'next'),
        env: { NEXT_TELEMETRY_DISABLED: '1' },
      })
      await waitForHttp(nextUrl, {
        timeoutMs: 90000,
        expect: (response) => response.ok && (response.headers.get('content-type') ?? '').includes('text/html'),
      })
      nextReady = true
    } catch (error) {
      s501.error(error)
      s502.error(error)
    }

    if (nextReady) {
      try {
        s501.case('production server HTTP response')
        s501.assert(true, 'Next production server responded with HTML')

        const response = await fetch(nextUrl, { signal: AbortSignal.timeout(30000) })
        s501.assert(response.status === 200, 'Next SSR HTTP status is 200', { status: response.status })
        s501.assert(
          (response.headers.get('content-type') ?? '').includes('text/html'),
          'Next SSR content type is HTML',
          { contentType: response.headers.get('content-type') },
        )
        const html = await response.text()
        await fsp.mkdir(artifactsDir, { recursive: true })
        const htmlPath = path.join(artifactsDir, 'next-ssr.html')
        await fsp.writeFile(htmlPath, html)
        artifacts.html.push({ path: rel(htmlPath), sha256: sha256(html), bytes: Buffer.byteLength(html) })
        s501.assert(html.includes('data-ssr="next"'), 'Next SSR marker is present')
        s501.assert(!/Application error|__next_error__|next-error/i.test(html), 'Next response is not an error page')

        s501.case('all eight server-rendered avatars')
        const images = extractImages(html, 'data-initial')
        const converted = imagesToRaw(images, 'next-ssr')
        s501.assert(images.length === 8, 'Next SSR HTML contains eight initial avatar images', { count: images.length })
        s501.assert(converted.errors.length === 0, 'Next SSR data URLs decode', { errors: converted.errors })
        const hashes = hashRawMap(converted.raw)
        const comparison = compareHashes(golden.sets.base.styles, hashes, 'next-ssr')
        s501.assert(comparison.issues.length === 0, 'Next SSR all eight raw hashes match frozen base', {
          issues: comparison.issues,
        })
        if (comparison.issues.length === 0) parityHosts.push({ host: 'next-ssr', raw: converted.raw })
      } catch (error) {
        s501.error(error)
      }

      try {
        // S5-02 uses a fresh HTTP response as the no-JS SSR record.
        s502.case('no-JS server record')
        const ssrResponse = await fetch(nextUrl, { signal: AbortSignal.timeout(30000) })
        const ssrHtml = await ssrResponse.text()
        const ssrConverted = imagesToRaw(extractImages(ssrHtml, 'data-initial'), 'next-nojs-http')
        s502.assert(ssrConverted.errors.length === 0, 'no-JS HTTP SSR data URLs decode', { errors: ssrConverted.errors })
        s502.assert(
          compareHashes(golden.sets.base.styles, hashRawMap(ssrConverted.raw), 'next-nojs').issues.length === 0,
          'no-JS HTTP SSR hashes match frozen base',
        )

        const noJs = await openPage(chromium, { javaScriptEnabled: false })
        try {
          await noJs.page.goto(nextUrl, { waitUntil: 'load', timeout: 60000 })
          const noJsImages = await pageImages(noJs.page, 'data-initial')
          s502.assert(noJsImages.length === 8, 'no-JS browser page contains eight avatars', { count: noJsImages.length })
          s502.assert((await noJs.page.inputValue('#seed')) === golden.sets.base.seed, 'no-JS seed control visible and populated')
          artifacts.screenshots.push(await takeScreenshot(noJs.page, 's5-02-next-nojs'))
        } finally {
          await noJs.context.close()
        }

        const hydrated = await openPage(chromium)
        try {
          await hydrated.page.goto(nextUrl, { waitUntil: 'networkidle', timeout: 60000 })
          await waitForHydrated(hydrated.page)
          s502.case('JavaScript hydration')
          s502.assert(true, 'Next page reached hydrated state')
          const clientImages = await pageImages(hydrated.page, 'data-initial')
          const clientConverted = imagesToRaw(clientImages, 'next-hydrated')
          s502.assert(clientConverted.errors.length === 0, 'hydrated initial data URLs decode', {
            errors: clientConverted.errors,
          })
          const hydrationCompare = compareRawMaps(ssrConverted.raw, clientConverted.raw, 'next-hydration', nodeRaw)
          s502.assert(hydrationCompare.issues.length === 0, 'hydrated initial bytes equal no-JS SSR bytes', {
            issues: hydrationCompare.issues,
          })
          s502.assert(
            compareHashes(golden.sets.base.styles, hashRawMap(clientConverted.raw), 'next-hydrated').issues.length === 0,
            'hydrated initial hashes match frozen base',
          )
          if (hydrationCompare.issues.length === 0) parityHosts.push({ host: 'next-hydrated', raw: clientConverted.raw })

          const controls = await controlUpdateChecks(s502, hydrated.page, golden, 'next')
          artifacts.screenshots.push(await takeScreenshot(hydrated.page, 's5-02-next-hydrated'))
          s502.case('console and page errors')
          s502.assert(hydrated.events.consoleErrors.length === 0, 'Next hydration has no console errors', {
            errors: hydrated.events.consoleErrors,
          })
          s502.assert(hydrated.events.pageErrors.length === 0, 'Next hydration has no page errors', {
            errors: hydrated.events.pageErrors,
          })
          s502.assert(externalRequests(hydrated.events).length === 0, 'Next page makes no external requests', {
            requests: externalRequests(hydrated.events),
          })
          s502.assert(hydrated.events.badResponses.length === 0, 'Next page has no HTTP error responses', {
            responses: hydrated.events.badResponses,
          })
          await saveConsole('S5-02', hydrated.events)
          artifacts.controls.push({ next: Object.keys(controls.baseRaw).length })
        } finally {
          await hydrated.context.close()
        }
      } catch (error) {
        s502.error(error)
      }
    }
  } finally {
    await stopProcess(nextServer)
    scenarios.push(s501.finish(), s502.finish())
  }

  // Vue and Svelte: dev and production, Chromium primary; Firefox alternative
  // for Vue production only (explicit budget limit recorded in the report).
  async function frameworkScenario(id, app) {
    const sc = new Scenario(id, expected.expectations[id].title)
    const ports = app === 'vue' ? { dev: 5173, prod: 4173 } : { dev: 5174, prod: 4174 }
    const hosts = []
    try {
      for (const mode of ['dev', 'prod']) {
        const port = ports[mode]
        const label = `${app}-${mode}`
        const command =
          mode === 'dev'
            ? `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`
            : `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`
        let server = null
        try {
          server = startProcess({ label: `server-${label}`, command, cwd: path.join(appsDir, app) })
          const url = `http://127.0.0.1:${port}/`
          await waitForHttp(url, { timeoutMs: 90000 })
          const opened = await openPage(chromium)
          try {
            await opened.page.goto(url, { waitUntil: 'load', timeout: 60000 })
            await opened.page.waitForSelector('#live-grid img', { timeout: 30000 })
            sc.case(`${mode} initial render`)
            const liveRaw = await basicGridChecks(sc, opened.page, golden, `${label}-live`, 'data-live')
            const initialRaw = await basicGridChecks(sc, opened.page, golden, `${label}-initial`, 'data-initial')
            if (mode === 'prod') {
              hosts.push({ host: `${app}-prod`, raw: liveRaw })
            } else {
              hosts.push({ host: `${app}-dev`, raw: liveRaw })
            }
            const controls = await controlUpdateChecks(sc, opened.page, golden, `${label}`)
            void initialRaw
            void controls
            artifacts.screenshots.push(await takeScreenshot(opened.page, `s5-${id.slice(-2)}-${label}-chromium`))
            sc.case(`${mode} console and page errors`)
            sc.assert(opened.events.consoleErrors.length === 0, `${label}: no console errors`, {
              errors: opened.events.consoleErrors,
            })
            sc.assert(opened.events.pageErrors.length === 0, `${label}: no page errors`, {
              errors: opened.events.pageErrors,
            })
            sc.assert(externalRequests(opened.events).length === 0, `${label}: no external requests`, {
              requests: externalRequests(opened.events),
            })
            sc.assert(opened.events.badResponses.length === 0, `${label}: no HTTP error responses`, {
              responses: opened.events.badResponses,
            })
            await saveConsole(`${id}-${mode}`, opened.events)
          } finally {
            await opened.context.close()
          }
        } catch (error) {
          sc.error(error)
        } finally {
          await stopProcess(server)
        }
      }

      if (app === 'vue') {
        const port = ports.prod
        let server = null
        try {
          server = startProcess({
            label: 'server-vue-prod-firefox',
            command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
            cwd: path.join(appsDir, 'vue'),
          })
          const url = `http://127.0.0.1:${port}/`
          await waitForHttp(url, { timeoutMs: 90000 })
          const opened = await openPage(firefox)
          try {
            await opened.page.goto(url, { waitUntil: 'load', timeout: 60000 })
            await opened.page.waitForSelector('#live-grid img', { timeout: 30000 })
            sc.case('Firefox production initial and update')
            const raw = await basicGridChecks(sc, opened.page, golden, 'vue-prod-firefox', 'data-live')
            void raw
            await controlUpdateChecks(sc, opened.page, golden, 'vue-prod-firefox')
            artifacts.screenshots.push(await takeScreenshot(opened.page, 's5-03-vue-prod-firefox'))
            sc.assert(opened.events.consoleErrors.length === 0, 'vue production Firefox: no console errors', {
              errors: opened.events.consoleErrors,
            })
            sc.assert(opened.events.pageErrors.length === 0, 'vue production Firefox: no page errors', {
              errors: opened.events.pageErrors,
            })
            await saveConsole('S5-03-firefox', opened.events)
          } finally {
            await opened.context.close()
          }
        } catch (error) {
          sc.error(error)
        } finally {
          await stopProcess(server)
        }
      }
    } catch (error) {
      sc.error(error)
    }
    for (const host of hosts) parityHosts.push(host)
    return sc.finish()
  }

  scenarios.push(await frameworkScenario('S5-03', 'vue'))
  scenarios.push(await frameworkScenario('S5-04', 'svelte'))

  // S5-05: workerd HTTP + browser Web Worker.
  const s505 = new Scenario('S5-05', expected.expectations['S5-05'].title)
  let workerServer = null
  let staticServer = null
  try {
    workerServer = startProcess({
      label: 'server-worker-wrangler',
      command: 'npx wrangler dev --port 8787 --ip 127.0.0.1 --local',
      cwd: path.join(appsDir, 'worker'),
      env: { CI: '1', WRANGLER_SEND_METRICS: 'false' },
    })
    await waitForHttp('http://127.0.0.1:8787/health', { timeoutMs: 120000 })
    const healthResponse = await fetch('http://127.0.0.1:8787/health', { signal: AbortSignal.timeout(15000) })
    const health = await healthResponse.json()
    s505.case('workerd health and globals')
    s505.assert(healthResponse.status === 200, 'workerd health returns 200', { status: healthResponse.status })
    s505.assert(health.ok === true && health.runtime === 'workerd', 'workerd runtime reports itself', { health })
    s505.assert(health.hasProcess === false, 'workerd runtime has no process global', { health })
    s505.assert(health.hasDocument === false, 'workerd runtime has no document global', { health })

    s505.case('workerd all eight SVG responses')
    const workerRaw = {}
    for (const style of Object.keys(golden.sets.base.styles)) {
      const url = `http://127.0.0.1:8787/avatar?style=${encodeURIComponent(style)}&seed=${encodeURIComponent(
        golden.sets.base.seed,
      )}&name=${encodeURIComponent(golden.sets.base.name)}&px=80`
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      const body = await response.text()
      s505.assert(response.status === 200, `workerd ${style}: status 200`, { status: response.status })
      s505.assert(
        (response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/svg+xml'),
        `workerd ${style}: image/svg+xml content type`,
        { contentType: response.headers.get('content-type') },
      )
      s505.assert(response.headers.get('x-runtime') === 'workerd', `workerd ${style}: runtime header`, {
        runtime: response.headers.get('x-runtime'),
      })
      s505.assert(response.headers.get('x-runtime-node') === 'undefined', `workerd ${style}: no Node process`, {
        value: response.headers.get('x-runtime-node'),
      })
      s505.assert(response.headers.get('x-runtime-document') === 'undefined', `workerd ${style}: no DOM document`, {
        value: response.headers.get('x-runtime-document'),
      })
      if (response.status === 200 && body.length > 0) workerRaw[style] = body
    }
    s505.assert(Object.keys(workerRaw).length === 8, 'workerd produced eight SVG bodies', {
      count: Object.keys(workerRaw).length,
    })
    s505.assert(
      compareHashes(golden.sets.base.styles, hashRawMap(workerRaw), 'workerd').issues.length === 0,
      'workerd raw SVG hashes match frozen base',
    )
    if (Object.keys(workerRaw).length === 8) parityHosts.push({ host: 'workerd', raw: workerRaw })
    const workerArtifact = path.join(artifactsDir, 'workerd-avatar.svg')
    if (workerRaw['pixel-sprite']) await fsp.writeFile(workerArtifact, workerRaw['pixel-sprite'])
    artifacts.html.push({ path: rel(workerArtifact), sha256: sha256(workerRaw['pixel-sprite'] ?? '') })

    staticServer = startProcess({
      label: 'server-webworker-static',
      command: `node ${shellQuote(path.join(toolsDir, 'static-server.mjs'))} --root ${shellQuote(
        path.join(appsDir, 'webworker'),
      )} --port 8090`,
      cwd: workDir,
    })
    const webWorkerUrl = 'http://127.0.0.1:8090/'
    await waitForHttp(webWorkerUrl, { timeoutMs: 60000 })
    const opened = await openPage(chromium)
    try {
      await opened.page.goto(webWorkerUrl, { waitUntil: 'load', timeout: 60000 })
      await opened.page.waitForSelector('html[data-worker-ready="true"]', { timeout: 30000 })
      s505.case('browser Web Worker generation')
      const results = await opened.page.evaluate(() => window.__workerResults ?? [])
      const errors = await opened.page.evaluate(() => window.__workerErrors ?? [])
      s505.assert(results.length === 8, 'browser Worker posted eight results', { count: results.length })
      s505.assert(errors.length === 0, 'browser Worker reported no errors', { errors })
      const webWorkerRaw = Object.fromEntries(results.map((entry) => [entry.style, entry.svg]))
      s505.assert(
        compareHashes(golden.sets.base.styles, hashRawMap(webWorkerRaw), 'webworker').issues.length === 0,
        'browser Worker raw SVG hashes match frozen base',
      )
      if (Object.keys(webWorkerRaw).length === 8) parityHosts.push({ host: 'webworker', raw: webWorkerRaw })
      s505.assert(externalRequests(opened.events).length === 0, 'browser Worker page makes no external requests', {
        requests: externalRequests(opened.events),
      })
      s505.assert(opened.events.consoleErrors.length === 0, 'browser Worker page has no console errors', {
        errors: opened.events.consoleErrors,
      })
      s505.assert(opened.events.pageErrors.length === 0, 'browser Worker page has no page errors', {
        errors: opened.events.pageErrors,
      })
      artifacts.screenshots.push(await takeScreenshot(opened.page, 's5-05-webworker'))
      await saveConsole('S5-05-webworker', opened.events)
    } finally {
      await opened.context.close()
    }
    s505.case('no deployment')
    s505.assert(workerServer.exit === null, 'local workerd remains a local dev process, not a deployment')
  } catch (error) {
    s505.error(error)
  } finally {
    await stopProcess(workerServer)
    await stopProcess(staticServer)
    scenarios.push(s505.finish())
  }

  // S5-06: plain HTML, file://, browser offline.
  const s506 = new Scenario('S5-06', expected.expectations['S5-06'].title)
  let plainIifeHash = null
  try {
    const plainDir = path.join(appsDir, 'plain')
    const iifePath = path.join(plainDir, 'dither-face.js')
    s506.case('installed IIFE provenance')
    s506.assert(fs.existsSync(iifePath), 'plain app has classic IIFE copied from installed package')
    plainIifeHash = await sha256File(iifePath)
    s506.assert(
      plainIifeHash === install.apps.plain.installedHashes['dist/dither-face.js'],
      'plain IIFE hash equals installed package dist/dither-face.js',
      { expected: install.apps.plain.installedHashes['dist/dither-face.js'], actual: plainIifeHash },
    )
    const fileUrl = pathToFileURL(path.join(plainDir, 'index.html')).href

    for (const [engineName, engine] of [
      ['chromium', chromium],
      ['firefox', firefox],
    ]) {
      const opened = await openPage(engine)
      try {
        await opened.context.setOffline(true)
        await opened.page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 })
        await opened.page.waitForSelector('html[data-ready="true"]', { timeout: 30000 })
        s506.case(`${engineName} offline file:// render`)
        const raw = await basicGridChecks(s506, opened.page, golden, `plain-${engineName}`, 'data-plain')
        if (engineName === 'chromium') parityHosts.push({ host: 'plain', raw })
        const fontResources = await opened.page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => /font|\.woff|\.ttf|\.otf/i.test(name)),
        )
        const httpRequests = opened.events.requests.filter((request) => /^https?:/i.test(request.url))
        s506.assert(httpRequests.length === 0, `${engineName}: no HTTP(S) requests in offline file:// page`, {
          requests: httpRequests,
        })
        s506.assert(opened.events.requestFailures.length === 0, `${engineName}: no failed requests`, {
          failures: opened.events.requestFailures,
        })
        s506.assert(fontResources.length === 0, `${engineName}: no remote font resource entries`, { fontResources })
        const globals = await opened.page.evaluate(() => ({
          hasDitherFace: typeof window.DitherFace === 'object' && window.DitherFace !== null,
          hasRender: typeof window.DitherFace?.ditherFace === 'function',
          fontStatus: document.fonts?.status ?? null,
          fontCount: document.fonts?.size ?? null,
        }))
        s506.assert(globals.hasDitherFace && globals.hasRender, `${engineName}: classic global exposes ditherFace`, {
          globals,
        })
        artifacts.screenshots.push(await takeScreenshot(opened.page, `s5-06-plain-${engineName}`))
        await saveConsole(`S5-06-${engineName}`, opened.events)
      } catch (error) {
        s506.error(error)
      } finally {
        await opened.context.close()
      }
    }
  } catch (error) {
    s506.error(error)
  }
  scenarios.push(s506.finish())

  // S5-07: strict raw parity across all framework hosts. No normalization.
  const s507 = new Scenario('S5-07', expected.expectations['S5-07'].title)
  try {
    s507.case('72 decoded raw SVG comparisons')
    const expectedHosts = ['next-ssr', 'next-hydrated', 'vue-dev', 'vue-prod', 'svelte-dev', 'svelte-prod', 'workerd', 'webworker', 'plain']
    s507.assert(parityHosts.length === 9, 'nine framework hosts contributed parity output', {
      hosts: parityHosts.map((host) => host.host),
    })
    for (const expectedHost of expectedHosts) {
      s507.assert(parityHosts.some((host) => host.host === expectedHost), `host present: ${expectedHost}`)
    }
    let comparisons = 0
    for (const host of parityHosts) {
      const comparison = compareRawMaps(nodeRaw, host.raw, host.host, nodeRaw)
      s507.assert(comparison.issues.length === 0, `${host.host}: decoded raw bytes match Node golden`, {
        issues: comparison.issues,
        normalizationApplied: false,
      })
      for (const style of Object.keys(golden.sets.base.styles)) {
        comparisons += 1
        s507.assert(
          sha256(host.raw[style] ?? '') === golden.sets.base.styles[style],
          `${host.host}: ${style} frozen hash`,
          { expected: golden.sets.base.styles[style], actual: sha256(host.raw[style] ?? '') },
        )
      }
    }
    s507.note(`raw comparisons evaluated: ${comparisons}; normalizationApplied=false`)
    s507.case('Q-001 exact fixture in every host')
    for (const host of parityHosts) {
      s507.assert(
        sha256(host.raw['ascii-letter'] ?? '') === golden.q001.sha256,
        `${host.host}: Q-001 ascii-letter exact hash`,
        { expected: golden.q001.sha256, actual: sha256(host.raw['ascii-letter'] ?? '') },
      )
    }
    s507.case('browser bundle provenance')
    s507.assert(build.bundles.next.packageMarkerChunks > 0, 'Next bundle provenance includes installed package')
    s507.assert(build.bundles.vue.packageMarkerAssets > 0, 'Vue bundle provenance includes installed package')
    s507.assert(build.bundles.svelte.packageMarkerAssets > 0, 'Svelte bundle provenance includes installed package')
    s507.assert(build.bundles.worker.containsPackageMarker === true, 'Worker bundle provenance includes installed package')
    s507.assert(
      install.apps.plain.installedHashes['dist/dither-face.js'] === plainIifeHash,
      'plain asset provenance from installed package',
      { installed: install.apps.plain.installedHashes['dist/dither-face.js'], asset: plainIifeHash },
    )
  } catch (error) {
    s507.error(error)
  }
  scenarios.push(s507.finish())

  // Negative controls. These use disposable fixtures and the same comparators
  // as the positive scenarios; none modifies product or accepted fixtures.
  const controls = []
  {
    const control = { name: 'S5-NC1 bad installed-package import', detected: false, evidence: {} }
    const bad = await runCommand({
      label: 'control-nc1-bad-import',
      command: `node --input-type=module -e ${shellQuote("import('dither-face/dist/does-not-exist.js')")}`,
      cwd: path.join(appsDir, 'plain'),
    })
    const good = await runCommand({
      label: 'control-nc1-good-import',
      command: `node --input-type=module -e ${shellQuote("import('dither-face').then((m) => { if (typeof m.ditherFace !== 'function') process.exit(2) })")}`,
      cwd: path.join(appsDir, 'plain'),
    })
    control.detected = bad.exitCode !== 0 && good.exitCode === 0
    control.evidence = { badExit: bad.exitCode, goodExit: good.exitCode, badStderr: bad.stderr.slice(-1200) }
    controls.push(control)
  }
  {
    const control = { name: 'S5-NC2 wrong SVG hash', detected: false, evidence: {} }
    const original = nodeRaw['pixel-sprite']
    const mutated = original.replace('<svg', '<svg ')
    const issue = compareHashes(
      { 'pixel-sprite': sha256(original) },
      { 'pixel-sprite': sha256(mutated) },
      'nc2',
    )
    control.detected = issue.issues.length === 1 && sha256(original) !== sha256(mutated)
    control.evidence = { originalSha: sha256(original), mutatedSha: sha256(mutated), issues: issue.issues }
    controls.push(control)
  }
  {
    const control = { name: 'S5-NC3 hydration mismatch', detected: false, evidence: {} }
    let server = null
    try {
      server = startProcess({
        label: 'server-control-hydration',
        command: `node ${shellQuote(path.join(toolsDir, 'static-server.mjs'))} --root ${shellQuote(
          path.join(controlsDir, 'hydration'),
        )} --port 8091`,
        cwd: workDir,
      })
      const url = 'http://127.0.0.1:8091/'
      await waitForHttp(url, { timeoutMs: 60000 })
      const noJs = await openPage(chromium, { javaScriptEnabled: false })
      let ssrSrc = null
      try {
        await noJs.page.goto(url, { waitUntil: 'load', timeout: 30000 })
        ssrSrc = await noJs.page.getAttribute('#target', 'src')
      } finally {
        await noJs.context.close()
      }
      const js = await openPage(chromium)
      let clientSrc = null
      try {
        await js.page.goto(url, { waitUntil: 'load', timeout: 30000 })
        await js.page.waitForSelector('html[data-hydration-mutated="true"]', { timeout: 10000 })
        clientSrc = await js.page.getAttribute('#target', 'src')
      } finally {
        await js.context.close()
      }
      const ssrDecoded = decodeDataUrl(ssrSrc)
      const clientDecoded = decodeDataUrl(clientSrc)
      const hydrationIssue =
        ssrDecoded.ok && clientDecoded.ok
          ? compareRawMaps({ target: ssrDecoded.svg }, { target: clientDecoded.svg }, 'nc3')
          : { issues: [{ issue: 'decode-failed' }] }
      control.detected = hydrationIssue.issues.length === 1
      control.evidence = { ssrSha: ssrDecoded.ok ? sha256(ssrDecoded.svg) : null, clientSha: clientDecoded.ok ? sha256(clientDecoded.svg) : null, issues: hydrationIssue.issues }
    } catch (error) {
      control.evidence = { error: error.message }
    } finally {
      await stopProcess(server)
    }
    controls.push(control)
  }
  await writeJson(path.join(outDir, 'negative-controls.json'), {
    controls,
    allDetected: controls.every((control) => control.detected),
  })
  await chromium.close()
  await firefox.close()

  const totals = scenarios.reduce(
    (accumulator, scenario) => ({
      cases: accumulator.cases + scenario.cases,
      assertions: accumulator.assertions + scenario.assertions,
      failures: accumulator.failures + scenario.failures,
    }),
    { cases: 0, assertions: 0, failures: 0 },
  )
  const environment = {
    sandbox: sandboxArg,
    image: imageArg,
    region: regionArg,
    memoryMB: memoryArg,
    cpu: 'platform default (no CPU override)',
    volumes: [],
    node: process.version,
    npm: (await runCommand({ label: 'environment-npm-version', command: 'npm --version', cwd: repo })).stdout.trim(),
    os: (await runCommand({ label: 'environment-os', command: 'uname -a; cat /etc/os-release; nproc; free -m', cwd: repo })).stdout,
    browsers: tests.browserVersions,
    frameworks: expected.versions.frameworks,
    playwright: '1.64.1',
    startedAt: tests.startedAt,
    completedAt: new Date().toISOString(),
  }
  await writeJson(path.join(outDir, 'environment.json'), environment)
  await writeJson(path.join(outDir, 'artifacts.json'), artifacts)

  const results = {
    stage: 'S5',
    disposition: 'PENDING parent review; agent-observed only',
    sandbox: sandboxArg,
    image: imageArg,
    region: regionArg,
    memoryMB: memoryArg,
    cpu: 'platform default (no CPU override)',
    volumes: [],
    commit: commitArg,
    sourceManifest: prepare.sourceManifest ?? null,
    tarball: {
      filename: 'dither-face-0.1.0.tgz',
      sha256: tests.tarballSha256,
      expectedSha256: expected.expectedTarball.sha256,
      bytes: prepare.tarballBytes,
    },
    expectedResultsSha256: tests.expectedSha256,
    goldenSha256: tests.goldenSha256,
    versions: environment,
    startedAt: tests.startedAt,
    completedAt: new Date().toISOString(),
    scenarios: Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario])),
    totals,
    negativeControls: controls,
    parity: {
      hosts: parityHosts.map((host) => host.host),
      normalizationApplied: false,
      comparisons: parityHosts.length * Object.keys(golden.sets.base.styles).length,
    },
    checks: {
      allSevenPass: scenarios.length === 7 && scenarios.every((scenario) => scenario.actualStatus === 'PASS'),
      zeroFailures: totals.failures === 0,
      tarballMatchesFrozen: tests.tarballSha256 === expected.expectedTarball.sha256,
      goldenMatchesFrozen: tests.goldenSha256 === expected.fixedArtifacts.golden.sha256AtCreation,
      allNegativeControlsDetected: controls.every((control) => control.detected),
      everyScenarioHasCases: scenarios.every((scenario) => scenario.cases > 0),
    },
  }
  await writeJson(path.join(outDir, 'results.json'), results)
  await writeJson(path.join(outDir, 'rawresults.json'), results)
  return results
}

async function main() {
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.mkdir(logsDir, { recursive: true })
  await fsp.mkdir(artifactsDir, { recursive: true })
  let record
  const started = Date.now()
  try {
    if (phase === 'prepare') record = await runPhasePrepare()
    else if (phase === 'install') record = await runPhaseInstall()
    else if (phase === 'build') record = await runPhaseBuild()
    else if (phase === 'test') record = await runPhaseTest()
    else throw new Error(`unknown phase: ${phase}`)
    const exit = { phase, exitCode: 0, durationMs: Date.now() - started, ok: true, completedAt: new Date().toISOString() }
    await writeJson(path.join(outDir, `phase-${phase}.json`), { record, exit })
    process.stdout.write(`S5 ${phase} OK ${Math.round((Date.now() - started) / 1000)}s\n`)
  } catch (error) {
    const exit = {
      phase,
      exitCode: 1,
      durationMs: Date.now() - started,
      ok: false,
      error: String(error?.stack ?? error),
      completedAt: new Date().toISOString(),
    }
    await writeJson(path.join(outDir, `phase-${phase}.json`), { record: record ?? null, exit })
    process.stderr.write(`S5 ${phase} FAIL ${error.message}\n`)
    process.exitCode = 1
  }
}

main()
