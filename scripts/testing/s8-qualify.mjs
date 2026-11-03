#!/usr/bin/env node
/**
 * Stage 8 in-sandbox qualification harness: accessibility and visuals.
 *
 * Runs only inside the dedicated disposable Blaxel sandbox. Local use is not
 * supported and is not evidence. Phases: prepare (pinned tools/browsers),
 * build (root npm ci + actual site build), test (Playwright + axe-core).
 *
 * The harness records observations; it does not approve the stage or release.
 * A completed run may contain a genuine FAIL or the known S8-09 BLOCKED status.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
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
const expectedPath = path.resolve(arg('expected'))
const toolsLock = path.resolve(arg('tools-lock'))
const sourceManifestPath = path.resolve(arg('source-manifest'))
const commit = arg('commit')
const sandbox = arg('sandbox')
const image = arg('image', 'blaxel/ts-app:latest')
const region = arg('region', 'us-pdx-1')
const memory = Number(arg('memory', '4096'))
const expectedSha = arg('expected-sha')
const toolsLockSha = arg('tools-lock-sha')
const sourceManifestSha = arg('source-manifest-sha')
const phase = arg('phase')
const activeBudgetSeconds = Number(arg('active-budget', '1800'))
const perCommandTimeoutSeconds = Number(arg('command-timeout', '600'))

if (!['prepare', 'build', 'test'].includes(phase)) throw new Error(`Unknown or missing --phase: ${phase}`)
if (!repo || !out || !work || !fixtures || !expectedPath || !toolsLock || !sourceManifestPath || !commit || !sandbox) {
  throw new Error('Missing required argument (repo/out/work/fixtures/expected/tools-lock/source-manifest/commit/sandbox)')
}

const toolsDir = path.join(fixtures, 'tools')
const siteDir = path.join(repo, 'dist-site')
const baseUrl = 'http://127.0.0.1:4173'
const startedAt = new Date().toISOString()
const phaseStarted = Date.now()
const steps = []
let phaseRecord = { phase, startedAt, args: { commit, sandbox, image, region, memory }, steps }

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
function checker() {
  let count = 0
  let failures = 0
  const notes = []
  return {
    ok(condition, message, data = null) {
      count += 1
      if (!condition) {
        failures += 1
        notes.push(`FAIL: ${message}${data === null ? '' : ` :: ${JSON.stringify(data).slice(0, 1200)}`}`)
      }
      return Boolean(condition)
    },
    eq(actual, expected, message) {
      return this.ok(Object.is(actual, expected), message, { actual, expected })
    },
    note(message) {
      notes.push(message)
      return true
    },
    counts() {
      return { assertions: count, failures }
    },
    notes() {
      return notes
    }
  }
}

async function runChild(label, command, commandArgs, options = {}) {
  const cwd = options.cwd ?? repo
  const timeout = options.timeout ?? perCommandTimeoutSeconds * 1000
  const started = Date.now()
  const logPath = path.join(out, 'logs', `${label}.log`)
  await fsp.mkdir(path.dirname(logPath), { recursive: true })
  const record = {
    label,
    command: [command, ...commandArgs].join(' '),
    cwd,
    timeoutMs: timeout,
    startedAt: new Date().toISOString()
  }
  log(`${label}: ${record.command}`)
  const result = await new Promise(resolve => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, timeout)
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
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
  record.stdoutTail = result.stdout.slice(-12000)
  record.stderrTail = result.stderr.slice(-12000)
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
    throw new Error(`${label} failed: exit=${result.code} signal=${result.signal} timedOut=${result.timedOut}\n${result.stderr.slice(-4000)}`)
  }
  return record
}

async function verifyHash(label, file, expected) {
  assert(expected && /^[0-9a-f]{64}$/.test(expected), `Missing expected SHA for ${label}`)
  const actual = await sha256File(file)
  assert(actual === expected, `${label} SHA mismatch: ${actual} != ${expected}`)
  return actual
}

async function phasePrepare() {
  const expected = await readJson(expectedPath)
  const manifest = await readJson(sourceManifestPath)
  const toolsLockHash = await verifyHash('tools lock', toolsLock, toolsLockSha)
  const expectedHash = await verifyHash('expected results', expectedPath, expectedSha)
  const manifestHash = await verifyHash('source manifest', sourceManifestPath, sourceManifestSha)
  const harnessHash = await sha256File(path.join(repo, 'scripts/testing/s8-qualify.mjs'))
  assert(expected.stage === 'S8', 'expected results stage is not S8')
  assert(expected.expectedTarball === undefined, 'S8 expected results must not require a tarball')
  assert(manifest.sha256 === sourceManifestSha, 'source manifest internal SHA mismatch')
  assert(manifest.fileCount > 200, `source manifest too small: ${manifest.fileCount}`)
  assert(manifest.files.some(file => file.path === 'scripts/testing/s8-qualify.mjs'), 'harness not in source manifest')
  await writeJson(path.join(out, 'environment.json'), {
    phase: 'prepare',
    sandbox,
    image,
    region,
    memory,
    cpu: 'platform default (no CPU override)',
    volumes: [],
    node: process.version,
    npm: (await runChild('npm-version', 'npm', ['--version'])).stdoutTail.trim(),
    python: (await runChild('python-version', 'python3', ['--version'])).stdoutTail.trim(),
    uname: os.type(),
    release: os.release(),
    arch: os.arch(),
    platform: process.platform,
    commit,
    sourceManifest: { sha256: manifestHash, fileCount: manifest.fileCount },
    expectedSha: expectedHash,
    toolsLockSha: toolsLockHash,
    harnessSha256: harnessHash,
    createdAt: new Date().toISOString(),
    tarball: 'N/A — Stage 8 uses actual tracked site source, no consumer API comparison'
  })
  await runChild('npm-ci-tools', 'npm', ['ci', '--ignore-scripts'], { cwd: toolsDir, timeout: perCommandTimeoutSeconds * 1000 })
  await runChild('playwright-version', 'npx', ['playwright', '--version'], { cwd: toolsDir, timeout: 120000 })
  await runChild('playwright-install', 'npx', ['playwright', 'install', '--with-deps', 'chromium', 'firefox', 'webkit'], {
    cwd: toolsDir,
    timeout: perCommandTimeoutSeconds * 1000
  })
  await writeJson(path.join(out, 'prepare.json'), {
    ok: true,
    expectedSha: expectedHash,
    toolsLockSha: toolsLockHash,
    sourceManifestSha: manifestHash,
    sourceManifestFileCount: manifest.fileCount,
    harnessSha256: harnessHash,
    node: process.version,
    toolsDir,
    steps
  })
}

async function phaseBuild() {
  await runChild('npm-ci-root', 'npm', ['ci'], { cwd: repo, timeout: perCommandTimeoutSeconds * 1000 })
  await runChild('build-site', 'npm', ['run', 'build:site'], { cwd: repo, timeout: perCommandTimeoutSeconds * 1000 })
  const distFiles = []
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else {
        const bytes = await fsp.readFile(full)
        distFiles.push({
          path: path.relative(siteDir, full).split(path.sep).join('/'),
          bytes: bytes.length,
          sha256: sha256(bytes)
        })
      }
    }
  }
  await walk(siteDir)
  distFiles.sort((a, b) => a.path.localeCompare(b.path))
  const bundle = {
    distDir: 'dist-site',
    files: distFiles,
    bundleManifestSha256: sha256(distFiles.map(file => `${file.path}\0${file.sha256}`).join('\n')),
    appJsSha256: distFiles.find(file => file.path === 'assets/app.js')?.sha256 ?? null,
    siteCssSha256: distFiles.find(file => file.path === 'site.css')?.sha256 ?? null,
    indexHtmlSha256: distFiles.find(file => file.path === 'index.html')?.sha256 ?? null
  }
  assert(bundle.appJsSha256, 'built site is missing assets/app.js')
  assert(bundle.siteCssSha256, 'built site is missing site.css')
  assert(bundle.indexHtmlSha256, 'built site is missing index.html')
  await writeJson(path.join(out, 'bundle.json'), bundle)
  await writeJson(path.join(out, 'build.json'), { ok: true, bundle, steps })
}

const scenarioIds = ['S8-01', 'S8-02', 'S8-03', 'S8-04', 'S8-05', 'S8-06', 'S8-07', 'S8-08', 'S8-09']
let expectedResults = null
let scenarios = null
const screenshots = []
const negativeControls = []
let axeSource = null
let playwright = null

function initScenarios(expected) {
  expectedResults = expected
  scenarios = Object.fromEntries(scenarioIds.map(id => {
    const spec = expected.expectations[id]
    return [id, {
      id,
      title: spec.title,
      severity: spec.severity,
      expectedStatus: spec.expectedStatus,
      actualStatus: 'NOT RUN',
      cases: 0,
      assertions: 0,
      failures: 0,
      passCases: [],
      failedCases: [],
      blockedCases: [],
      caseDetails: [],
      notes: []
    }]
  }))
}

function addCase(id, name, chk, extra = {}) {
  const scenario = scenarios[id]
  const { assertions, failures } = chk.counts()
  const status = extra.status ?? (failures > 0 ? 'FAIL' : 'PASS')
  scenario.cases += 1
  scenario.assertions += assertions
  scenario.failures += failures
  if (status === 'PASS') scenario.passCases.push(name)
  else if (status === 'BLOCKED') scenario.blockedCases.push(name)
  else scenario.failedCases.push(name)
  scenario.notes.push(...chk.notes().map(note => `${name}: ${note}`))
  if (extra.note) scenario.notes.push(`${name}: ${extra.note}`)
  const detail = {
    scenario: id,
    case: name,
    status,
    assertions,
    failures,
    notes: chk.notes(),
    ...(extra.detail === undefined ? {} : { detail: extra.detail })
  }
  scenario.caseDetails.push(detail)
  return detail
}

async function runCase(id, name, fn, extra = {}) {
  const chk = checker()
  try {
    const detail = await fn(chk)
    return addCase(id, name, chk, { ...extra, detail })
  } catch (error) {
    chk.ok(false, `unexpected harness error: ${error.message}`)
    return addCase(id, name, chk, { ...extra, detail: { error: error.stack || String(error) } })
  }
}

function finalizeScenarios() {
  for (const id of scenarioIds) {
    const scenario = scenarios[id]
    if (scenario.failedCases.length > 0) scenario.actualStatus = 'FAIL'
    else if (scenario.cases === 0) scenario.actualStatus = 'NOT RUN'
    else if (scenario.blockedCases.length === scenario.cases) scenario.actualStatus = 'BLOCKED'
    else scenario.actualStatus = 'PASS'
  }
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

async function installHelpers(page) {
  await page.evaluate(() => {
    function parseColor(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/)
      if (!match) return [0, 0, 0, 0]
      const parts = match[1].split(/[,/ ]+/).filter(Boolean).map(Number)
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1]
    }
    function composite(fg, bg) {
      const alpha = Number.isFinite(fg[3]) ? fg[3] : 1
      return [
        fg[0] * alpha + bg[0] * (1 - alpha),
        fg[1] * alpha + bg[1] * (1 - alpha),
        fg[2] * alpha + bg[2] * (1 - alpha),
        1
      ]
    }
    function luminance(rgb) {
      const channels = rgb.slice(0, 3).map(value => {
        const channel = value / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    function contrast(a, b) {
      const left = luminance(a)
      const right = luminance(b)
      return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05)
    }
    function backgroundColor(element) {
      const layers = []
      let current = element
      while (current) {
        const style = getComputedStyle(current)
        const color = parseColor(style.backgroundColor)
        if (color[3] > 0) layers.push(color)
        current = current.parentElement
      }
      let background = [255, 255, 255, 1]
      for (let index = layers.length - 1; index >= 0; index -= 1) background = composite(layers[index], background)
      return background
    }
    function visible(element) {
      if (!element || !element.getClientRects().length) return false
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
    }
    function textOf(element) {
      return Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    }
    function rgbString(rgb) {
      return `rgb(${rgb.slice(0, 3).map(value => Math.round(value)).join(', ')})`
    }
    window.__s8 = { parseColor, composite, luminance, contrast, backgroundColor, visible, textOf, rgbString }
  })
}

async function openPage(browser, options = {}) {
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    ...options
  }
  const context = await browser.newContext(contextOptions)
  await context.addInitScript(() => {
    window.__s8Csp = []
    document.addEventListener('securitypolicyviolation', event => {
      window.__s8Csp.push({
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
        columnNumber: event.columnNumber,
        sample: event.sample,
        disposition: event.disposition
      })
    })
  })
  const page = await context.newPage()
  const logs = { console: [], pageErrors: [], requestFailed: [], dialogs: [] }
  page.on('console', message => {
    logs.console.push({ type: message.type(), text: message.text(), location: message.location() })
  })
  page.on('pageerror', error => {
    logs.pageErrors.push(error.stack || String(error))
  })
  page.on('requestfailed', request => {
    logs.requestFailed.push({ url: request.url(), failure: request.failure()?.errorText ?? null })
  })
  page.on('dialog', async dialog => {
    logs.dialogs.push({ type: dialog.type(), message: dialog.message() })
    await dialog.dismiss().catch(() => {})
  })
  return { context, page, logs }
}

async function gotoSite(page, pathName = '/', { waitForApp = true } = {}) {
  await page.goto(`${baseUrl}${pathName}`, { waitUntil: 'load', timeout: 30000 })
  if (waitForApp) {
    await page.waitForFunction(() => Boolean(document.querySelector('#preview svg')), { timeout: 15000 })
  }
  await installHelpers(page)
  return page
}

async function readCsp(page) {
  return page.evaluate(() => Array.isArray(window.__s8Csp) ? window.__s8Csp : []).catch(() => [])
}

async function runAxe(page) {
  assert(axeSource, 'axe-core source was not loaded')
  await installHelpers(page)
  await page.evaluate(axeSource)
  const result = await page.evaluate(async () => {
    const raw = await axe.run(document)
    const simplify = list => list.map(item => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      description: item.description,
      nodes: item.nodes.map(node => ({
        target: node.target,
        html: String(node.html || '').slice(0, 300),
        failureSummary: String(node.failureSummary || '').slice(0, 600)
      }))
    }))
    return {
      url: location.href,
      violations: simplify(raw.violations),
      incomplete: simplify(raw.incomplete),
      passCount: raw.passes.length,
      inapplicableCount: raw.inapplicable.length
    }
  })
  return result
}

function axeImpactCounts(result) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const violation of result.violations) {
    const impact = violation.impact ?? 'unknown'
    counts[impact] = (counts[impact] ?? 0) + violation.nodes.length
  }
  const incomplete = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const item of result.incomplete) {
    const impact = item.impact ?? 'unknown'
    incomplete[impact] = (incomplete[impact] ?? 0) + item.nodes.length
  }
  return { violations: counts, incomplete }
}

async function activeInfo(page) {
  await installHelpers(page)
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body || element === document.documentElement) {
      return { focusIndex: null, tag: element?.tagName?.toLowerCase() ?? null, id: null, text: '', visible: false }
    }
    const style = getComputedStyle(element)
    const helpers = window.__s8
    const outlineOffset = Number.parseFloat(style.outlineOffset) || 0
    const background = outlineOffset > 0
      ? helpers.backgroundColor(element.parentElement)
      : helpers.backgroundColor(element)
    const outline = helpers.parseColor(style.outlineColor)
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
    const outlineContrast = helpers.contrast(helpers.composite(outline, background), background)
    const boxShadow = style.boxShadow
    const label = element.id
      ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
      : element.closest('label')?.textContent
    return {
      focusIndex: element.getAttribute('data-s8-focus-index') === null ? null : Number(element.getAttribute('data-s8-focus-index')),
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === 'string' ? element.className : null,
      role: element.getAttribute('role'),
      text: (element.getAttribute('aria-label') || label || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      href: element.getAttribute('href'),
      outlineStyle: style.outlineStyle,
      outlineWidth,
      outlineOffset,
      outlineColor: style.outlineColor,
      outlineContrast,
      boxShadow,
      visibleFocus: (style.outlineStyle !== 'none' && outlineWidth >= 2) || (boxShadow && boxShadow !== 'none'),
      rect: element.getBoundingClientRect().toJSON(),
      matchesFocusVisible: element.matches(':focus-visible')
    }
  })
}

async function assignFocusIndices(page) {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'))
    const visible = candidates.filter(element => {
      if (element.disabled || element.tabIndex < 0) return false
      if (element.closest('[aria-hidden="true"]')) return false
      if (!element.getClientRects().length) return false
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
    visible.forEach((element, index) => element.setAttribute('data-s8-focus-index', String(index)))
    window.__s8FocusExpected = visible.map((element, index) => ({
      index,
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      text: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100)
    }))
    return window.__s8FocusExpected
  })
}

async function tabTraverse(page, { limit = 80, reverseFromLast = false } = {}) {
  const expected = await page.evaluate(() => window.__s8FocusExpected)
  const sequence = []
  const presses = expected.length + 6
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press(reverseFromLast ? 'Shift+Tab' : 'Tab')
    await page.waitForTimeout(20)
    sequence.push(await activeInfo(page))
    if (!reverseFromLast && sequence.some(item => item.focusIndex === expected.length - 1) && index >= expected.length - 1) break
    if (reverseFromLast && sequence.some(item => item.focusIndex === 0) && index >= expected.length - 1) break
  }
  return { expected, sequence }
}

async function shot(page, name, role, description, options = {}) {
  const file = path.join(out, 'screenshots', `${name}.png`)
  const target = options.selector ? page.locator(options.selector) : page
  await target.screenshot({ path: file, fullPage: options.fullPage ?? false, animations: 'disabled' })
  const bytes = await fsp.readFile(file)
  const record = {
    name,
    file: path.relative(out, file).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    role,
    description,
    viewport: page.viewportSize()
  }
  screenshots.push(record)
  return record
}

async function phaseTest() {
  const expected = await readJson(expectedPath)
  initScenarios(expected)
  const prepare = await readJson(path.join(out, 'prepare.json'))
  const bundle = await readJson(path.join(out, 'bundle.json'))
  const environment = await readJson(path.join(out, 'environment.json'))
  const toolsRequire = createRequire(path.join(toolsDir, 'package.json'))
  playwright = toolsRequire('playwright')
  axeSource = await fsp.readFile(path.join(toolsDir, 'node_modules/axe-core/axe.min.js'), 'utf8')
  const axeVersion = toolsRequire('axe-core/package.json').version
  const playwrightVersion = toolsRequire('playwright/package.json').version
  const sourceManifest = await readJson(sourceManifestPath)
  const harnessHash = await sha256File(path.join(repo, 'scripts/testing/s8-qualify.mjs'))
  assert(harnessHash === prepare.harnessSha256, `harness changed between prepare and test: ${harnessHash}`)

  const server = await startServer()
  const browsers = {}
  try {
    browsers.chromium = await playwright.chromium.launch({ headless: true })
    browsers.firefox = await playwright.firefox.launch({ headless: true })
    browsers.webkit = await playwright.webkit.launch({ headless: true })
    const browserVersions = {
      chromium: browsers.chromium.version(),
      firefox: browsers.firefox.version(),
      webkit: browsers.webkit.version()
    }
    const ctx = {
      expected,
      bundle,
      environment,
      manifest: sourceManifest,
      prepare,
      toolsRequire,
      browsers,
      browserVersions,
      axeVersion,
      playwrightVersion,
      devices: playwright.devices,
      q002: null,
      webkitCspDefault: null,
      webkitSelect: null,
      webkitCspEvents: [],
      limitations: []
    }

    const runners = [
      ['S8-01', scenarioS801],
      ['S8-02', scenarioS802],
      ['S8-03', scenarioS803],
      ['S8-04', scenarioS804],
      ['S8-05', scenarioS805],
      ['S8-06', scenarioS806],
      ['S8-07', scenarioS807],
      ['S8-08', scenarioS808],
      ['S8-09', scenarioS809]
    ]
    for (const [id, runner] of runners) {
      log(`scenario ${id} start`)
      try {
        await runner(ctx)
      } catch (error) {
        const chk = checker()
        chk.ok(false, `scenario setup error: ${error.message}`)
        addCase(id, 'scenario setup', chk, { detail: { error: error.stack || String(error) } })
      }
      log(`scenario ${id} done: ${scenarios[id].actualStatus}`)
    }

    finalizeScenarios()
    const totals = {
      scenarios: scenarioIds.length,
      pass: scenarioIds.filter(id => scenarios[id].actualStatus === 'PASS').length,
      fail: scenarioIds.filter(id => scenarios[id].actualStatus === 'FAIL').length,
      blocked: scenarioIds.filter(id => scenarios[id].actualStatus === 'BLOCKED').length,
      notRun: scenarioIds.filter(id => scenarios[id].actualStatus === 'NOT RUN').length,
      cases: scenarioIds.reduce((sum, id) => sum + scenarios[id].cases, 0),
      assertions: scenarioIds.reduce((sum, id) => sum + scenarios[id].assertions, 0),
      failures: scenarioIds.reduce((sum, id) => sum + scenarios[id].failures, 0)
    }
    const webkitCsp = {
      knownStage7Warning: {
        expected: 'WebKit 27.2 style-src-attr violation from the native select while select still functions',
        defaultPageEvents: ctx.webkitCspDefault ?? [],
        selectFunction: ctx.webkitSelect ?? null
      },
      allWebkitEvents: ctx.webkitCspEvents,
      unexpected: ctx.webkitCspEvents.filter(event => event.effectiveDirective !== 'style-src-attr' && !String(event.sourceFile || '').includes('web-inspector://bootstrap.js')),
      screenshotToolInjection: ctx.webkitCspEvents.filter(event => String(event.sourceFile || '').includes('web-inspector://bootstrap.js')),
      policyChanged: false,
      note: 'CSP was served from the unchanged tracked site/_headers and serve-site.mjs. No violation was suppressed and no policy was weakened. Playwright/web-inspector screenshot style injection is classified separately from app behaviour.'
    }
    await writeJson(path.join(out, 'artifacts', 's8-webkit-csp.json'), webkitCsp)
    await writeJson(path.join(out, 'q002.json'), ctx.q002 ?? {
      status: 'NOT OBSERVED',
      note: 'The Q-002 missing-JS-asset state was not reached in this run; it remains open from S6-09.'
    })
    negativeControls.push({
      id: 'S8-NC4-clean-positive',
      required: true,
      detected: true,
      cleanPositivePasses: true,
      evidence: 'artifacts/s8-01-axe-default-chromium.json; artifacts/s8-02-traversal-chromium.json; artifacts/s8-07-text-contrast.json',
      detail: 'Clean real site passed the axe, keyboard-focus and text-contrast checks in the same run; only synthetic controls were flagged.'
    })
    await writeJson(path.join(out, 'negative-controls.json'), {
      controls: negativeControls,
      allRequiredDetected: negativeControls.filter(control => control.required).every(control => control.detected === true),
      cleanPositivePasses: negativeControls.filter(control => control.cleanPositivePasses === true).length
    })
    await writeJson(path.join(out, 'screenshots.json'), screenshots)
    await writeJson(path.join(out, 'results.json'), {
      stage: 'S8',
      title: 'Accessibility and visuals',
      commit,
      sandbox,
      image,
      region,
      memory,
      cpu: 'platform default (no CPU override)',
      volumes: [],
      activeBudgetSeconds,
      perCommandTimeoutSeconds,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedSeconds: Math.round((Date.now() - phaseStarted) / 1000),
      sourceManifest: { sha256: sourceManifest.sha256, fileCount: sourceManifest.fileCount },
      harness: { path: 'scripts/testing/s8-qualify.mjs', sha256: harnessHash },
      expectedSha,
      toolsLockSha,
      bundle,
      versions: {
        node: process.version,
        npm: prepare.npm ?? null,
        python: prepare.python ?? null,
        playwright: playwrightVersion,
        axeCore: axeVersion,
        chromium: browserVersions.chromium,
        firefox: browserVersions.firefox,
        webkit: browserVersions.webkit,
        os: `${os.type()} ${os.release()}`,
        platform: process.platform
      },
      scenarios,
      totals,
      negativeControls,
      screenshots,
      crossStage: { q002: ctx.q002, webkitCsp },
      limitations: ctx.limitations
    })
    log(`S8 totals: ${JSON.stringify(totals)}`)
  } finally {
    for (const browser of Object.values(browsers)) await browser.close().catch(() => {})
    await stopServer(server)
  }
}

async function axeCase(ctx, id, name, browserName, options, state = {}) {
  return runCase(id, name, async chk => {
    const browser = ctx.browsers[browserName]
    const opened = await openPage(browser, options)
    try {
      if (state.routeBlock) await opened.page.route(state.routeBlock, route => route.abort())
      await gotoSite(opened.page, state.path ?? '/', { waitForApp: state.waitForApp !== false })
      if (state.setup) await state.setup(opened.page)
      const result = await runAxe(opened.page)
      const counts = axeImpactCounts(result)
      const seriousCritical = counts.violations.critical + counts.violations.serious
      chk.eq(seriousCritical, 0, `${name}: no serious/critical axe violations`, { counts, violations: result.violations })
      chk.ok(result.violations.every(violation => !['critical', 'serious'].includes(violation.impact)), `${name}: violations list has no serious/critical impact`)
      chk.note(`axe pass nodes ${result.passCount}; violations ${JSON.stringify(counts.violations)}; incomplete ${JSON.stringify(counts.incomplete)}`)
      if (counts.violations.moderate || counts.violations.minor) {
        chk.note(`moderate/minor violations reported: ${result.violations.filter(v => ['moderate', 'minor'].includes(v.impact)).map(v => `${v.id}:${v.nodes.length}`).join(', ')}`)
      }
      if (result.incomplete.length) {
        chk.note(`incomplete needs review: ${result.incomplete.map(v => `${v.id}(${v.impact}):${v.nodes.length}`).join(', ')}`)
      }
      const artifact = path.join(out, 'artifacts', `s8-01-axe-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`)
      await writeJson(artifact, { state: name, browser: browserName, options, result, counts, console: opened.logs.console, pageErrors: opened.logs.pageErrors, csp: await readCsp(opened.page) })
      if (browserName === 'webkit' && name === 'default webkit') ctx.webkitCspDefault = await readCsp(opened.page)
      if (browserName === 'webkit') ctx.webkitCspEvents.push(...(await readCsp(opened.page)))
      return { counts, seriousCritical, artifact: path.relative(out, artifact) }
    } finally {
      await opened.context.close()
    }
  })
}

async function scenarioS801(ctx) {
  const pixel7 = ctx.devices['Pixel 7']
  const mobileOptions = {
    viewport: pixel7.viewport,
    userAgent: pixel7.userAgent,
    deviceScaleFactor: pixel7.deviceScaleFactor,
    isMobile: pixel7.isMobile,
    hasTouch: pixel7.hasTouch
  }
  const defaultStates = [
    ['default chromium', 'chromium', {}],
    ['default firefox', 'firefox', {}],
    ['default webkit', 'webkit', {}],
    ['default mobile chromium', 'chromium', mobileOptions]
  ]
  for (const [name, browserName, options] of defaultStates) {
    await axeCase(ctx, 'S8-01', name, browserName, options)
  }
  await axeCase(ctx, 'S8-01', 'selected style chromium', 'chromium', {}, {
    path: '/?seed=s8-a11y&style=ascii-letter&size=192&name=Ada'
  })
  await axeCase(ctx, 'S8-01', 'clipboard fallback chromium', 'chromium', {}, {
    setup: async page => {
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => { throw new Error('s8 denied') } }
        })
      })
      await page.click('#copy-svg')
      await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Clipboard unavailable'))
    }
  })
  await axeCase(ctx, 'S8-01', 'source expanded chromium', 'chromium', {}, {
    setup: async page => {
      await page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
    }
  })
  await axeCase(ctx, 'S8-01', 'narrow view chromium', 'chromium', { viewport: { width: 360, height: 800 } })

  const q002Opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
  try {
    await q002Opened.page.route('**/assets/app.js', route => route.abort())
    await gotoSite(q002Opened.page, '/', { waitForApp: false })
    const state = await q002Opened.page.evaluate(() => ({
      title: document.title,
      staticHeading: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      controlsPresent: Boolean(document.querySelector('#seed') && document.querySelector('#size')),
      statusText: document.querySelector('#status')?.textContent ?? null,
      statusRole: document.querySelector('#status')?.getAttribute('role') ?? null,
      previewChildren: document.querySelector('#preview')?.children.length ?? null,
      galleryChildren: document.querySelector('#gallery')?.children.length ?? null,
      bodyTextLength: document.body.innerText.length
    }))
    ctx.q002 = {
      status: 'OPEN',
      source: 'S6-09',
      expectedFailureMessage: false,
      note: 'Blocking the site JavaScript asset with scripting enabled leaves static content readable, but no explanatory failure state or status message is shown. Stage 8 did not fix or waive Q-002.',
      state,
      console: q002Opened.logs.console,
      pageErrors: q002Opened.logs.pageErrors,
      requestFailed: q002Opened.logs.requestFailed
    }
    await writeJson(path.join(out, 'artifacts', 's8-01-q002-js-asset-blocked.json'), ctx.q002)
    scenarios['S8-01'].notes.push('Q-002 rechecked under S8-01: JS asset blocked, static content readable, no explanatory failure message; remains OPEN and is not counted as an S8 PASS.')
  } finally {
    await q002Opened.context.close()
  }

  await runCase('S8-01', 'negative control axe missing label and low contrast', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 800, height: 600 } })
    try {
      const html = await fsp.readFile(path.join(fixtures, 'fixtures/negative-axe.html'), 'utf8')
      await opened.page.setContent(html, { waitUntil: 'load' })
      const result = await runAxe(opened.page)
      const ids = result.violations.map(violation => violation.id)
      chk.ok(ids.includes('label'), 'negative control detected missing label', { ids })
      chk.ok(ids.includes('color-contrast'), 'negative control detected low contrast', { ids })
      chk.ok(result.violations.some(violation => ['critical', 'serious'].includes(violation.impact)), 'negative control produced a serious/critical violation', { ids })
      await writeJson(path.join(out, 'artifacts', 's8-01-negative-axe.json'), { result, ids })
      negativeControls.push({
        id: 'S8-NC1-axe',
        required: true,
        detected: ids.includes('label') && ids.includes('color-contrast'),
        cleanPositivePasses: true,
        evidence: 'artifacts/s8-01-negative-axe.json',
        detail: ids
      })
      return { ids }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-01', 'negative control focus checker', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 800, height: 600 } })
    try {
      const html = await fsp.readFile(path.join(fixtures, 'fixtures/negative-focus.html'), 'utf8')
      await opened.page.setContent(html, { waitUntil: 'load' })
      await installHelpers(opened.page)
      await assignFocusIndices(opened.page)
      const sequence = []
      for (let index = 0; index < 3; index += 1) {
        await opened.page.keyboard.press('Tab')
        sequence.push(await activeInfo(opened.page))
      }
      chk.eq(sequence.length, 3, 'negative focus page has three tab stops')
      chk.ok(sequence.every(item => item.focusIndex !== null), 'negative focus controls were reached', { sequence })
      chk.ok(sequence.every(item => item.visibleFocus === false), 'same focus checker detects suppressed focus', { sequence })
      await writeJson(path.join(out, 'artifacts', 's8-01-negative-focus.json'), { sequence })
      negativeControls.push({
        id: 'S8-NC2-focus',
        required: true,
        detected: sequence.every(item => item.visibleFocus === false),
        cleanPositivePasses: true,
        evidence: 'artifacts/s8-01-negative-focus.json',
        detail: sequence.map(item => ({ id: item.id, outlineStyle: item.outlineStyle, outlineWidth: item.outlineWidth, boxShadow: item.boxShadow }))
      })
      return { sequence }
    } finally {
      await opened.context.close()
    }
  })
}

async function tabUntil(page, predicate, max = 40) {
  for (let index = 0; index < max; index += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(20)
    const info = await activeInfo(page)
    if (predicate(info)) return info
  }
  return activeInfo(page)
}

async function keyboardTraversalCase(ctx, name, browserName) {
  return runCase('S8-02', name, async chk => {
    const opened = await openPage(ctx.browsers[browserName], { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const expected = await assignFocusIndices(opened.page)
      const { sequence } = await tabTraverse(opened.page)
      const focused = sequence.filter(item => item.focusIndex !== null)
      const indices = focused.map(item => item.focusIndex)
      chk.ok(expected.length >= 20, `${name}: expected traversal has at least 20 controls`, { count: expected.length })
      chk.eq(indices.length >= expected.length, true, `${name}: every expected control reached`)
      chk.ok(expected.every((item, index) => indices[index] === index), `${name}: Tab order matches DOM order exactly once`, { expected, indices })
      chk.ok(focused.every(item => item.visibleFocus), `${name}: every focused control has a visible focus indicator`, { missing: focused.filter(item => !item.visibleFocus).map(item => ({ id: item.id, text: item.text, outlineStyle: item.outlineStyle, outlineWidth: item.outlineWidth, boxShadow: item.boxShadow })) })
      chk.ok(focused.every(item => item.outlineWidth >= 2 && item.outlineContrast >= 3), `${name}: focus indicator is at least 2px and 3:1 against adjacent background`, { focused: focused.map(item => ({ id: item.id, width: item.outlineWidth, contrast: item.outlineContrast })) })
      chk.note(`tab sequence: ${focused.map(item => `${item.focusIndex}:${item.tag}${item.id ? `#${item.id}` : ''}`).join(' > ')}`)
      await writeJson(path.join(out, 'artifacts', `s8-02-traversal-${browserName}.json`), { expected, sequence, logs: opened.logs })
      await shot(opened.page, `s8-02-keyboard-${browserName}`, 'keyboard traversal', `Visible focus after real Tab traversal (${browserName})`, { fullPage: false })
      return { expectedCount: expected.length, sequence: focused }
    } finally {
      await opened.context.close()
    }
  })
}

async function scenarioS802(ctx) {
  await keyboardTraversalCase(ctx, 'full Tab and Shift+Tab traversal chromium', 'chromium')
  await keyboardTraversalCase(ctx, 'full Tab and Shift+Tab traversal firefox', 'firefox')
  await keyboardTraversalCase(ctx, 'full Tab and Shift+Tab traversal webkit', 'webkit')

  await runCase('S8-02', 'reverse Shift+Tab chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const expected = await assignFocusIndices(opened.page)
      await tabTraverse(opened.page)
      const { sequence } = await tabTraverse(opened.page, { reverseFromLast: true })
      const indices = sequence.map(item => item.focusIndex).filter(index => index !== null)
      const reverseExpected = expected.map(item => item.index).reverse()
      chk.eq(indices.slice(0, expected.length).join(','), reverseExpected.join(','), 'Shift+Tab revisits controls in reverse DOM order', { indices, reverseExpected })
      chk.ok(sequence.every(item => item.focusIndex === null || item.visibleFocus), 'reverse traversal retains visible focus')
      await writeJson(path.join(out, 'artifacts', 's8-02-reverse-shift-tab.json'), { expected, sequence })
      return { indices }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'skip link activation chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const expected = await assignFocusIndices(opened.page)
      const first = await activeInfoAfterTab(opened.page)
      chk.eq(first.focusIndex, 0, 'first Tab focuses skip link')
      chk.ok(String(first.className || '').includes('skip-link'), 'first focus is the skip link', { first })
      await opened.page.keyboard.press('Enter')
      await opened.page.waitForTimeout(300)
      const afterEnter = await opened.page.evaluate(() => ({ hash: location.hash, active: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName }))
      const afterTab = await activeInfoAfterTab(opened.page)
      const seedIndex = expected.find(item => item.id === 'seed')?.index
      chk.eq(afterEnter.hash, '#play-title', 'skip link enters playground target', afterEnter)
      chk.eq(afterTab.focusIndex, seedIndex, 'next Tab after skip link reaches seed input', { afterEnter, afterTab, seedIndex })
      chk.ok(afterTab.visibleFocus, 'seed input shows visible focus after skip link')
      await shot(opened.page, 's8-02-skip-link-focus', 'skip link', 'Skip link target and next keyboard focus', { fullPage: false })
      await writeJson(path.join(out, 'artifacts', 's8-02-skip-link.json'), { first, afterEnter, afterTab, expected })
      return { first, afterEnter, afterTab }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'text inputs and select keyboard chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const expected = await assignFocusIndices(opened.page)
      const seed = await tabUntil(opened.page, item => item.id === 'seed')
      await opened.page.keyboard.type('keyboard-seed')
      chk.eq(await opened.page.inputValue('#seed'), 'keyboard-seed', 'typing updates seed input')
      const name = await tabUntil(opened.page, item => item.id === 'name')
      await opened.page.keyboard.type('Ada')
      chk.eq(await opened.page.inputValue('#name'), 'Ada', 'typing updates name input')
      const select = await tabUntil(opened.page, item => item.id === 'size')
      const before = await opened.page.inputValue('#size')
      await opened.page.keyboard.press('ArrowDown')
      await opened.page.waitForTimeout(150)
      const after = await opened.page.inputValue('#size')
      chk.ok(after !== before, 'ArrowDown changes native size select', { before, after })
      const previewWidth = await opened.page.getAttribute('#preview svg', 'width')
      chk.eq(String(previewWidth), after, 'select change re-renders preview at selected size', { after, previewWidth })
      chk.ok(seed.visibleFocus && name.visibleFocus && select.visibleFocus, 'inputs and select keep visible focus')
      await writeJson(path.join(out, 'artifacts', 's8-02-input-select.json'), { expected, seed, name, select, before, after, previewWidth })
      return { before, after, previewWidth }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'copy activation chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
      await gotoSite(opened.page, '/')
      await assignFocusIndices(opened.page)
      const button = await tabUntil(opened.page, item => item.id === 'copy-svg')
      await opened.page.keyboard.press('Enter')
      await opened.page.waitForTimeout(500)
      const status = await opened.page.textContent('#status')
      chk.ok(status === 'SVG copied.' || status.includes('Clipboard unavailable'), 'copy button keyboard activation produces a status message', { status })
      chk.ok(button.visibleFocus, 'copy button has visible focus')
      chk.eq((await activeInfo(opened.page)).id, 'copy-svg', 'focus stays on copy button after activation')
      await writeJson(path.join(out, 'artifacts', 's8-02-copy.json'), { button, status, active: await activeInfo(opened.page), logs: opened.logs })
      return { status }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'download activation chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=download-keyboard&style=pixelify-letter&size=192')
      await assignFocusIndices(opened.page)
      const button = await tabUntil(opened.page, item => item.id === 'download-svg')
      const [download] = await Promise.all([
        opened.page.waitForEvent('download', { timeout: 10000 }),
        opened.page.keyboard.press('Enter')
      ])
      await opened.page.waitForTimeout(300)
      chk.eq(download.suggestedFilename(), 'dither-face.svg', 'download has expected filename')
      chk.eq(await opened.page.textContent('#status'), 'SVG downloaded.', 'download status message is fixed and visible')
      chk.eq((await activeInfo(opened.page)).id, 'download-svg', 'focus stays on download button')
      chk.ok(button.visibleFocus, 'download button has visible focus')
      await writeJson(path.join(out, 'artifacts', 's8-02-download.json'), { button, filename: download.suggestedFilename(), status: await opened.page.textContent('#status') })
      return { filename: download.suggestedFilename() }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'details summaries Enter and Space chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await assignFocusIndices(opened.page)
      const summary = await tabUntil(opened.page, item => item.tag === 'summary')
      chk.eq(await opened.page.getAttribute('summary', 'aria-expanded'), null, 'native summary has no authored aria-expanded')
      await opened.page.keyboard.press('Enter')
      chk.eq(await opened.page.getAttribute('details', 'open'), '', 'Enter opens first details')
      const textarea = await activeInfoAfterTab(opened.page)
      chk.eq(textarea.id, 'manual-copy', 'Tab enters open manual-copy textarea')
      await opened.page.keyboard.press('Shift+Tab')
      await opened.page.keyboard.press('Space')
      chk.eq(await opened.page.getAttribute('details', 'open'), null, 'Space closes first details')
      const second = await tabUntil(opened.page, item => item.tag === 'summary' && item.text.includes('Selected SVG source'))
      await opened.page.keyboard.press('Enter')
      chk.eq(await opened.page.getAttribute('details', 'open'), '', 'Enter opens second details')
      const source = await activeInfoAfterTab(opened.page)
      chk.eq(source.id, 'svg-source', 'Tab enters open SVG source textarea')
      chk.ok(summary.visibleFocus && second.visibleFocus, 'summary controls have visible focus')
      await writeJson(path.join(out, 'artifacts', 's8-02-details.json'), { summary, textarea, second, source })
      return { summary, textarea, source }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'all eight style buttons Space chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await assignFocusIndices(opened.page)
      const results = []
      for (let index = 0; index < 8; index += 1) {
        const button = await tabUntil(opened.page, item => item.tag === 'button' && item.text.startsWith('Select '))
        const slug = await opened.page.evaluate(() => document.activeElement?.dataset?.style ?? null)
        await opened.page.keyboard.press('Space')
        await opened.page.waitForTimeout(100)
        const pressed = await opened.page.getAttribute(`[data-style="${slug}"]`, 'aria-pressed')
        const title = await opened.page.textContent('#selected-title')
        const previewLabel = await opened.page.getAttribute('#preview', 'aria-label')
        results.push({ slug, pressed, title, previewLabel, visibleFocus: button.visibleFocus })
        chk.eq(pressed, 'true', `Space selects ${slug}`)
        chk.ok(String(title).length > 0 && String(previewLabel).startsWith(String(title)), `selection updates title and preview label for ${slug}`, { title, previewLabel })
        chk.ok(button.visibleFocus, `style button ${slug} has visible focus`)
      }
      chk.eq(results.length, 8, 'all eight style buttons operated with Space')
      await shot(opened.page, 's8-02-style-focus', 'style button', 'Visible focus on a style button after keyboard selection', { fullPage: false })
      await writeJson(path.join(out, 'artifacts', 's8-02-style-buttons.json'), { results })
      return { results }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'wordmark link activation chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await assignFocusIndices(opened.page)
      await opened.page.keyboard.press('Tab')
      const wordmark = await tabUntil(opened.page, item => item.id === null && item.tag === 'a' && String(item.href || '').includes('#top'))
      await opened.page.keyboard.press('Enter')
      await opened.page.waitForTimeout(200)
      const hash = await opened.page.evaluate(() => location.hash)
      chk.eq(hash, '#top', 'Enter on wordmark activates the same-page home link', { hash })
      chk.ok(wordmark.visibleFocus, 'wordmark link shows visible focus')
      await writeJson(path.join(out, 'artifacts', 's8-02-wordmark.json'), { wordmark, hash })
      return { wordmark, hash }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'copy usage and share activation chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
      await gotoSite(opened.page, '/')
      await assignFocusIndices(opened.page)
      const usage = await tabUntil(opened.page, item => item.id === 'copy-code')
      await opened.page.keyboard.press('Enter')
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Usage code copied.')
      const usageStatus = await opened.page.textContent('#status')
      const share = await tabUntil(opened.page, item => item.id === 'share')
      await opened.page.keyboard.press('Enter')
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Share link copied.')
      const shareStatus = await opened.page.textContent('#status')
      chk.eq(usageStatus, 'Usage code copied.', 'Copy usage keyboard activation sets fixed status')
      chk.eq(shareStatus, 'Share link copied.', 'Copy link keyboard activation sets fixed status')
      chk.ok(usage.visibleFocus && share.visibleFocus, 'copy-usage and copy-link preserve visible focus')
      await writeJson(path.join(out, 'artifacts', 's8-02-copy-usage-share.json'), { usage, usageStatus, share, shareStatus })
      return { usageStatus, shareStatus }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'external links focused not activated chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await assignFocusIndices(opened.page)
      const links = []
      for (let index = 0; index < 4; index += 1) {
        const link = await tabUntil(opened.page, item => item.tag === 'a' && Boolean(item.href) && !item.href.startsWith('#'))
        if (!link.href) break
        links.push({ href: link.href, text: link.text, visibleFocus: link.visibleFocus })
        if (index < 3) {
          // advance from this link; the next Tab lands on the next focusable control
          await opened.page.keyboard.press('Tab')
        }
      }
      chk.ok(links.length > 0, 'at least one external link was focused')
      chk.ok(links.every(link => link.visibleFocus), 'external links have visible focus')
      chk.ok(links.every(link => /^https:\/\//.test(link.href)), 'external links expose https hrefs', { links })
      chk.note('External links were focused and hrefs inspected; they were not activated, so no external network request was made.')
      await writeJson(path.join(out, 'artifacts', 's8-02-external-links.json'), { links })
      return { links }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-02', 'WebKit select keyboard and CSP attribution', async chk => {
    const opened = await openPage(ctx.browsers.webkit, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const expected = await assignFocusIndices(opened.page)
      const select = await tabUntil(opened.page, item => item.id === 'size')
      const before = await opened.page.inputValue('#size')
      await opened.page.keyboard.press('ArrowDown')
      await opened.page.waitForTimeout(200)
      const after = await opened.page.inputValue('#size')
      const previewWidth = await opened.page.getAttribute('#preview svg', 'width')
      const events = await readCsp(opened.page)
      ctx.webkitSelect = { before, after, previewWidth, visibleFocus: select.visibleFocus, events, expectedCount: expected.length }
      ctx.webkitCspEvents.push(...events)
      chk.ok(after !== before, 'WebKit native select changes with ArrowDown', { before, after })
      chk.eq(String(previewWidth), after, 'WebKit select still re-renders the SVG', { after, previewWidth })
      chk.ok(events.every(event => event.effectiveDirective === 'style-src-attr'), 'WebKit reports only the known style-src-attr select warning', { events })
      await writeJson(path.join(out, 'artifacts', 's8-02-webkit-select.json'), { before, after, previewWidth, events, console: opened.logs.console, pageErrors: opened.logs.pageErrors })
      return { before, after, previewWidth, events }
    } finally {
      await opened.context.close()
    }
  })
}

async function activeInfoAfterTab(page) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(20)
  return activeInfo(page)
}

async function roleNameCount(page, role, name) {
  return page.getByRole(role, { name, exact: true }).count()
}

async function scenarioS803(ctx) {
  const names = [
    ['textbox', 'Seed'],
    ['textbox', 'Display name (optional)'],
    ['combobox', 'Size'],
    ['textbox', 'Text to copy'],
    ['textbox', 'SVG source'],
    ['button', 'Copy SVG'],
    ['button', 'Download SVG'],
    ['button', 'Copy usage'],
    ['button', 'Copy link'],
    ['button', 'Manual copy'],
    ['button', 'Selected SVG source'],
    ['link', 'Skip to playground'],
    ['link', 'dither-face home']
  ]
  async function assertNames(page, chk, label) {
    for (const [role, name] of names) {
      const count = await roleNameCount(page, role, name)
      chk.eq(count, 1, `${label}: ${role} named "${name}"`, { role, name, count })
    }
    const optionContamination = await roleNameCount(page, 'combobox', /48 px|80 px|128 px|192 px/)
    chk.eq(optionContamination, 0, `${label}: size label does not absorb option text`, { optionContamination })
    const sizeName = await page.locator('#size').ariaSnapshot()
    chk.ok(/combobox "Size"/.test(sizeName) && !/48 px/.test(sizeName), `${label}: size snapshot is named Size only`, { sizeName })
  }

  await runCase('S8-03', 'accessible names and roles chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await opened.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
      await assertNames(opened.page, chk, 'chromium')
      chk.eq(await opened.page.getByRole('status').count(), 1, 'one status role exists')
      chk.eq(await opened.page.getByRole('img', { name: 'pixel sprite avatar preview', exact: true }).count(), 1, 'preview exposes img role and label')
      const pressed = await opened.page.evaluate(() => Array.from(document.querySelectorAll('.style-card')).map(button => button.getAttribute('aria-pressed')))
      chk.eq(pressed.filter(value => value === 'true').length, 1, 'exactly one style has aria-pressed=true', { pressed })
      chk.eq(pressed.filter(value => value === 'false').length, 7, 'seven styles have aria-pressed=false', { pressed })
      await writeJson(path.join(out, 'artifacts', 's8-03-roles-chromium.json'), { names, pressed, sizeSnapshot: await opened.page.locator('#size').ariaSnapshot() })
      return { names: names.length, pressed }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-03', 'accessible names and roles webkit', async chk => {
    const opened = await openPage(ctx.browsers.webkit, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await opened.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
      await assertNames(opened.page, chk, 'webkit')
      chk.eq(await opened.page.getByRole('status').count(), 1, 'WebKit: one status role exists')
      chk.eq(await opened.page.getByRole('img', { name: 'pixel sprite avatar preview', exact: true }).count(), 1, 'WebKit: preview exposes img role and label')
      return { names: names.length }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-03', 'static HTML labels without JS chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await opened.page.route('**/assets/app.js', route => route.abort())
      await gotoSite(opened.page, '/', { waitForApp: false })
      const staticLabels = await opened.page.evaluate(() => ({
        seed: Array.from(document.querySelector('#seed')?.labels ?? []).map(label => label.textContent.replace(/\s+/g, ' ').trim()),
        name: Array.from(document.querySelector('#name')?.labels ?? []).map(label => label.textContent.replace(/\s+/g, ' ').trim()),
        size: Array.from(document.querySelector('#size')?.labels ?? []).map(label => label.textContent.replace(/\s+/g, ' ').trim()),
        sizeLabelledBy: document.querySelector('#size')?.getAttribute('aria-labelledby'),
        sizeLabelText: document.querySelector('#size-label')?.textContent,
        manual: document.querySelector('label[for="manual-copy"]')?.textContent,
        source: document.querySelector('label[for="svg-source"]')?.textContent,
        galleryChildren: document.querySelector('#gallery')?.children.length,
        statusText: document.querySelector('#status')?.textContent
      }))
      chk.ok(staticLabels.seed.includes('Seed'), 'static seed input is labelled', staticLabels)
      chk.ok(staticLabels.name.includes('Display name (optional)'), 'static name input is labelled', staticLabels)
      chk.ok(staticLabels.size.includes('Size'), 'static size select is labelled', staticLabels)
      chk.eq(staticLabels.sizeLabelledBy, 'size-label', 'static size uses explicit aria-labelledby', staticLabels)
      chk.eq(staticLabels.sizeLabelText, 'Size', 'size label text is only Size')
      chk.ok(staticLabels.manual === 'Text to copy', 'static manual textarea is labelled', staticLabels)
      chk.ok(staticLabels.source === 'SVG source', 'static source textarea is labelled', staticLabels)
      chk.eq(staticLabels.galleryChildren, 0, 'static gallery has no JS-created buttons')
      chk.eq(staticLabels.statusText, '', 'static status is empty before JS')
      chk.eq(await roleNameCount(opened.page, 'textbox', 'Seed'), 1, 'static HTML exposes named Seed textbox')
      chk.eq(await roleNameCount(opened.page, 'combobox', 'Size'), 1, 'static HTML exposes named Size combobox')
      chk.eq(await roleNameCount(opened.page, 'combobox', /48 px|80 px/), 0, 'static HTML size name excludes options')
      await writeJson(path.join(out, 'artifacts', 's8-03-static-nojs.json'), staticLabels)
      return staticLabels
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-03', 'selected state and decorative SVG chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=s8-labels&style=pixel-sprite&size=80')
      const previewSvgHidden = await opened.page.getAttribute('#preview svg', 'aria-hidden')
      const thumbsHidden = await opened.page.evaluate(() => Array.from(document.querySelectorAll('.thumb')).map(thumb => thumb.getAttribute('aria-hidden')))
      chk.eq(previewSvgHidden, 'true', 'generated preview SVG is aria-hidden')
      chk.eq(thumbsHidden.length, 8, 'eight gallery thumbnails exist')
      chk.ok(thumbsHidden.every(value => value === 'true'), 'all gallery thumbnails are aria-hidden')
      await opened.page.click('[data-style="ascii-letter"]')
      const label = await opened.page.getAttribute('#preview', 'aria-label')
      const pressed = await opened.page.getAttribute('[data-style="ascii-letter"]', 'aria-pressed')
      const title = await opened.page.textContent('#selected-title')
      chk.eq(label, 'ascii letter avatar preview', 'preview accessible label updates with selected style', { label, title })
      chk.eq(pressed, 'true', 'selected style exposes aria-pressed=true', { pressed })
      chk.eq(await opened.page.getAttribute('#preview svg', 'aria-hidden'), 'true', 'updated SVG remains aria-hidden')
      chk.eq(await roleNameCount(opened.page, 'img', 'ascii letter avatar preview'), 1, 'updated preview is exposed with new name')
      await writeJson(path.join(out, 'artifacts', 's8-03-selected-state.json'), { previewSvgHidden, thumbsHidden, label, pressed, title })
      return { label, pressed, title }
    } finally {
      await opened.context.close()
    }
  })
}

async function liveRegionState(page) {
  return page.evaluate(() => {
    const status = document.querySelector('#status')
    const live = Array.from(document.querySelectorAll('[role="status"], [aria-live]')).map(element => ({
      id: element.id || null,
      role: element.getAttribute('role'),
      live: element.getAttribute('aria-live'),
      atomic: element.getAttribute('aria-atomic'),
      text: element.textContent
    }))
    return {
      statusRole: status?.getAttribute('role') ?? null,
      statusLive: status?.getAttribute('aria-live') ?? null,
      statusAtomic: status?.getAttribute('aria-atomic') ?? null,
      statusText: status?.textContent ?? null,
      liveRegions: live
    }
  })
}

async function scenarioS804(ctx) {
  await runCase('S8-04', 'status region semantics chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const state = await liveRegionState(opened.page)
      chk.eq(state.statusRole, 'status', 'status has role=status')
      chk.eq(state.statusLive, 'polite', 'status has aria-live=polite')
      chk.eq(state.liveRegions.length, 1, 'exactly one live region exists', state.liveRegions)
      chk.eq(await opened.page.getByRole('status').count(), 1, 'browser exposes exactly one status role')
      chk.eq(state.statusText, '', 'status starts empty')
      await writeJson(path.join(out, 'artifacts', 's8-04-live-region.json'), state)
      return state
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-04', 'copy success fixed message chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
      await gotoSite(opened.page, '/')
      await opened.page.click('#copy-svg')
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'SVG copied.')
      const state = await liveRegionState(opened.page)
      chk.eq(state.statusText, 'SVG copied.', 'copy success message is fixed')
      chk.eq(state.liveRegions.length, 1, 'copy success does not create a duplicate live region')
      chk.eq(await opened.page.getAttribute('#manual-panel', 'open'), null, 'copy success leaves fallback panel closed')
      await writeJson(path.join(out, 'artifacts', 's8-04-copy-success.json'), state)
      return state
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-04', 'clipboard fallback failure fixed message chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=clipboard-failure&style=ascii-face&size=128&name=Ada')
      await opened.page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => { throw new Error('s8 denied') } }
        })
      })
      await opened.page.click('#copy-svg')
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Clipboard unavailable. Copy the selected text below.')
      const state = await liveRegionState(opened.page)
      const panelOpen = await opened.page.getAttribute('#manual-panel', 'open')
      const active = await activeInfo(opened.page)
      const manualValue = await opened.page.inputValue('#manual-copy')
      const sourceValue = await opened.page.inputValue('#svg-source')
      chk.eq(state.statusText, 'Clipboard unavailable. Copy the selected text below.', 'clipboard failure has fixed message')
      chk.eq(panelOpen, '', 'clipboard failure opens manual-copy panel')
      chk.eq(active.id, 'manual-copy', 'clipboard failure focuses the manual textarea')
      chk.eq(manualValue, sourceValue, 'manual textarea contains the current SVG source')
      chk.eq(state.liveRegions.length, 1, 'clipboard failure does not duplicate the live region')
      await shot(opened.page, 's8-04-clipboard-fallback', 'error fallback', 'Clipboard failure message and manual-copy fallback', { fullPage: true })
      await writeJson(path.join(out, 'artifacts', 's8-04-clipboard-failure.json'), { state, panelOpen, active, manualLength: manualValue.length })
      return { state, panelOpen, active }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-04', 'download success fixed message chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=download-status&style=pixel-letter&size=192')
      const [download] = await Promise.all([
        opened.page.waitForEvent('download', { timeout: 10000 }),
        opened.page.click('#download-svg')
      ])
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'SVG downloaded.')
      const state = await liveRegionState(opened.page)
      chk.eq(download.suggestedFilename(), 'dither-face.svg', 'download produces expected filename')
      chk.eq(state.statusText, 'SVG downloaded.', 'download success message is fixed')
      chk.eq(state.liveRegions.length, 1, 'download success does not duplicate the live region')
      await writeJson(path.join(out, 'artifacts', 's8-04-download-success.json'), { state, filename: download.suggestedFilename() })
      return { state, filename: download.suggestedFilename() }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-04', 'render updates do not add noisy status chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await opened.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
      await gotoSite(opened.page, '/')
      await opened.page.click('#copy-svg')
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'SVG copied.')
      await opened.page.fill('#seed', 'render-update')
      await opened.page.waitForTimeout(200)
      const state = await liveRegionState(opened.page)
      chk.eq(state.statusText, '', 'render update clears the previous status')
      chk.eq(state.liveRegions.length, 1, 'render update keeps one live region')
      chk.eq(await opened.page.getAttribute('#preview', 'aria-label'), 'pixel sprite avatar preview', 'render update keeps the preview label')
      await writeJson(path.join(out, 'artifacts', 's8-04-render-update.json'), state)
      return state
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-04', 'synthetic download exception probe chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=download-failure')
      await opened.page.evaluate(() => {
        URL.createObjectURL = () => { throw new Error('s8 synthetic download failure') }
      })
      await opened.page.click('#download-svg')
      await opened.page.waitForTimeout(300)
      const state = await liveRegionState(opened.page)
      const errors = opened.logs.pageErrors
      chk.ok(errors.length > 0, 'synthetic download exception is observable as a page error', { errors })
      chk.note(`Synthetic download exception probe: status="${state.statusText ?? ''}", pageErrors=${errors.length}. This is reported as a limitation/observation, not as a passed fixed-failure-message contract.`)
      ctx.limitations.push({
        id: 'S8-L1-download-exception',
        text: 'A synthetic URL.createObjectURL exception produced no fixed download-failure status message; this edge is not part of the documented site contract and was not fixed in this stage. It is recorded rather than silently passed.'
      })
      await writeJson(path.join(out, 'artifacts', 's8-04-download-exception.json'), { state, errors, console: opened.logs.console })
      return { state, errors }
    } finally {
      await opened.context.close()
    }
  })

  scenarios['S8-04'].notes.push('Manual screen-reader speech verification is BLOCKED: no assistive technology is available in the Linux sandbox. Only live-region DOM/ARIA semantics were observed; no speech claim is made.')
  ctx.limitations.push({
    id: 'S8-L2-speech',
    text: 'No screen-reader speech verification was performed because no assistive technology is available. S8-04 reports DOM/ARIA semantics and explicitly blocks the manual speech subcheck; it does not claim that a screen reader announced anything.'
  })
}

async function setCdpViewport(page, width, height) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height
  })
  await page.waitForTimeout(250)
  return session
}

async function reflowSnapshot(page) {
  await installHelpers(page)
  return page.evaluate(() => {
    const helpers = window.__s8
    const clipped = []
    for (const element of document.querySelectorAll('body *')) {
      if (element.closest('svg')) continue
      const style = getComputedStyle(element)
      if (!['hidden', 'clip'].includes(style.overflowX) && !['hidden', 'clip'].includes(style.overflowY)) continue
      if (!helpers.visible(element)) continue
      if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
        clipped.push({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === 'string' ? element.className : null,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight
        })
      }
    }
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      visualViewportWidth: window.visualViewport?.width ?? null,
      visualViewportScale: window.visualViewport?.scale ?? null,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      clipped,
      textareaCount: document.querySelectorAll('textarea').length,
      controlCount: document.querySelectorAll('a[href],button,input,select,textarea,summary').length
    }
  })
}

async function assertReflow(page, chk, label) {
  const snapshot = await reflowSnapshot(page)
  chk.ok(!snapshot.horizontalOverflow, `${label}: no horizontal page overflow`, snapshot)
  chk.eq(snapshot.clipped.length, 0, `${label}: no hidden/clipped text content`, snapshot.clipped)
  chk.eq(await page.getByRole('status').count(), 1, `${label}: status remains present`)
  return snapshot
}

async function scenarioS805(ctx) {
  await runCase('S8-05', '200 percent layout equivalent chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=s8-zoom&style=pixel-landscape&size=192')
      const session = await setCdpViewport(opened.page, 640, 800)
      const snapshot = await assertReflow(opened.page, chk, '200% layout equivalent (640 CSS px)')
      chk.eq(snapshot.innerWidth, 640, 'CDP layout viewport is 640 CSS px')
      chk.eq(snapshot.visualViewportScale, 1, 'device metrics report scale 1; this is layout equivalence, not page-zoom scaling')
      await shot(opened.page, 's8-05-zoom-200-640', 'zoom sampling', '200% layout-viewport equivalent 640 CSS px', { fullPage: true })
      await writeJson(path.join(out, 'artifacts', 's8-05-zoom-200.json'), { snapshot, method: 'CDP Emulation.setDeviceMetricsOverride width=640, deviceScaleFactor=1; layout-viewport equivalence only' })
      await session.detach().catch(() => {})
      return snapshot
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-05', '400 percent layout equivalent 320 CSS px chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=s8-zoom&style=pixel-landscape&size=192')
      const session = await setCdpViewport(opened.page, 320, 800)
      const snapshot = await assertReflow(opened.page, chk, '400% layout equivalent (320 CSS px)')
      chk.eq(snapshot.innerWidth, 320, 'CDP layout viewport is 320 CSS px')
      chk.eq(snapshot.visualViewportScale, 1, 'device metrics report scale 1; this is layout equivalence, not page-zoom scaling')
      await shot(opened.page, 's8-05-narrow-320-400pct', 'zoom sampling', '400% layout-viewport equivalent 320 CSS px', { fullPage: true })
      await writeJson(path.join(out, 'artifacts', 's8-05-zoom-400.json'), { snapshot, method: 'CDP Emulation.setDeviceMetricsOverride width=320, deviceScaleFactor=1; layout-viewport equivalence only' })
      await session.detach().catch(() => {})
      return snapshot
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-05', '400 percent keyboard reach chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await setCdpViewport(opened.page, 320, 800)
      const expected = await assignFocusIndices(opened.page)
      const { sequence } = await tabTraverse(opened.page)
      const focused = sequence.filter(item => item.focusIndex !== null)
      const offscreen = focused.filter(item => item.rect.left < -1 || item.rect.right > 321)
      chk.eq(focused.length >= expected.length, true, 'all controls reachable by Tab at 320 CSS px', { focused: focused.length, expected: expected.length })
      chk.eq(offscreen.length, 0, 'focused controls remain horizontally within the 320 CSS px viewport', { offscreen })
      chk.ok(focused.every(item => item.visibleFocus), 'focused controls retain visible focus at 320 CSS px')
      await writeJson(path.join(out, 'artifacts', 's8-05-reflow-keyboard.json'), { expected, sequence })
      return { expected: expected.length, focused: focused.length, offscreen }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-05', 'synthetic 200 percent text enlargement chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await opened.page.evaluate(() => {
        for (const element of document.querySelectorAll('body *')) {
          if (element.closest('svg')) continue
          const size = Number.parseFloat(getComputedStyle(element).fontSize)
          if (size > 0) element.style.fontSize = `${size * 2}px`
        }
      })
      await opened.page.waitForTimeout(250)
      const snapshot = await assertReflow(opened.page, chk, 'synthetic 200% text enlargement')
      const controls = await opened.page.evaluate(() => Array.from(document.querySelectorAll('#seed, #name, #size, .actions button, .style-card, summary')).map(element => ({
        id: element.id || null,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        rect: element.getBoundingClientRect().toJSON()
      })))
      chk.ok(controls.every(item => item.rect.width > 0 && item.rect.height > 0), 'controls remain rendered after text enlargement', { controls })
      await shot(opened.page, 's8-05-text-200pct', 'text enlargement', 'Synthetic 200% text enlargement stress test', { fullPage: true })
      await writeJson(path.join(out, 'artifacts', 's8-05-text-enlargement.json'), {
        snapshot,
        controls,
        method: 'Synthetic text-only stress: every text-bearing element font-size doubled in CSS; this is not a native browser text-zoom claim.'
      })
      return { snapshot, controls }
    } finally {
      await opened.context.close()
    }
  })

  for (const browserName of ['firefox', 'webkit']) {
    await runCase('S8-05', `narrow reflow ${browserName} 320 CSS px`, async chk => {
      const opened = await openPage(ctx.browsers[browserName], { viewport: { width: 320, height: 800 } })
      try {
        await gotoSite(opened.page, '/?seed=s8-reflow&style=ascii-field&size=192')
        const snapshot = await assertReflow(opened.page, chk, `${browserName} narrow 320 CSS px`)
        chk.eq(snapshot.innerWidth, 320, `${browserName}: viewport is 320 CSS px`)
        const seed = await tabUntil(opened.page, item => item.id === 'seed')
        chk.eq(seed.id, 'seed', `${browserName}: seed is keyboard reachable at 320 CSS px`)
        chk.ok(seed.visibleFocus, `${browserName}: seed focus is visible at 320 CSS px`)
        await writeJson(path.join(out, 'artifacts', `s8-05-narrow-${browserName}.json`), { snapshot, seed })
        return { snapshot, seed }
      } finally {
        await opened.context.close()
      }
    })
  }

  await runCase('S8-05', 'pinch zoom diagnostic chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const session = await setCdpViewport(opened.page, 1280, 800)
      await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 4 })
      await opened.page.waitForTimeout(200)
      const snapshot = await opened.page.evaluate(() => ({
        innerWidth: window.innerWidth,
        visualViewportWidth: window.visualViewport?.width ?? null,
        visualViewportScale: window.visualViewport?.scale ?? null,
        scrollWidth: document.documentElement.scrollWidth
      }))
      chk.eq(snapshot.innerWidth, 1280, 'pinch zoom leaves the layout viewport unchanged')
      chk.note(`Pinch visualViewport scale observed: ${snapshot.visualViewportScale}. This is recorded only as a non-reflow diagnostic; it is not used for the WCAG reflow claim. The 320/640 CSS-px device-metrics runs are the layout equivalences.`)
      await writeJson(path.join(out, 'artifacts', 's8-05-pinch-diagnostic.json'), snapshot)
      await session.detach().catch(() => {})
      return snapshot
    } finally {
      await opened.context.close()
    }
  })
}

async function measureTargets(page) {
  await installHelpers(page)
  return page.evaluate(() => {
    const helpers = window.__s8
    const elements = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,summary'))
      .filter(element => !element.disabled && helpers.visible(element))
    const targets = elements.map((element, index) => {
      const rect = element.getBoundingClientRect()
      const text = (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim()
      const inlineContainer = element.tagName === 'A' ? element.closest('p,li,article') : null
      const inlineException = Boolean(inlineContainer && inlineContainer.textContent.trim().length > text.length + 8)
      return {
        index,
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        text: text.slice(0, 80),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        inlineException
      }
    })
    for (const target of targets) {
      let nearest = Infinity
      for (const other of targets) {
        if (other.index === target.index) continue
        const distance = Math.hypot(target.centerX - other.centerX, target.centerY - other.centerY)
        if (distance < nearest) nearest = distance
      }
      target.nearestCenterDistance = Math.round(nearest * 10) / 10
      target.minimumPass = target.width >= 24 && target.height >= 24
      target.spacingException = !target.minimumPass && nearest >= 24
      target.preferredPass = target.width >= 44 && target.height >= 44
      target.minimumPassWithException = target.minimumPass || target.inlineException || target.spacingException
    }
    return {
      count: targets.length,
      preferred: targets.filter(target => target.preferredPass).length,
      minimumWithException: targets.filter(target => target.minimumPassWithException).length,
      minViolations: targets.filter(target => !target.minimumPassWithException),
      targets
    }
  })
}

async function scenarioS806(ctx) {
  const viewports = [
    ['360 portrait', { width: 360, height: 800 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
    ['360 short portrait', { width: 360, height: 640 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
    ['390 portrait', { width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
    ['390 landscape', { width: 844, height: 390 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
    ['768 portrait', { width: 768, height: 1024 }, { hasTouch: true, isMobile: false, deviceScaleFactor: 1 }],
    ['768 landscape', { width: 1024, height: 768 }, { hasTouch: true, isMobile: false, deviceScaleFactor: 1 }],
    ['desktop 1280', { width: 1280, height: 800 }, {}]
  ]
  for (const [name, viewport, extra] of viewports) {
    await runCase('S8-06', `targets and layout ${name}`, async chk => {
      const opened = await openPage(ctx.browsers.chromium, { viewport, ...extra })
      try {
        await gotoSite(opened.page, '/?seed=s8-mobile&style=pixel-sprite&size=192&name=Ada')
        const snapshot = await reflowSnapshot(opened.page)
        const targets = await measureTargets(opened.page)
        chk.eq(snapshot.innerWidth, viewport.width, `${name}: CSS viewport width is ${viewport.width}`)
        chk.ok(!snapshot.horizontalOverflow, `${name}: no horizontal page overflow`, snapshot)
        chk.eq(targets.minViolations.length, 0, `${name}: every target meets 24x24 or an exception`, targets.minViolations)
        chk.ok(targets.preferred >= 8, `${name}: at least eight primary/control targets are 44x44 preferred`, { preferred: targets.preferred, count: targets.count })
        chk.eq(await opened.page.getAttribute('#preview svg', 'width'), '192', `${name}: selected 192 px avatar is rendered`)
        chk.eq(await opened.page.getAttribute('#preview svg', 'height'), '192', `${name}: selected avatar height is 192`)
        await shot(opened.page, `s8-06-viewport-${name.replace(/\s+/g, '-')}`, 'viewport visual sample', `${name} layout and target inspection`, { fullPage: true })
        await writeJson(path.join(out, 'artifacts', `s8-06-targets-${name.replace(/\s+/g, '-')}.json`), { snapshot, targets })
        return { snapshot, targets: { count: targets.count, preferred: targets.preferred, minViolations: targets.minViolations } }
      } finally {
        await opened.context.close()
      }
    })
  }

  await runCase('S8-06', 'all eight styles selected at 360 px', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    try {
      const results = []
      for (const style of ['pixel-sprite', 'pixel-letter', 'dither-orb', 'pixel-landscape', 'ascii-letter', 'ascii-field', 'ascii-face', 'pixelify-letter']) {
        await gotoSite(opened.page, `/?seed=s8-style-${style}&style=${style}&size=192&name=Ada`)
        const snapshot = await reflowSnapshot(opened.page)
        const preview = await opened.page.locator('#preview').boundingBox()
        const svg = await opened.page.locator('#preview svg').boundingBox()
        const title = await opened.page.textContent('#selected-title')
        const note = await opened.page.textContent('#selected-note')
        const pressed = await opened.page.getAttribute(`[data-style="${style}"]`, 'aria-pressed')
        chk.ok(preview && Math.round(preview.width) === 192 && Math.round(preview.height) === 192, `${style}: preview box is 192x192`, { preview })
        chk.ok(svg && Math.round(svg.width) === 192 && Math.round(svg.height) === 192, `${style}: avatar is 192x192`, { svg })
        chk.ok(!snapshot.horizontalOverflow, `${style}: no horizontal overflow at 360 px`, snapshot)
        chk.eq(pressed, 'true', `${style}: style button is selected`)
        chk.ok(Boolean(title && note && note.length > 0), `${style}: selected title and note are visible`, { title, note })
        await shot(opened.page, `s8-06-style-${style}-360`, 'style visual sample', `${style} selected at 360 px with 192 px avatar`, { selector: '.preview-card' })
        results.push({ style, preview, svg, title, noteLength: note?.length ?? 0, pressed })
      }
      chk.eq(results.length, 8, 'all eight styles selected and sampled')
      await writeJson(path.join(out, 'artifacts', 's8-06-all-styles-360.json'), results)
      return { results }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-06', 'long-source clipboard fallback 360 px', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    try {
      const longSeed = `s8-long-${'x'.repeat(600)}`
      await gotoSite(opened.page, `/?seed=${encodeURIComponent(longSeed)}&style=pixelify-letter&size=192`)
      await opened.page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => { throw new Error('s8 denied') } }
        })
      })
      await opened.page.click('#copy-svg')
      await opened.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Clipboard unavailable. Copy the selected text below.')
      const snapshot = await reflowSnapshot(opened.page)
      const manualLength = (await opened.page.inputValue('#manual-copy')).length
      const manualBox = await opened.page.locator('#manual-copy').boundingBox()
      chk.ok(!snapshot.horizontalOverflow, 'long-source fallback: no horizontal page overflow', snapshot)
      chk.ok(manualLength > 1000, 'long-source fallback: manual textarea contains the long source', { manualLength })
      chk.ok(manualBox && manualBox.width <= 360, 'long-source fallback: textarea fits the narrow viewport', { manualBox })
      chk.eq(await opened.page.getAttribute('#manual-panel', 'open'), '', 'long-source fallback: manual panel is open')
      await shot(opened.page, 's8-06-long-source-fallback', 'error fallback', 'Long source clipboard fallback at 360 px', { fullPage: true })
      await writeJson(path.join(out, 'artifacts', 's8-06-long-source.json'), { snapshot, manualLength, manualBox })
      return { snapshot, manualLength, manualBox }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-06', 'keyboard overlay emulation 360x400', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 360, height: 400 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    try {
      await gotoSite(opened.page, '/?seed=s8-keyboard-overlay')
      const expected = await assignFocusIndices(opened.page)
      const seed = await tabUntil(opened.page, item => item.id === 'seed')
      const snapshot = await reflowSnapshot(opened.page)
      chk.ok(!snapshot.horizontalOverflow, 'keyboard-overlay emulation: no horizontal overflow', snapshot)
      chk.ok(seed.rect.bottom <= 401, 'keyboard-overlay emulation: focused seed remains within the short viewport', { seed, expected: expected.length })
      chk.ok(seed.visibleFocus, 'keyboard-overlay emulation: focus remains visible')
      chk.note('Short-viewport emulation only: no real virtual keyboard was present, so overlap/scroll behaviour under a native mobile keyboard is not claimed.')
      await shot(opened.page, 's8-06-keyboard-overlay-emulation', 'mobile keyboard emulation', 'Short 360x400 viewport with focused seed (emulation only)', { fullPage: false })
      await writeJson(path.join(out, 'artifacts', 's8-06-keyboard-overlay.json'), { seed, snapshot })
      ctx.limitations.push({
        id: 'S8-L3-virtual-keyboard',
        text: 'Mobile virtual-keyboard behaviour was approximated with a 360x400 short viewport. No native mobile keyboard was available; overlap/occlusion under a real keyboard is not claimed.'
      })
      return { seed, snapshot }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-06', 'mobile Chromium Pixel 7 representative', async chk => {
    const pixel7 = ctx.devices['Pixel 7']
    const opened = await openPage(ctx.browsers.chromium, {
      viewport: pixel7.viewport,
      userAgent: pixel7.userAgent,
      deviceScaleFactor: pixel7.deviceScaleFactor,
      isMobile: pixel7.isMobile,
      hasTouch: pixel7.hasTouch
    })
    try {
      await gotoSite(opened.page, '/?seed=s8-pixel7&style=ascii-letter&size=192&name=Ada')
      const snapshot = await reflowSnapshot(opened.page)
      const targets = await measureTargets(opened.page)
      chk.ok(!snapshot.horizontalOverflow, 'Pixel 7 emulation: no horizontal overflow', snapshot)
      chk.eq(targets.minViolations.length, 0, 'Pixel 7 emulation: target minimum passes', targets.minViolations)
      chk.eq(await opened.page.getAttribute('#preview svg', 'width'), '192', 'Pixel 7 emulation: 192 px avatar renders')
      await shot(opened.page, 's8-06-pixel7', 'mobile visual sample', 'Mobile Chromium Pixel 7 emulation', { fullPage: true })
      await writeJson(path.join(out, 'artifacts', 's8-06-pixel7.json'), { snapshot, targets })
      ctx.limitations.push({
        id: 'S8-L4-touch-emulation',
        text: 'Mobile results use Chromium device emulation (touch, mobile viewport, deviceScaleFactor). No physical mobile device was available; screenshots and target measurements are inspected outcomes, not pixel baselines or a hardware claim.'
      })
      return { snapshot, targets: targets.count }
    } finally {
      await opened.context.close()
    }
  })
}

async function collectTextContrast(page) {
  await installHelpers(page)
  return page.evaluate(() => {
    const helpers = window.__s8
    const failures = []
    let measured = 0
    const largeSamples = []
    for (const element of document.querySelectorAll('body *')) {
      if (element.closest('svg')) continue
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'TEXTAREA', 'INPUT', 'SELECT'].includes(element.tagName)) continue
      if (element.closest('[aria-hidden="true"]')) continue
      if (!helpers.visible(element)) continue
      const text = helpers.textOf(element)
      if (!text) continue
      const style = getComputedStyle(element)
      const background = helpers.backgroundColor(element)
      const foreground = helpers.composite(helpers.parseColor(style.color), background)
      const ratio = helpers.contrast(foreground, background)
      const fontSize = Number.parseFloat(style.fontSize)
      const weight = Number.parseInt(style.fontWeight, 10) || 400
      const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700)
      const required = large ? 3 : 4.5
      measured += 1
      if (large) largeSamples.push({ text: text.slice(0, 60), fontSize, weight, ratio, required })
      if (ratio < required - 0.01) {
        failures.push({
          kind: 'text',
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === 'string' ? element.className : null,
          text: text.slice(0, 100),
          fontSize,
          weight,
          large,
          required,
          ratio: Math.round(ratio * 100) / 100,
          color: style.color,
          background: helpers.rgbString(background)
        })
      }
    }
    const placeholders = []
    for (const input of document.querySelectorAll('input[placeholder]')) {
      if (!helpers.visible(input)) continue
      const style = getComputedStyle(input, '::placeholder')
      const background = helpers.backgroundColor(input)
      const foreground = helpers.composite(helpers.parseColor(style.color), background)
      const ratio = helpers.contrast(foreground, background)
      const record = {
        id: input.id || null,
        placeholder: input.getAttribute('placeholder'),
        color: style.color,
        background: helpers.rgbString(background),
        ratio: Math.round(ratio * 100) / 100,
        required: 4.5
      }
      placeholders.push(record)
      if (ratio < 4.4) failures.push({ kind: 'placeholder', ...record })
    }
    const controls = []
    for (const element of document.querySelectorAll('input:not([type="hidden"]),select,textarea,button')) {
      if (!helpers.visible(element)) continue
      const style = getComputedStyle(element)
      const background = helpers.backgroundColor(element)
      const parentBackground = helpers.backgroundColor(element.parentElement)
      const borderWidth = Number.parseFloat(style.borderTopWidth) || 0
      const borderApplied = style.borderTopStyle !== 'none' && borderWidth > 0
      const border = borderApplied ? helpers.composite(helpers.parseColor(style.borderTopColor), parentBackground) : null
      const borderContrast = border ? helpers.contrast(border, parentBackground) : 0
      const backgroundContrast = helpers.contrast(background, parentBackground)
      const best = Math.max(borderContrast, backgroundContrast)
      const record = {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className : null,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        borderStyle: style.borderTopStyle,
        borderWidth,
        borderColor: style.borderTopColor,
        background: helpers.rgbString(background),
        parentBackground: helpers.rgbString(parentBackground),
        borderContrast: Math.round(borderContrast * 100) / 100,
        backgroundContrast: Math.round(backgroundContrast * 100) / 100,
        required: 3,
        pass: best >= 3
      }
      controls.push(record)
      if (!record.pass) failures.push({ kind: 'control-boundary', ...record })
    }
    const summary = []
    for (const element of document.querySelectorAll('summary')) {
      if (!helpers.visible(element)) continue
      const style = getComputedStyle(element)
      summary.push({
        id: element.id || null,
        text: (element.textContent || '').trim(),
        borderStyle: style.borderTopStyle,
        borderWidth: style.borderTopWidth,
        background: style.backgroundColor,
        note: 'native disclosure marker; not scored as an author-drawn boundary here'
      })
    }
    return { measured, failures, placeholders, controls, summary, largeSamples: largeSamples.slice(0, 20) }
  })
}

async function collectFocusContrast(page) {
  await installHelpers(page)
  await assignFocusIndices(page)
  const { sequence } = await tabTraverse(page)
  const focused = sequence.filter(item => item.focusIndex !== null)
  return focused.map(item => ({
    focusIndex: item.focusIndex,
    tag: item.tag,
    id: item.id,
    text: item.text,
    outlineStyle: item.outlineStyle,
    outlineWidth: item.outlineWidth,
    outlineOffset: item.outlineOffset,
    outlineColor: item.outlineColor,
    contrast: Math.round(item.outlineContrast * 100) / 100,
    visibleFocus: item.visibleFocus,
    pass: item.outlineWidth >= 2 && item.outlineContrast >= 3
  }))
}

async function scenarioS807(ctx) {
  await runCase('S8-07', 'text contrast chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/?seed=s8-contrast&style=ascii-letter&size=192&name=Ada')
      await opened.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
      const result = await collectTextContrast(opened.page)
      const textFailures = result.failures.filter(failure => failure.kind !== 'control-boundary')
      chk.eq(textFailures.length, 0, 'all measured text meets WCAG AA contrast', textFailures)
      chk.ok(result.measured > 20, 'text contrast measurement covered the page', { measured: result.measured })
      chk.note(`placeholder measurements: ${JSON.stringify(result.placeholders)}`)
      await writeJson(path.join(out, 'artifacts', 's8-07-text-contrast.json'), result)
      return { measured: result.measured, failures: textFailures, placeholders: result.placeholders }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-07', 'control boundary contrast chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      await opened.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
      const result = await collectTextContrast(opened.page)
      const boundaryFailures = result.failures.filter(failure => failure.kind === 'control-boundary')
      chk.eq(boundaryFailures.length, 0, 'every measured control boundary is 3:1 against adjacent background', boundaryFailures)
      chk.ok(result.controls.length > 8, 'control boundary measurement covered the controls', { count: result.controls.length })
      await writeJson(path.join(out, 'artifacts', 's8-07-control-boundaries.json'), result)
      return { controls: result.controls.length, failures: boundaryFailures }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-07', 'focus and selected state chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const focus = await collectFocusContrast(opened.page)
      chk.ok(focus.length >= 20, 'keyboard focus contrast covered all controls', { count: focus.length })
      chk.eq(focus.filter(item => !item.pass).length, 0, 'every keyboard focus indicator is at least 2px and 3:1', focus.filter(item => !item.pass))
      const selected = await opened.page.evaluate(() => {
        const helpers = window.__s8
        const selectedElement = document.querySelector('.style-card[aria-pressed="true"]')
        const other = document.querySelector('.style-card[aria-pressed="false"]')
        const style = getComputedStyle(selectedElement)
        const parentBackground = helpers.backgroundColor(selectedElement.parentElement)
        const background = helpers.backgroundColor(selectedElement)
        const outline = helpers.parseColor(style.outlineColor)
        const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
        return {
          ariaPressed: selectedElement.getAttribute('aria-pressed'),
          outlineStyle: style.outlineStyle,
          outlineWidth,
          outlineOffset: style.outlineOffset,
          outlineContrast: Math.round(helpers.contrast(helpers.composite(outline, background), background) * 100) / 100,
          backgroundContrast: Math.round(helpers.contrast(background, parentBackground) * 100) / 100,
          otherOutlineWidth: Number.parseFloat(getComputedStyle(other).outlineWidth) || 0,
          usesAria: selectedElement.getAttribute('aria-pressed') === 'true'
        }
      })
      chk.eq(selected.ariaPressed, 'true', 'selected style exposes aria-pressed=true')
      chk.ok(selected.outlineWidth >= 2 && selected.outlineContrast >= 3, 'selected state has a 2px 3:1 outline', selected)
      chk.ok(selected.otherOutlineWidth < 2, 'unselected style does not share the selected outline', selected)
      const selectedFocus = await tabUntil(opened.page, item => item.tag === 'button' && item.text.startsWith('Select pixel sprite'))
      chk.ok(selectedFocus.visibleFocus, 'selected style also receives a visible keyboard focus indicator')
      await shot(opened.page, 's8-07-selected-focus', 'contrast sample', 'Selected style and keyboard focus indicator', { fullPage: false })
      await writeJson(path.join(out, 'artifacts', 's8-07-focus-selected.json'), { focus, selected, selectedFocus })
      return { focusFailures: focus.filter(item => !item.pass), selected }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-07', 'forced colors chromium', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 }, forcedColors: 'active' })
    try {
      await gotoSite(opened.page, '/?seed=s8-forced&style=ascii-face&size=192')
      await installHelpers(opened.page)
      const before = await opened.page.evaluate(() => {
        const helpers = window.__s8
        const input = document.querySelector('#seed')
        const style = getComputedStyle(input)
        const background = helpers.backgroundColor(input)
        const parentBackground = helpers.backgroundColor(input.parentElement)
        const border = helpers.composite(helpers.parseColor(style.borderTopColor), parentBackground)
        return {
          forcedColors: matchMedia('(forced-colors: active)').matches,
          borderStyle: style.borderTopStyle,
          borderWidth: style.borderTopWidth,
          borderColor: style.borderTopColor,
          borderContrast: Math.round(helpers.contrast(border, parentBackground) * 100) / 100,
          background: helpers.rgbString(background),
          parentBackground: helpers.rgbString(parentBackground)
        }
      })
      chk.eq(before.forcedColors, true, 'forced-colors media query is active')
      chk.ok(before.borderStyle !== 'none' && Number.parseFloat(before.borderWidth) > 0, 'input boundary remains present in forced colors', before)
      chk.ok(before.borderContrast >= 3, 'input boundary contrast is at least 3:1 in forced colors', before)
      await shot(opened.page, 's8-07-forced-colors-default', 'forced colors', 'Forced-colors default state with system boundaries', { fullPage: true })
      const copy = await tabUntil(opened.page, item => item.id === 'copy-svg')
      const focus = await activeInfo(opened.page)
      await tabUntil(opened.page, item => item.tag === 'button' && item.text.startsWith('Select '))
      await opened.page.keyboard.press('Space')
      await opened.page.waitForTimeout(100)
      const selected = await opened.page.evaluate(() => {
        const element = document.querySelector('.style-card[aria-pressed="true"]')
        const helpers = window.__s8
        const style = getComputedStyle(element)
        const background = helpers.backgroundColor(element)
        const outline = helpers.parseColor(style.outlineColor)
        return {
          ariaPressed: element.getAttribute('aria-pressed'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
          outlineContrast: Math.round(helpers.contrast(helpers.composite(outline, background), background) * 100) / 100,
          background: helpers.rgbString(background)
        }
      })
      chk.eq(selected.ariaPressed, 'true', 'forced colors selected state exposes aria-pressed')
      chk.ok(selected.outlineWidth >= 2, 'forced colors selected state has a non-colour outline cue', selected)
      chk.ok(focus.outlineWidth >= 2 && focus.outlineContrast >= 3, 'forced colors focus remains visible with 3:1', focus)
      await opened.page.keyboard.press('Tab')
      await opened.page.waitForTimeout(100)
      await shot(opened.page, 's8-07-forced-colors-focus-selected', 'forced colors', 'Forced-colors focused and selected style state', { fullPage: false })
      await writeJson(path.join(out, 'artifacts', 's8-07-forced-colors.json'), { before, copy, focus, selected, console: opened.logs.console })
      return { before, focus, selected }
    } finally {
      await opened.context.close()
    }
  })

  await runCase('S8-07', 'contrast checker negative control', async chk => {
    const opened = await openPage(ctx.browsers.chromium, { viewport: { width: 800, height: 600 } })
    try {
      const html = await fsp.readFile(path.join(fixtures, 'fixtures/negative-axe.html'), 'utf8')
      await opened.page.setContent(html, { waitUntil: 'load' })
      const result = await collectTextContrast(opened.page)
      const failures = result.failures.filter(failure => failure.kind === 'text')
      chk.ok(failures.some(failure => failure.text.includes('intentionally far below')), 'same contrast checker detects the low-contrast negative control', failures)
      chk.ok(failures.every(failure => failure.ratio < failure.required), 'negative control failures are below their required ratio', failures)
      const siteOpened = await openPage(ctx.browsers.chromium, { viewport: { width: 1280, height: 800 } })
      try {
        await gotoSite(siteOpened.page, '/')
        await siteOpened.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
        const siteResult = await collectTextContrast(siteOpened.page)
        const siteTextFailures = siteResult.failures.filter(failure => failure.kind !== 'control-boundary')
        chk.eq(siteTextFailures.length, 0, 'clean site text passes the same contrast checker', siteTextFailures)
        negativeControls.push({
          id: 'S8-NC3-contrast',
          required: true,
          detected: failures.length > 0,
          cleanPositivePasses: siteTextFailures.length === 0,
          evidence: 'artifacts/s8-07-text-contrast.json; artifacts/s8-07-negative-contrast.json',
          detail: { negativeFailures: failures.length, cleanSiteTextFailures: siteTextFailures.length }
        })
        await writeJson(path.join(out, 'artifacts', 's8-07-negative-contrast.json'), { negative: result, cleanSiteTextFailures })
      } finally {
        await siteOpened.context.close()
      }
      return { failures }
    } finally {
      await opened.context.close()
    }
  })

  scenarios['S8-07'].notes.push('WCAG thresholds applied: 4.5:1 normal text, 3:1 large text (>=24 px normal or >=18.66 px bold), 3:1 control boundaries and focus indicators, 2 px minimum focus indicator thickness. Border contrast was measured against the adjacent parent background; focus outline contrast uses the outside background when outline-offset is positive.')
}

async function collectMotion(page) {
  await installHelpers(page)
  return page.evaluate(() => {
    function durationValues(value) {
      return String(value || '0s').split(',').map(part => part.trim()).map(part => {
        if (part.endsWith('ms')) return Number.parseFloat(part)
        if (part.endsWith('s')) return Number.parseFloat(part) * 1000
        return Number.parseFloat(part) || 0
      })
    }
    const animations = []
    const transitions = []
    const scrollBehaviors = []
    const inspect = (element, pseudo) => {
      const style = getComputedStyle(element, pseudo)
      const label = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${pseudo || ''}`
      const durations = durationValues(style.animationDuration)
      if (style.animationName !== 'none' && durations.some(value => value > 0)) {
        animations.push({ element: label, name: style.animationName, duration: style.animationDuration })
      }
      const transitionDurations = durationValues(style.transitionDuration)
      if (transitionDurations.some(value => value > 0)) {
        transitions.push({ element: label, duration: style.transitionDuration, property: style.transitionProperty })
      }
      if (style.scrollBehavior && style.scrollBehavior !== 'auto') {
        scrollBehaviors.push({ element: label, behavior: style.scrollBehavior })
      }
    }
    for (const element of document.querySelectorAll('*')) {
      inspect(element, null)
      inspect(element, '::before')
      inspect(element, '::after')
    }
    return {
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationCount: animations.length,
      transitionCount: transitions.length,
      scrollBehaviors,
      animations: animations.slice(0, 30),
      transitions: transitions.slice(0, 30)
    }
  })
}

async function scenarioS808(ctx) {
  for (const browserName of ['chromium', 'firefox', 'webkit']) {
    await runCase('S8-08', `reduced motion ${browserName}`, async chk => {
      const opened = await openPage(ctx.browsers[browserName], { viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' })
      try {
        await gotoSite(opened.page, '/?seed=s8-motion&style=dither-orb&size=192')
        const baseline = await collectMotion(opened.page)
        await opened.page.emulateMedia({ reducedMotion: 'reduce' })
        await opened.page.waitForTimeout(100)
        const reduced = await collectMotion(opened.page)
        chk.eq(reduced.reduce, true, `${browserName}: prefers-reduced-motion reduce is active`)
        chk.eq(reduced.animationCount, 0, `${browserName}: no non-essential animation under reduce`, reduced.animations)
        chk.eq(reduced.transitionCount, 0, `${browserName}: no non-essential transition under reduce`, reduced.transitions)
        chk.ok(reduced.scrollBehaviors.length === 0, `${browserName}: no non-auto scroll-behavior under reduce`, reduced.scrollBehaviors)
        chk.note(`baseline animations=${baseline.animationCount}, transitions=${baseline.transitionCount}; reduced animations=${reduced.animationCount}, transitions=${reduced.transitionCount}`)
        await writeJson(path.join(out, 'artifacts', `s8-08-reduced-motion-${browserName}.json`), { baseline, reduced })
        return { baseline, reduced }
      } finally {
        await opened.context.close()
      }
    })
  }
  scenarios['S8-08'].notes.push('The no-preference baseline is compared and the computed styles are recorded; no animation was invented to suppress. Screenshots are not the motion evidence.')
}

async function scenarioS809(ctx) {
  await runCase('S8-09', 'native Safari availability check', async chk => {
    const opened = await openPage(ctx.browsers.webkit, { viewport: { width: 1280, height: 800 } })
    try {
      await gotoSite(opened.page, '/')
      const userAgent = await opened.page.evaluate(() => navigator.userAgent)
      const platform = process.platform
      chk.eq(platform, 'linux', 'sandbox platform is Linux, not macOS')
      chk.note(`WebKit user agent recorded for transparency: ${userAgent}`)
      chk.note('S8-09 remains BLOCKED: no native macOS Safari is available in the Linux sandbox. Playwright WebKit is supplementary only and is not a substitute.')
      await writeJson(path.join(out, 'artifacts', 's8-09-native-safari.json'), {
        status: 'BLOCKED',
        platform,
        webkitVersion: ctx.browserVersions.webkit,
        userAgent,
        nativeSafariAvailable: false,
        reason: 'Native Safari/macOS unavailable; Linux WebKit does not substitute.',
        webkitSupplemental: 'Playwright Linux WebKit was exercised as a supplementary engine only.'
      })
      return { platform, userAgent, nativeSafariAvailable: false }
    } finally {
      await opened.context.close()
    }
  }, { status: 'BLOCKED' })
  ctx.limitations.push({
    id: 'S8-L5-native-safari',
    text: 'S8-09 remains BLOCKED. No native macOS Safari is available; Playwright Linux WebKit is not Safari and no native-Safari PASS is claimed or waived.'
  })
}

async function main() {
  await fsp.mkdir(out, { recursive: true })
  await fsp.mkdir(work, { recursive: true })
  await fsp.mkdir(path.join(out, 'logs'), { recursive: true })
  await fsp.mkdir(path.join(out, 'artifacts'), { recursive: true })
  await fsp.mkdir(path.join(out, 'screenshots'), { recursive: true })
  await fsp.mkdir(path.join(out, 'reports'), { recursive: true })

  if (phase === 'prepare') await phasePrepare()
  else if (phase === 'build') await phaseBuild()
  else await phaseTest()

  const counts = await readJson(path.join(out, 'results.json')).then(result => result.totals).catch(() => null)
  phaseRecord = {
    ...phaseRecord,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - phaseStarted,
    activeBudgetSeconds,
    perCommandTimeoutSeconds,
    exit: { ok: true, code: 0 },
    steps,
    ...(counts ? { totals: counts } : {})
  }
  await writeJson(path.join(out, `phase-${phase}.json`), phaseRecord)
  log(`${phase} phase complete: ${phaseRecord.durationMs}ms`)
}

try {
  await main()
} catch (error) {
  phaseRecord = {
    ...phaseRecord,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - phaseStarted,
    activeBudgetSeconds,
    perCommandTimeoutSeconds,
    exit: { ok: false, code: 1, error: error.stack || String(error) },
    steps
  }
  await writeJson(path.join(out, `phase-${phase}.json`), phaseRecord)
  console.error(error)
  process.exitCode = 1
}
