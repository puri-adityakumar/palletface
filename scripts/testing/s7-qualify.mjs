#!/usr/bin/env node
/**
 * Stage 7 qualification harness: security, privacy, and resource abuse.
 *
 * This is a test instrument, not a product change. It installs the approved
 * tarball into a disposable consumer outside the repository, builds the site
 * from tracked source, starts only loopback servers, drives Chromium, and
 * writes raw evidence under the ignored out/qualification/S7 tree.
 *
 * Phases are sequential and never resumed:
 *   prepare -> install -> test
 *
 * Coverage: S7-01 SVG injection, S7-02 UI injection, S7-03 strict CSP,
 * S7-04 referrer/privacy, S7-05 network behavior, S7-06 secrets/excluded
 * data, S7-07 extreme inputs, and S7-08 resource limits.
 *
 * Trust boundary: rect/disc/asciiGrid accept trusted colors, ids and SVG
 * fragments and are not sanitizers. S7-01 records that documented behaviour
 * rather than misclassifying it as a vulnerability.
 */
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
function arg(name, fallback = null) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

const repo = path.resolve(arg('--repo', process.cwd()))
const outDir = path.resolve(arg('--out', path.join(repo, 'out/qualification/S7')))
const workDir = path.resolve(arg('--work', path.join(outDir, 'work')))
const fixturesDir = path.resolve(arg('--fixtures', path.join(repo, 'tests/qualification/s7')))
const expectedPath = path.resolve(arg('--expected', path.join(fixturesDir, 'expected-results.json')))
const goldenPath = path.resolve(arg('--golden', path.join(repo, 'tests/qualification/s3/fixtures/golden.json')))
const allowlistPath = path.resolve(arg('--allowlist', path.join(repo, 'tests/qualification/s3/tarball-allowlist.json')))
const payloadsPath = path.resolve(arg('--payloads', path.join(fixturesDir, 'fixtures/injection-payloads.json')))
const patternsPath = path.resolve(arg('--patterns', path.join(fixturesDir, 'secret-patterns.json')))
const toolsLockPath = path.resolve(arg('--tools-lock', path.join(fixturesDir, 'tools/package-lock.json')))
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
const allowlistShaArg = arg('--allowlist-sha', null)
const payloadsShaArg = arg('--payloads-sha', null)
const patternsShaArg = arg('--patterns-sha', null)
const toolsLockShaArg = arg('--tools-lock-sha', null)

const logsDir = path.join(outDir, 'logs')
const artifactsDir = path.join(outDir, 'artifacts')
const screenshotsDir = path.join(outDir, 'screenshots')
const consumerDir = path.join(workDir, 'consumer')
const extractedPackageDir = path.join(workDir, 'package-extracted')
const probesDir = path.join(workDir, 'probes')
const toolsDir = path.join(fixturesDir, 'tools')
const browsersPath = path.join(workDir, 'pw-browsers')
const siteDir = path.join(repo, 'dist-site')
const siteOrigin = 'http://127.0.0.1:4173'

const perCommandMs = 600_000
const commandLog = []
const childHeapMb = 256
const childTimeoutMs = 10_000
const batchDeadlineMs = 8_000
const extremeSeedLength = 1_048_576

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
const baseEnv = {
  ...process.env,
  CI: '1',
  NO_UPDATE_NOTIFIER: '1',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  PLAYWRIGHT_BROWSERS_PATH: browsersPath,
}
for (const name of [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
]) {
  delete baseEnv[name]
}

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
function isLocalUrl(url, extraOrigins = []) {
  return (
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('http://localhost') ||
    url.startsWith('file://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    extraOrigins.some((origin) => url.startsWith(origin))
  )
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
  commandLog.push(record)
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

async function waitForHttp(url, { timeoutMs = 90_000 } = {}) {
  const started = Date.now()
  let lastError = null
  let lastStatus = null
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' })
      lastStatus = response.status
      if (response.ok) return response
    } catch (error) {
      lastError = error.message
    }
    await sleep(250)
  }
  throw new Error(`HTTP wait failed for ${url} after ${timeoutMs}ms: status=${lastStatus} error=${lastError}`)
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
    if (!condition) this.failures.push({ case: this.currentCase, label, detail })
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
      detail: { message: error?.message ?? String(error), stack: String(error?.stack ?? error).slice(0, 2000) },
    })
  }
  finish() {
    return {
      id: this.id,
      title: this.title,
      expectedStatus: 'PASS',
      actualStatus: this.failures.length === 0 && this.cases > 0 ? 'PASS' : 'FAIL',
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

async function loadInstalledPackage() {
  const consumerPackageJson = path.join(consumerDir, 'package.json')
  const requireFromConsumer = createRequire(consumerPackageJson)
  const entry = requireFromConsumer.resolve('dither-face')
  const resolved = await fsp.realpath(entry)
  const pkg = await import(pathToFileURL(resolved).href)
  return { entry, resolved, pkg, consumerPackageJson }
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
    return { index: length, reason: 'length-difference', expectedLength: expected.length, actualLength: actual.length }
  }
  return null
}

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

const allowedSvgElements = new Set(['svg', 'defs', 'clippath', 'circle', 'g', 'rect', 'text', 'lineargradient', 'stop'])

/**
 * Static checker used by S7-01 and the SVG negative control. It rejects the
 * executable/external constructs a generated avatar must never contain. The
 * XML namespace declaration is not an external reference.
 */
function inspectSvg(svg) {
  const violations = []
  if (typeof svg !== 'string' || svg.length === 0) return [{ type: 'empty-output' }]
  const elementPattern = /<([A-Za-z][A-Za-z0-9:_-]*)/g
  for (const match of svg.matchAll(elementPattern)) {
    const name = match[1].toLowerCase()
    if (!allowedSvgElements.has(name)) violations.push({ type: 'unexpected-element', element: name })
  }
  if (/<script[\s>]/i.test(svg)) violations.push({ type: 'script-element' })
  if (/<foreignObject[\s>]/i.test(svg)) violations.push({ type: 'foreignObject-element' })
  if (/<(?:iframe|object|embed)[\s>]/i.test(svg)) violations.push({ type: 'embedded-element' })
  if (/<image[\s>]/i.test(svg)) violations.push({ type: 'image-element' })
  for (const match of svg.matchAll(/\s(on[a-z]+)\s*=/gi)) {
    violations.push({ type: 'event-handler-attribute', attribute: match[1].toLowerCase() })
  }
  if (/javascript\s*:/i.test(svg)) violations.push({ type: 'javascript-uri' })
  if (/data\s*:\s*text\/html/i.test(svg)) violations.push({ type: 'data-html-uri' })
  for (const match of svg.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    const value = match[2].trim()
    if (/^(?:https?:)?\/\//i.test(value)) violations.push({ type: 'external-reference', attribute: value.slice(0, 80) })
    if (/^javascript:/i.test(value)) violations.push({ type: 'javascript-reference' })
  }
  for (const match of svg.matchAll(/\burl\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    const value = match[2].trim()
    if (!value.startsWith('#')) violations.push({ type: 'non-fragment-url', value: value.slice(0, 80) })
  }
  if (/@import/i.test(svg)) violations.push({ type: 'css-import' })
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) violations.push({ type: 'doctype-or-entity' })
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(svg)) violations.push({ type: 'xml-invalid-control-character' })
  if (hasLoneSurrogate(svg)) violations.push({ type: 'lone-surrogate' })
  const ids = new Set([...svg.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((match) => match[1]))
  for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) {
    if (!ids.has(match[1])) violations.push({ type: 'unresolved-id-reference', id: match[1].slice(0, 80) })
  }
  return violations
}

async function browserInspectSvgs(page, items, extraOrigins = []) {
  const externalAttempts = []
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (isLocalUrl(url, extraOrigins) || url.startsWith('http://127.0.0.1')) return route.continue()
    externalAttempts.push({ url, resourceType: route.request().resourceType() })
    return route.abort('blockedbyclient')
  })
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>')
  await page.evaluate(() => {
    window.__s7 = { pwned: 0, alerts: 0 }
    window.alert = () => { window.__s7.alerts += 1 }
  })
  const results = []
  for (const item of items) {
    const result = await page.evaluate((svg) => {
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
      const parserErrors = parsed.getElementsByTagName('parsererror')
      const counts = {
        script: parsed.getElementsByTagName('script').length,
        foreignObject: parsed.getElementsByTagName('foreignObject').length,
        iframe: parsed.getElementsByTagName('iframe').length,
        image: parsed.getElementsByTagName('image').length,
      }
      const handlers = []
      for (const element of parsed.querySelectorAll('*')) {
        for (const attribute of element.attributes) {
          if (/^on/i.test(attribute.name)) handlers.push(attribute.name)
        }
      }
      let appended = false
      if (parserErrors.length === 0) {
        const node = document.importNode(parsed.documentElement, true)
        document.getElementById('host').append(node)
        appended = true
      }
      return {
        parserError: parserErrors.length > 0 ? String(parserErrors[0].textContent).slice(0, 200) : null,
        counts,
        handlers,
        appended,
      }
    }, item.svg)
    results.push({ case: item.case, ...result })
  }
  await page.waitForTimeout(150)
  const flags = await page.evaluate(() => ({ pwned: window.__s7.pwned, alerts: window.__s7.alerts }))
  return { results, flags, externalAttempts }
}

async function parseXmlBatch(items, inputFile, outputFile, label) {
  await writeJson(inputFile, items.map(({ case: caseName, svg }) => ({ case: caseName, svg })))
  const script = path.join(probesDir, 'xml-parse.py')
  await fsp.mkdir(probesDir, { recursive: true })
  await fsp.writeFile(
    script,
    [
      'import json, sys, xml.etree.ElementTree as ET',
      'source, target = sys.argv[1], sys.argv[2]',
      'data = json.load(open(source, encoding="utf-8"))',
      'failed = []',
      'roots = set()',
      'for item in data:',
      '    try:',
      '        root = ET.fromstring(item["svg"])',
      '        roots.add(root.tag)',
      '    except Exception as error:',
      '        failed.append({"case": item["case"], "error": str(error)[:200]})',
      'json.dump({"label": sys.argv[3], "total": len(data), "failed": failed, "rootTags": sorted(roots)}, open(target, "w", encoding="utf-8"))',
    ].join('\n'),
  )
  const record = await runCommand({
    label: `xml-parse-${label}`,
    command: `python3 ${shellQuote(script)} ${shellQuote(inputFile)} ${shellQuote(outputFile)} ${shellQuote(label)}`,
    cwd: workDir,
    timeoutMs: 120_000,
  })
  return { record, result: record.exitCode === 0 ? await readJson(outputFile) : null }
}

const payloadData = await readJson(payloadsPath)
const patternData = await readJson(patternsPath)
const patterns = patternData.patterns.map((pattern) => ({
  ...pattern,
  compiled: new RegExp(pattern.regex, pattern.flags),
}))

function scanText(text, file, compiledPatterns = patterns) {
  const findings = []
  for (const pattern of compiledPatterns) {
    pattern.compiled.lastIndex = 0
    let match
    while ((match = pattern.compiled.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length
      findings.push({ file, line, type: pattern.type, pattern: pattern.id, redacted: true })
      if (match[0].length === 0) pattern.compiled.lastIndex += 1
    }
  }
  return findings
}

function excludedFileName(file) {
  return patternData.excludedFileNamePatterns.some((source) => new RegExp(source).test(file))
}

function reviewedFalsePositive(file, type) {
  return (patternData.reviewedFalsePositiveFileNames ?? []).find((entry) => entry.path === file && entry.type === type) ?? null
}

async function walkFiles(root) {
  const files = []
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) files.push(full)
    }
  }
  await walk(root)
  return files
}

function headersFromSiteFile(text) {
  const headers = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s+([A-Za-z0-9-]+):\s*(.*)$/)
    if (match) headers[match[1]] = match[2]
  }
  return headers
}

function validateCspHeaders(headers) {
  const problems = []
  const csp = headers['Content-Security-Policy'] ?? headers['content-security-policy'] ?? ''
  if (!csp) return ['missing-csp']
  if (/unsafe-inline/i.test(csp)) problems.push('unsafe-inline')
  if (/unsafe-eval/i.test(csp)) problems.push('unsafe-eval')
  if (/(?:^|;)\s*(?:default-src|script-src|img-src|style-src|connect-src)[^;]*\*/i.test(csp)) problems.push('wildcard-source')
  for (const directive of ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'object-src', 'base-uri', 'frame-ancestors', 'form-action']) {
    if (!new RegExp(`(?:^|;)\\s*${directive}\\s`).test(csp)) problems.push(`missing-${directive}`)
  }
  if (!/default-src\s+'self'/.test(csp)) problems.push('default-src-not-self')
  if (!/img-src\s+[^;]*data:/.test(csp)) problems.push('img-src-missing-data')
  return problems
}

function attachPageEvents(page) {
  const events = {
    console: [],
    consoleErrors: [],
    pageErrors: [],
    requests: [],
    requestFailures: [],
    dialogs: [],
    badResponses: [],
  }
  page.on('console', (message) => {
    const entry = { type: message.type(), text: message.text() }
    events.console.push(entry)
    if (entry.type === 'error') events.consoleErrors.push(entry)
  })
  page.on('pageerror', (error) => events.pageErrors.push(String(error?.stack ?? error)))
  page.on('request', (request) => {
    events.requests.push({ url: request.url(), resourceType: request.resourceType(), headers: request.headers() })
  })
  page.on('requestfailed', (request) => {
    events.requestFailures.push({ url: request.url(), resourceType: request.resourceType(), failure: request.failure()?.errorText ?? 'unknown' })
  })
  page.on('dialog', async (dialog) => {
    events.dialogs.push({ type: dialog.type(), message: dialog.message() })
    await dialog.dismiss().catch(() => {})
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      events.badResponses.push({ url: response.url(), status: response.status() })
    }
  })
  return events
}

async function newGuardedPage(browser, { allowedOrigins = [siteOrigin], initScripts = [], permissions = null, origin = siteOrigin } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const blockedAttempts = []
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    if (isLocalUrl(url, allowedOrigins)) return route.continue()
    blockedAttempts.push({ url, resourceType: route.request().resourceType() })
    return route.abort('blockedbyclient')
  })
  for (const script of initScripts) await context.addInitScript(script)
  if (permissions) await context.grantPermissions(permissions, { origin })
  const page = await context.newPage()
  const events = attachPageEvents(page)
  return { context, page, events, blockedAttempts }
}

async function takeScreenshot(page, name) {
  await fsp.mkdir(screenshotsDir, { recursive: true })
  const file = path.join(screenshotsDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return { path: rel(file), sha256: await sha256File(file), bytes: (await fsp.stat(file)).size }
}

async function runChildProcess({ label, script, scriptArgs, nodeArgs = [], timeoutMs = childTimeoutMs, env = {} }) {
  const started = Date.now()
  const child = spawn(process.execPath, [...nodeArgs, script, ...scriptArgs], {
    cwd: workDir,
    env: { ...baseEnv, ...env },
    detached: true,
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
  const record = {
    label,
    script,
    scriptArgs,
    nodeArgs,
    timeoutMs,
    exitCode: code,
    signal,
    timedOut,
    durationMs: Date.now() - started,
    pid: child.pid,
    stdout: Buffer.concat(stdout).toString('utf8').slice(-8000),
    stderr: Buffer.concat(stderr).toString('utf8').slice(-8000),
  }
  await fsp.mkdir(logsDir, { recursive: true })
  const logPath = path.join(logsDir, `${sanitize(label)}.log`)
  await fsp.writeFile(
    logPath,
    `# child=${script} args=${JSON.stringify(scriptArgs)} nodeArgs=${JSON.stringify(nodeArgs)}\n# exit=${code} signal=${signal ?? 'none'} timedOut=${timedOut} durationMs=${record.durationMs}\n\n${record.stdout}${record.stderr}\n`,
  )
  record.log = rel(logPath)
  commandLog.push(record)
  return record
}

async function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function runPhasePrepare() {
  const record = {
    phase: 'prepare',
    assertions: 0,
    failures: [],
    commands: [],
    expectedSha256: null,
    goldenSha256: null,
    allowlistSha256: null,
    payloadsSha256: null,
    patternsSha256: null,
    toolsLockSha256: null,
    tarball: null,
    sourceManifest: null,
    versions: {},
  }
  const assert = (condition, label, detail = {}) => {
    record.assertions += 1
    if (!condition) record.failures.push({ label, detail })
    return Boolean(condition)
  }
  const expected = await readJson(expectedPath)
  record.expected = expected
  record.expectedSha256 = await sha256File(expectedPath)
  record.goldenSha256 = await sha256File(goldenPath)
  record.allowlistSha256 = await sha256File(allowlistPath)
  record.payloadsSha256 = await sha256File(payloadsPath)
  record.patternsSha256 = await sha256File(patternsPath)
  record.toolsLockSha256 = await sha256File(toolsLockPath)
  record.tarball = { path: tarballPath, sha256: await sha256File(tarballPath), bytes: (await fsp.stat(tarballPath)).size }
  if (expectedShaArg) assert(record.expectedSha256 === expectedShaArg, 'expected-results SHA matches pre-run value', { expected: expectedShaArg, actual: record.expectedSha256 })
  if (goldenShaArg) assert(record.goldenSha256 === goldenShaArg, 'golden SHA matches pre-run value', { expected: goldenShaArg, actual: record.goldenSha256 })
  if (allowlistShaArg) assert(record.allowlistSha256 === allowlistShaArg, 'tarball allowlist SHA matches pre-run value', { expected: allowlistShaArg, actual: record.allowlistSha256 })
  if (payloadsShaArg) assert(record.payloadsSha256 === payloadsShaArg, 'payload fixture SHA matches pre-run value', { expected: payloadsShaArg, actual: record.payloadsSha256 })
  if (patternsShaArg) assert(record.patternsSha256 === patternsShaArg, 'secret pattern SHA matches pre-run value', { expected: patternsShaArg, actual: record.patternsSha256 })
  if (toolsLockShaArg) assert(record.toolsLockSha256 === toolsLockShaArg, 'tools lock SHA matches pre-run value', { expected: toolsLockShaArg, actual: record.toolsLockSha256 })
  assert(record.tarball.sha256 === expected.expectedTarball.sha256, 'tarball SHA equals frozen approved value', { expected: expected.expectedTarball.sha256, actual: record.tarball.sha256 })
  assert(record.tarball.bytes === expected.expectedTarball.gzipBytes, 'tarball byte size equals frozen value', { expected: expected.expectedTarball.gzipBytes, actual: record.tarball.bytes })

  const preflight = await runCommand({
    label: 'prepare-preflight',
    command: 'node --version && npm --version && (python3 --version || true) && uname -a && cat /etc/os-release && (nproc || true) && (free -m || true) && sha256sum ' + shellQuote(tarballPath),
    cwd: workDir,
    timeoutMs: 120_000,
  })
  record.commands.push(preflight)
  assert(preflight.exitCode === 0, 'preflight command succeeds', { exitCode: preflight.exitCode })
  record.versions = {
    node: execFileSync('node', ['--version'], { encoding: 'utf8' }).trim(),
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    sandbox: sandboxArg,
    image: imageArg,
    region: regionArg,
    memoryMb: memoryArg,
    python: (() => {
      try { return execFileSync('python3', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return null }
    })(),
  }
  let pythonJson = false
  try {
    pythonJson = execFileSync('python3', ['-c', 'import json,sys,xml.etree.ElementTree; sys.exit(0)'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).length === 0
  } catch {
    pythonJson = false
  }
  if (!record.versions.python || !pythonJson) {
    const install = await runCommand({
      label: 'prepare-python3',
      command: 'apt-get update && apt-get install -y --no-install-recommends python3',
      cwd: workDir,
      timeoutMs: 300_000,
    })
    record.commands.push(install)
    assert(install.exitCode === 0, 'python3 with stdlib installed for independent XML parsing', { exitCode: install.exitCode })
    try {
      record.versions.python = execFileSync('python3', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    } catch {
      record.versions.python = null
    }
    try {
      pythonJson = execFileSync('python3', ['-c', 'import json,sys,xml.etree.ElementTree; sys.exit(0)'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).length === 0
    } catch {
      pythonJson = false
    }
  }
  assert(Boolean(record.versions.python) && pythonJson, 'python3 with json and xml.etree is available for real XML parsing')

  const manifest = await readJson(sourceManifestPath)
  const manifestFailures = []
  for (const file of manifest.files) {
    const full = path.join(repo, file.path)
    try {
      const actual = await sha256File(full)
      if (actual !== file.sha256) manifestFailures.push({ path: file.path, issue: 'hash-mismatch' })
    } catch {
      manifestFailures.push({ path: file.path, issue: 'missing' })
    }
    if (excludedFileName(file.path) && !reviewedFalsePositive(file.path, 'excluded-file-name')) {
      manifestFailures.push({ path: file.path, issue: 'excluded-file-name' })
    }
  }
  assert(manifestFailures.length === 0, 'uploaded tracked source matches source manifest and has no excluded names', { failures: manifestFailures.slice(0, 20) })
  assert(manifest.fileCount === manifest.files.length, 'source manifest file count is consistent')
  record.sourceManifest = { sha256: manifest.sha256, fileCount: manifest.fileCount, commit: manifest.commit }

  const toolsCi = await runCommand({ label: 'prepare-tools-npm-ci', command: 'npm ci --no-audit --no-fund', cwd: toolsDir })
  record.commands.push(toolsCi)
  assert(toolsCi.exitCode === 0, 'pinned browser tools npm ci succeeds', { exitCode: toolsCi.exitCode })
  const toolsLockAfter = await sha256File(toolsLockPath)
  assert(toolsLockAfter === record.toolsLockSha256, 'tools lock unchanged by npm ci', { expected: record.toolsLockSha256, actual: toolsLockAfter })

  const browserInstall = await runCommand({
    label: 'prepare-playwright-chromium',
    command: './node_modules/.bin/playwright install --with-deps chromium',
    cwd: toolsDir,
    env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    timeoutMs: perCommandMs,
  })
  record.commands.push(browserInstall)
  assert(browserInstall.exitCode === 0, 'Chromium installed with system dependencies', { exitCode: browserInstall.exitCode, stderr: browserInstall.stderr.slice(-3000) })

  const lockBefore = await sha256File(path.join(repo, 'package-lock.json'))
  const rootCi = await runCommand({ label: 'prepare-repo-npm-ci', command: 'npm ci --no-audit --no-fund', cwd: repo, timeoutMs: perCommandMs })
  record.commands.push(rootCi)
  const lockAfter = await sha256File(path.join(repo, 'package-lock.json'))
  assert(rootCi.exitCode === 0, 'repository npm ci succeeds', { exitCode: rootCi.exitCode })
  assert(lockAfter === lockBefore, 'repository package-lock unchanged by npm ci', { expected: lockBefore, actual: lockAfter })
  const buildSite = await runCommand({ label: 'prepare-build-site', command: 'npm run build:site', cwd: repo, timeoutMs: perCommandMs })
  record.commands.push(buildSite)
  assert(buildSite.exitCode === 0, 'site builds from tracked source', { exitCode: buildSite.exitCode })
  const siteFiles = await walkFiles(siteDir)
  record.site = { fileCount: siteFiles.length, files: siteFiles.map((file) => ({ path: path.relative(repo, file).split(path.sep).join('/'), sha256: null })) }
  for (const item of record.site.files) {
    item.sha256 = await sha256File(path.join(repo, item.path))
  }
  assert(siteFiles.some((file) => file.endsWith('assets/app.js')), 'site bundle assets/app.js exists')

  await fsp.rm(extractedPackageDir, { recursive: true, force: true })
  await fsp.mkdir(extractedPackageDir, { recursive: true })
  const extract = await runCommand({
    label: 'prepare-extract-tarball',
    command: `tar -xzf ${shellQuote(tarballPath)} -C ${shellQuote(extractedPackageDir)} --strip-components=1`,
    cwd: workDir,
    timeoutMs: 120_000,
  })
  record.commands.push(extract)
  assert(extract.exitCode === 0, 'tarball extracts for content scans', { exitCode: extract.exitCode })
  record.packageHashes = {
    'package.json': await sha256File(path.join(extractedPackageDir, 'package.json')),
    'dist/index.js': await sha256File(path.join(extractedPackageDir, 'dist/index.js')),
    'dist/dither-face.js': await sha256File(path.join(extractedPackageDir, 'dist/dither-face.js')),
  }

  await writeJson(path.join(outDir, 'prepare.json'), record)
  if (record.failures.length) throw new Error(`prepare phase failed: ${JSON.stringify(record.failures)}`)
  return record
}

async function runPhaseInstall() {
  const record = { phase: 'install', assertions: 0, failures: [], commands: [], installed: null }
  const assert = (condition, label, detail = {}) => {
    record.assertions += 1
    if (!condition) record.failures.push({ label, detail })
    return Boolean(condition)
  }
  await fsp.rm(consumerDir, { recursive: true, force: true })
  await fsp.mkdir(consumerDir, { recursive: true })
  await writeJson(path.join(consumerDir, 'package.json'), {
    name: 's7-installed-consumer',
    version: '0.0.0',
    private: true,
    type: 'module',
  })
  const install = await runCommand({
    label: 'install-consumer-tarball',
    command: `npm install --ignore-scripts --no-audit --no-fund ${shellQuote(tarballPath)}`,
    cwd: consumerDir,
    timeoutMs: 180_000,
  })
  record.commands.push(install)
  assert(install.exitCode === 0, 'actual tarball installs in an empty consumer', { exitCode: install.exitCode, stderr: install.stderr.slice(-3000) })

  const installed = await loadInstalledPackage()
  const installedStat = await fsp.lstat(installed.resolved)
  const packageRoot = path.dirname(path.dirname(installed.resolved))
  const realPackageRoot = await fsp.realpath(packageRoot)
  const consumerReal = await fsp.realpath(consumerDir)
  record.installed = {
    entry: installed.entry,
    resolved: installed.resolved,
    packageRoot,
    realPackageRoot,
    isSymlink: installedStat.isSymbolicLink(),
    insideConsumer: realPackageRoot.startsWith(consumerReal + path.sep + 'node_modules' + path.sep),
    packageJson: await sha256File(path.join(packageRoot, 'package.json')),
    distIndex: await sha256File(path.join(packageRoot, 'dist/index.js')),
    distWeb: await sha256File(path.join(packageRoot, 'dist/dither-face.js')),
  }
  assert(!record.installed.isSymlink && record.installed.insideConsumer, 'resolved package is a real installed node_modules directory, not a source alias or symlink', record.installed)
  assert(record.installed.packageJson === (await sha256File(path.join(extractedPackageDir, 'package.json'))), 'installed package.json equals tarball entry')
  assert(record.installed.distIndex === (await sha256File(path.join(extractedPackageDir, 'dist/index.js'))), 'installed dist/index.js equals tarball entry')
  assert(record.installed.distWeb === (await sha256File(path.join(extractedPackageDir, 'dist/dither-face.js'))), 'installed dist/dither-face.js equals tarball entry')
  const packageJson = await readJson(path.join(packageRoot, 'package.json'))
  assert(!('dependencies' in packageJson) && !('optionalDependencies' in packageJson) && !('peerDependencies' in packageJson), 'installed manifest has no runtime dependency fields', { keys: Object.keys(packageJson) })
  const ls = await runCommand({ label: 'install-npm-ls', command: 'npm ls dither-face --json', cwd: consumerDir, timeoutMs: 120_000 })
  record.commands.push(ls)
  let lsJson = null
  try { lsJson = JSON.parse(ls.stdout) } catch { lsJson = null }
  record.npmLs = lsJson
  assert(ls.exitCode === 0 && lsJson?.dependencies?.['dither-face']?.version === '0.1.0', 'npm ls resolves dither-face 0.1.0 from the consumer', { exitCode: ls.exitCode })

  await writeJson(path.join(outDir, 'install.json'), record)
  if (record.failures.length) throw new Error(`install phase failed: ${JSON.stringify(record.failures)}`)
  return record
}

// The test phase is below. It is intentionally one process so the local
// servers, browser and subprocess resource probes share one bounded sandbox.

function assertSafeGeneratedSvg(sc, label, svg) {
  sc.assert(typeof svg === 'string' && svg.length > 0, `${label}: non-empty output`)
  if (typeof svg !== 'string' || svg.length === 0) return false
  sc.assert(svg.startsWith('<svg ') && svg.includes('xmlns="http://www.w3.org/2000/svg"'), `${label}: standalone svg root with namespace`)
  const violations = inspectSvg(svg)
  sc.assert(violations.length === 0, `${label}: no executable or external constructs`, { violations })
  return violations.length === 0
}

function renderExpectThrow(sc, label, fn) {
  let threw = null
  try {
    fn()
  } catch (error) {
    threw = { name: error?.name ?? 'Error', message: String(error?.message ?? error).slice(0, 180) }
  }
  sc.assert(threw !== null, `${label}: throws`, { threw })
  return threw
}

async function runS7_01(sc, { browser, installed, sinkOrigin, sinkRecords }) {
  const pkg = installed.pkg
  const styles = pkg.STYLES
  const direct = {
    'pixel-sprite': pkg.pixelSprite,
    'pixel-letter': pkg.pixelLetter,
    'dither-orb': pkg.ditherOrb,
    'pixel-landscape': pkg.pixelLandscape,
    'ascii-letter': pkg.asciiLetter,
    'ascii-field': pkg.asciiField,
    'ascii-face': pkg.asciiFace,
    'pixelify-letter': pkg.pixelifyLetter,
  }
  const payloads = payloadData.payloads
  const collected = []

  sc.case('high-level seed payloads x 8 styles')
  for (const style of styles) {
    for (const payload of payloads) {
      const label = `seed ${payload.id} ${style.slug}`
      let svg = null
      try {
        svg = pkg.ditherFace(payload.value, { style: style.slug, px: 80 })
      } catch (error) {
        sc.assert(false, `${label}: renders without throwing`, { error: String(error?.message ?? error) })
        continue
      }
      assertSafeGeneratedSvg(sc, label, svg)
      collected.push({ case: `${payload.id}/${style.slug}/seed`, svg })
    }
  }

  sc.case('high-level name payloads x 8 styles')
  for (const style of styles) {
    for (const payload of payloads) {
      const label = `name ${payload.id} ${style.slug}`
      let svg = null
      try {
        svg = pkg.ditherFace('safe-seed', { style: style.slug, px: 80, name: payload.value })
      } catch (error) {
        sc.assert(false, `${label}: renders without throwing`, { error: String(error?.message ?? error) })
        continue
      }
      assertSafeGeneratedSvg(sc, label, svg)
      collected.push({ case: `${payload.id}/${style.slug}/name`, svg })
    }
  }

  sc.case('direct renderers: payload as seed and name')
  for (const style of styles) {
    const draw = direct[style.slug]
    for (const payload of payloads) {
      let seedSvg = null
      let nameSvg = null
      try {
        seedSvg = draw(payload.value, 80)
        nameSvg = draw('safe-seed', 80, payload.value)
      } catch (error) {
        sc.assert(false, `direct ${payload.id} ${style.slug}: renders without throwing`, { error: String(error?.message ?? error) })
        continue
      }
      assertSafeGeneratedSvg(sc, `direct seed ${payload.id} ${style.slug}`, seedSvg)
      assertSafeGeneratedSvg(sc, `direct name ${payload.id} ${style.slug}`, nameSvg)
      collected.push({ case: `${payload.id}/${style.slug}/direct-seed`, svg: seedSvg })
      collected.push({ case: `${payload.id}/${style.slug}/direct-name`, svg: nameSvg })
    }
  }

  sc.case('options and type injection')
  const dangerous = '<script>alert(1)</script>'
  renderExpectThrow(sc, 'style payload string', () => pkg.ditherFace('safe', { style: dangerous }))
  renderExpectThrow(sc, 'px payload string', () => pkg.ditherFace('safe', { px: dangerous }))
  renderExpectThrow(sc, 'px null', () => pkg.ditherFace('safe', { px: null }))
  renderExpectThrow(sc, 'px NaN', () => pkg.ditherFace('safe', { px: Number.NaN }))
  renderExpectThrow(sc, 'px Infinity', () => pkg.ditherFace('safe', { px: Number.POSITIVE_INFINITY }))
  renderExpectThrow(sc, 'px zero', () => pkg.ditherFace('safe', { px: 0 }))
  renderExpectThrow(sc, 'px negative', () => pkg.ditherFace('safe', { px: -1 }))
  renderExpectThrow(sc, 'name number', () => pkg.ditherFace('safe', { name: 7 }))
  renderExpectThrow(sc, 'seed number', () => pkg.ditherFace(7))
  renderExpectThrow(sc, 'options null', () => pkg.ditherFace('safe', null))
  renderExpectThrow(sc, 'options array', () => pkg.ditherFace('safe', []))
  renderExpectThrow(sc, 'direct missing px', () => pkg.pixelSprite('safe'))

  sc.case('trusted low-level primitives are documented, not sanitizers')
  const rawRect = pkg.rect(0, 0, 'red" onload="alert(1)')
  sc.assert(rawRect.includes('onload="alert(1)"'), 'rect concatenates trusted color input unchanged (documented low-level boundary)')
  const rawDisc = pkg.disc(10, 2, '<script>alert(1)</script>', 'id" onload="alert(1)')
  sc.assert(rawDisc.includes('<script>alert(1)</script>'), 'disc concatenates trusted fragment unchanged (documented low-level boundary)')
  sc.assert(rawDisc.includes('onload="alert(1)"'), 'disc concatenates trusted id unchanged (documented low-level boundary)')
  sc.assert(pkg.esc('<script>&"') === '&lt;script&gt;&amp;"', 'esc escapes XML text content only')
  sc.assert(pkg.esc('" onload="') === '" onload="', 'esc does not escape quotes; text-content contract is accurate')
  const grid = pkg.asciiGrid(2, '#fff', [['<'], ['&']])
  sc.assert(grid.includes('&lt;') && grid.includes('&amp;'), 'asciiGrid escapes cell characters as XML text')
  sc.note('rect/disc/asciiGrid accept trusted colors, ids and fragments. Raw concatenation is the documented low-level contract, not a sanitizer weakness or a vulnerability in the validated high-level renderers.')

  sc.case('real XML parse and browser inspection')
  const unique = [...new Map(collected.map((item) => [sha256(item.svg), item])).values()]
  const xmlInput = path.join(artifactsDir, 's7-01-svgs.json')
  const xmlOutput = path.join(artifactsDir, 's7-01-xml.json')
  const xml = await parseXmlBatch(unique, xmlInput, xmlOutput, 'S7-01')
  sc.assert(xml.record.exitCode === 0, 'python xml.etree batch parser exits 0', { exitCode: xml.record.exitCode, stderr: xml.record.stderr.slice(-1000) })
  sc.assert(xml.result?.failed?.length === 0, 'every generated SVG parses as well-formed XML', { failed: xml.result?.failed ?? null })
  sc.assert(xml.result?.rootTags?.length === 1 && xml.result.rootTags[0] === '{http://www.w3.org/2000/svg}svg', 'every XML root is the SVG namespace element', { rootTags: xml.result?.rootTags ?? null })

  const pageBundle = await newGuardedPage(browser, { allowedOrigins: [siteOrigin, sinkOrigin] })
  const browserCheck = await browserInspectSvgs(pageBundle.page, unique, [sinkOrigin])
  for (const result of browserCheck.results) {
    sc.assert(result.parserError === null, `browser XML parse ${result.case}`, { parserError: result.parserError })
    sc.assert(result.appended === true, `browser import ${result.case}`, {})
    sc.assert(result.counts.script === 0 && result.counts.foreignObject === 0 && result.counts.iframe === 0 && result.counts.image === 0, `browser inert elements ${result.case}`, { counts: result.counts })
    sc.assert(result.handlers.length === 0, `browser handler attributes ${result.case}`, { handlers: result.handlers })
  }
  sc.assert(browserCheck.flags.pwned === 0 && browserCheck.flags.alerts === 0, 'payloads execute no script or alert in the browser', browserCheck.flags)
  sc.assert(browserCheck.externalAttempts.length === 0, 'no external reference attempts while importing generated SVG', { attempts: browserCheck.externalAttempts })
  await pageBundle.context.close()
}

async function runS7_02(sc, { browser, installed }) {
  const pkg = installed.pkg
  const payloads = payloadData.payloads
  const initAlert = () => {
    window.__s7 = { alerts: 0, pwned: 0 }
    window.alert = () => { window.__s7.alerts += 1 }
  }
  const pageBundle = await newGuardedPage(browser, { initScripts: [initAlert] })
  const page = pageBundle.page
  await page.goto(`${siteOrigin}/?seed=ui-base`)
  await page.waitForSelector('#preview svg')

  const globalsBefore = await page.evaluate(() => ({
    window: Object.getOwnPropertyNames(window),
    object: Object.getOwnPropertyNames(Object.prototype),
    array: Object.getOwnPropertyNames(Array.prototype),
    function: Object.getOwnPropertyNames(Function.prototype),
  }))

  sc.case('seed payloads rendered as inert text/data')
  for (const payload of payloads) {
    const label = `seed ${payload.id}`
    await page.evaluate((value) => {
      const input = document.getElementById('seed')
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, payload.value)
    await page.waitForFunction(() => document.querySelector('#svg-source')?.value?.length > 0)
    const actualValue = await page.evaluate(() => document.getElementById('seed').value)
    const expected = pkg.ditherFace(actualValue, { style: 'pixel-sprite', px: 80 })
    const state = await page.evaluate(() => ({
      source: document.querySelector('#svg-source').value,
      previewSvg: document.querySelectorAll('#preview svg').length,
      previewScripts: document.querySelectorAll('#preview script, #preview img, #preview iframe, #gallery script, #gallery img, #gallery iframe').length,
      previewHandlers: [...document.querySelectorAll('#preview *')].flatMap((element) => [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)).map((attribute) => attribute.name)),
      statusChildren: document.querySelector('#status').children.length,
      statusText: document.querySelector('#status').textContent,
      usageChildren: document.querySelector('#usage').children.length,
      usageInjected: document.querySelectorAll('#usage script, #usage img, #usage svg').length,
      usageText: document.querySelector('#usage').textContent,
      alerts: window.__s7.alerts,
      pwned: window.__s7.pwned,
    }))
    sc.assert(state.source === expected, `${label}: source textarea holds the library SVG`, { expectedSha: sha256(expected), actualSha: sha256(state.source) })
    sc.assert(state.previewSvg === 1, `${label}: one preview SVG`, { count: state.previewSvg })
    sc.assert(state.previewScripts === 0, `${label}: no injected preview/gallery elements`, { count: state.previewScripts })
    sc.assert(state.previewHandlers.length === 0, `${label}: no handler attributes in preview`, { handlers: state.previewHandlers })
    sc.assert(state.statusChildren === 0 && state.statusText === '', `${label}: status is empty text-only region`, { text: state.statusText })
    sc.assert(state.usageChildren === 0 && state.usageInjected === 0, `${label}: usage snippet is text, not markup`, { children: state.usageChildren })
    sc.assert(state.usageText.includes(JSON.stringify(actualValue)), `${label}: usage snippet encodes the input as data`, { inputLength: actualValue.length })
    sc.assert(state.alerts === 0 && state.pwned === 0, `${label}: no execution or alert`, { alerts: state.alerts, pwned: state.pwned })
  }

  sc.case('name payloads rendered as inert data')
  await page.evaluate(() => {
    const seed = document.getElementById('seed')
    seed.value = 'safe-seed'
    seed.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Select ascii letter', exact: true }).click()
  for (const payload of payloads) {
    const label = `name ${payload.id}`
    await page.evaluate((value) => {
      const input = document.getElementById('name')
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, payload.value)
    await page.waitForFunction(() => document.querySelector('#svg-source')?.value?.length > 0)
    const actualValue = await page.evaluate(() => document.getElementById('name').value)
    const expected = pkg.ditherFace('safe-seed', { style: 'ascii-letter', px: 80, name: actualValue })
    const state = await page.evaluate(() => ({
      source: document.querySelector('#svg-source').value,
      injected: document.querySelectorAll('#preview script, #preview img, #gallery script, #gallery img, #usage script, #usage img').length,
      handlers: [...document.querySelectorAll('#preview *')].flatMap((element) => [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)).map((attribute) => attribute.name)),
      alerts: window.__s7.alerts,
    }))
    sc.assert(state.source === expected, `${label}: source textarea holds the library SVG`, { expectedSha: sha256(expected), actualSha: sha256(state.source) })
    sc.assert(state.injected === 0, `${label}: no injected elements`, { count: state.injected })
    sc.assert(state.handlers.length === 0, `${label}: no handler attributes`, { handlers: state.handlers })
    sc.assert(state.alerts === 0, `${label}: no alert`, { alerts: state.alerts })
  }

  sc.case('status, source and code regions remain inert')
  const snippetSeed = '</textarea><script>window.__s7.pwned=1</script>'
  await page.evaluate((value) => {
    const seed = document.getElementById('seed')
    seed.value = value
    seed.dispatchEvent(new Event('input', { bubbles: true }))
    const name = document.getElementById('name')
    name.value = value
    name.dispatchEvent(new Event('input', { bubbles: true }))
  }, snippetSeed)
  const inert = await page.evaluate(() => ({
    sourceTag: document.querySelector('#svg-source').tagName,
    usageTag: document.querySelector('#usage').tagName,
    usageChildren: document.querySelector('#usage').children.length,
    usageText: document.querySelector('#usage').textContent,
    injected: document.querySelectorAll('#preview script, #preview img, #gallery script, #gallery img, #usage script, #usage img').length,
    statusChildren: document.querySelector('#status').children.length,
    pwned: window.__s7.pwned,
  }))
  sc.assert(inert.sourceTag === 'TEXTAREA', 'SVG source region is a textarea', { tag: inert.sourceTag })
  sc.assert(inert.usageTag === 'CODE', 'usage region is a code element', { tag: inert.usageTag })
  sc.assert(inert.usageChildren === 0 && inert.injected === 0, 'code snippet holds literal text only', { children: inert.usageChildren, injected: inert.injected })
  sc.assert(inert.usageText.includes(JSON.stringify(snippetSeed)), 'code snippet shows the seed as escaped data text')
  sc.assert(inert.statusChildren === 0 && inert.pwned === 0, 'status is text-only and payload did not execute', inert)

  sc.case('clipboard-failure status is fixed text')
  const deniedBundle = await newGuardedPage(browser, {
    initScripts: [
      initAlert,
      () => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => { throw new Error('denied by S7 test') } },
        })
      },
    ],
  })
  const denied = deniedBundle.page
  await denied.goto(`${siteOrigin}/?seed=fallback`)
  await denied.waitForSelector('#preview svg')
  await denied.getByRole('button', { name: 'Copy SVG', exact: true }).click()
  const deniedState = await denied.evaluate(() => ({
    status: document.querySelector('#status').textContent,
    children: document.querySelector('#status').children.length,
    panelOpen: document.querySelector('#manual-panel').open,
    manual: document.querySelector('#manual-copy').value,
    source: document.querySelector('#svg-source').value,
    injected: document.querySelectorAll('#status *, #manual-panel script, #manual-panel img').length,
  }))
  sc.assert(deniedState.status.includes('Clipboard unavailable'), 'clipboard failure shows fixed status copy', { status: deniedState.status })
  sc.assert(deniedState.children === 0 && deniedState.injected === 0, 'status and manual panel contain no injected elements')
  sc.assert(deniedState.panelOpen && deniedState.manual === deniedState.source, 'manual copy fallback holds the current SVG text')
  await deniedBundle.context.close()

  sc.case('prototype-like and malformed URL parameters')
  const prototypeUrls = [
    '/?__proto__[polluted]=1&constructor[prototype][polluted]=1&style=__proto__&size=__proto__&seed=constructor&name=prototype',
    '/?seed=first&seed=second&style=pixel-letter&style=dither-orb&size=128&size=48',
    '/?style=%E0%A4%A&size=%00&seed=%&name=%',
  ]
  for (const suffix of prototypeUrls) {
    await page.goto(`${siteOrigin}${suffix}`)
    await page.waitForSelector('#preview svg')
    const state = await page.evaluate(() => ({
      seed: document.querySelector('#seed').value,
      name: document.querySelector('#name').value,
      style: document.querySelector('#selected-title').textContent,
      size: document.querySelector('#size').value,
      objectPolluted: Object.prototype.polluted,
      arrayPolluted: Array.prototype.polluted,
      functionPolluted: Function.prototype.polluted,
      windowPolluted: window.polluted,
      previewSvg: document.querySelectorAll('#preview svg').length,
    }))
    sc.assert(state.objectPolluted === undefined && state.arrayPolluted === undefined && state.functionPolluted === undefined && state.windowPolluted === undefined, `${suffix}: no prototype or global pollution`, state)
    sc.assert(state.previewSvg === 1, `${suffix}: page still renders`, { previewSvg: state.previewSvg })
    if (suffix.includes('seed=first')) {
      sc.assert(state.seed === 'first', 'duplicate seed uses URLSearchParams first-value precedence', { seed: state.seed })
      sc.assert(state.style === 'pixel letter', 'duplicate style uses first-value precedence', { style: state.style })
      sc.assert(state.size === '128', 'duplicate size uses first-value precedence', { size: state.size })
    }
    if (suffix.includes('style=__proto__')) {
      sc.assert(state.seed === 'constructor' && state.name === 'prototype', 'prototype-like seed/name remain literal values', { seed: state.seed, name: state.name })
      sc.assert(state.style === 'pixel sprite' && state.size === '80', 'invalid prototype-like style/size fall back safely', { style: state.style, size: state.size })
    }
  }

  sc.case('long malformed value stays bounded and inert')
  const longSeed = `${'A'.repeat(4000)}<script>window.__s7.pwned=1</script>`
  await page.goto(`${siteOrigin}/?seed=${encodeURIComponent(longSeed)}&name=${encodeURIComponent(longSeed)}`)
  await page.waitForSelector('#preview svg')
  const longState = await page.evaluate(() => ({
    seed: document.querySelector('#seed').value,
    injected: document.querySelectorAll('#preview script, #preview img, #gallery script, #gallery img').length,
    pwned: window.__s7.pwned,
    alerts: window.__s7.alerts,
  }))
  sc.assert(longState.seed === longSeed.replace(/\n/g, ''), 'long URL value is preserved as data', { length: longState.seed.length })
  sc.assert(longState.injected === 0 && longState.pwned === 0 && longState.alerts === 0, 'long payload does not execute or inject', longState)

  sc.case('no unexpected global mutations')
  const globalsAfter = await page.evaluate(() => ({
    window: Object.getOwnPropertyNames(window),
    object: Object.getOwnPropertyNames(Object.prototype),
    array: Object.getOwnPropertyNames(Array.prototype),
    function: Object.getOwnPropertyNames(Function.prototype),
  }))
  const newWindowKeys = globalsAfter.window.filter((key) => !globalsBefore.window.includes(key) && key !== '__s7' && !key.startsWith('__playwright'))
  sc.assert(newWindowKeys.length === 0, 'interactions add no unexpected window globals', { newWindowKeys })
  for (const key of ['object', 'array', 'function']) {
    const added = globalsAfter[key].filter((name) => !globalsBefore[key].includes(name))
    const removed = globalsBefore[key].filter((name) => !globalsAfter[key].includes(name))
    sc.assert(added.length === 0 && removed.length === 0, `interactions do not mutate ${key} prototype properties`, { added, removed })
  }
  sc.assert(pageBundle.events.dialogs.length === 0, 'no dialogs opened during UI payload tests', { dialogs: pageBundle.events.dialogs })
  sc.assert(pageBundle.blockedAttempts.length === 0, 'UI payload tests made no external request attempts', { attempts: pageBundle.blockedAttempts })
  await pageBundle.context.close()
}

async function runS7_03(sc, { browser, installed, golden, goldenHashes, sinkOrigin, sinkRecords }) {
  const siteHeadersText = await fsp.readFile(path.join(repo, 'site/_headers'), 'utf8')
  const documentedHeaders = headersFromSiteFile(siteHeadersText)
  sc.case('documented strict CSP and response headers')
  const headerProblems = validateCspHeaders(documentedHeaders)
  sc.assert(headerProblems.length === 0, 'site/_headers documents a strict CSP without unsafe-inline/unsafe-eval', { problems: headerProblems, csp: documentedHeaders['Content-Security-Policy'] })
  const response = await fetch(`${siteOrigin}/`)
  const responseHeaders = {
    'Content-Security-Policy': response.headers.get('content-security-policy') ?? '',
    'Referrer-Policy': response.headers.get('referrer-policy') ?? '',
    'X-Content-Type-Options': response.headers.get('x-content-type-options') ?? '',
    'X-Frame-Options': response.headers.get('x-frame-options') ?? '',
  }
  sc.assert(response.status === 200, 'local site root returns HTTP 200', { status: response.status })
  sc.assert(responseHeaders['Content-Security-Policy'] === documentedHeaders['Content-Security-Policy'], 'served CSP equals documented site/_headers value', { documented: documentedHeaders['Content-Security-Policy'], served: responseHeaders['Content-Security-Policy'] })
  sc.assert(responseHeaders['Referrer-Policy'] === 'no-referrer', 'served Referrer-Policy is no-referrer', { value: responseHeaders['Referrer-Policy'] })
  sc.assert(responseHeaders['X-Content-Type-Options'] === 'nosniff', 'served X-Content-Type-Options is nosniff')
  sc.assert(responseHeaders['X-Frame-Options'] === 'DENY', 'served X-Frame-Options is DENY')

  const initViolations = () => {
    window.__s7violations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__s7violations.push({
        directive: event.violatedDirective,
        effective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sample: String(event.sample ?? '').slice(0, 120),
        disposition: event.disposition,
      })
    })
  }
  const bundle = await newGuardedPage(browser, { initScripts: [initViolations] })
  const page = bundle.page
  await page.goto(`${siteOrigin}/?seed=preview-output&name=7even&style=pixel-sprite&size=80`)
  await page.waitForSelector('#preview svg')
  await page.waitForLoadState('networkidle')
  sc.case('normal UI renders under strict CSP')
  const normalViolations = await page.evaluate(() => window.__s7violations)
  sc.assert(normalViolations.length === 0, 'normal page produces no CSP violations', { violations: normalViolations })
  sc.assert(bundle.events.consoleErrors.length === 0, 'normal page has no console errors', { errors: bundle.events.consoleErrors })
  sc.assert(bundle.events.pageErrors.length === 0, 'normal page has no page errors', { errors: bundle.events.pageErrors })
  sc.assert(bundle.events.requests.every((request) => isLocalUrl(request.url, [siteOrigin])), 'normal page requests are local only', { external: bundle.events.requests.filter((request) => !isLocalUrl(request.url, [siteOrigin])) })
  await page.waitForSelector('#gallery svg')
  const uiCounts = await page.evaluate(() => ({
    preview: document.querySelectorAll('#preview svg').length,
    gallery: document.querySelectorAll('#gallery svg').length,
    buttons: document.querySelectorAll('#gallery button').length,
  }))
  sc.assert(uiCounts.preview === 1 && uiCounts.gallery === 8 && uiCounts.buttons === 8, 'normal UI renders preview and all eight gallery avatars', uiCounts)
  sc.assert(bundle.blockedAttempts.length === 0, 'normal page makes no blocked external attempts', { attempts: bundle.blockedAttempts })

  sc.case('data URL image compatibility under img-src data:')
  const dataImage = await page.evaluate(async () => {
    const svg = document.querySelector('#svg-source').value
    const image = new Image()
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('data image failed'))
    })
    image.id = 's7-data-image'
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    document.body.append(image)
    return loaded
  })
  sc.assert(dataImage.width === 80 && dataImage.height === 80, 'data URL SVG image renders at the requested size', dataImage)
  await page.waitForTimeout(100)
  const dataViolations = await page.evaluate(() => window.__s7violations)
  sc.assert(dataViolations.length === 0, 'data URL image causes no CSP violation', { violations: dataViolations })

  sc.case('bundled renderer parity with installed tarball')
  for (const style of installed.pkg.STYLES) {
    await page.getByRole('button', { name: `Select ${style.title}`, exact: true }).click()
    await page.waitForFunction((title) => document.querySelector('#selected-title')?.textContent === title, style.title)
    const source = await page.evaluate(() => document.querySelector('#svg-source').value)
    const actual = sha256(source)
    sc.assert(actual === goldenHashes[style.slug], `${style.slug}: site bundle output matches frozen installed-package golden`, { expected: goldenHashes[style.slug], actual })
  }
  const bundleSource = await fsp.readFile(path.join(siteDir, 'assets/app.js'), 'utf8')
  sc.assert(!/(?:^|[^A-Za-z0-9_$])eval\s*\(/.test(bundleSource), 'built bundle contains no eval call')
  sc.assert(!/new\s+Function\s*\(/.test(bundleSource), 'built bundle contains no new Function call')
  sc.assert(!bundleSource.includes('sourceMappingURL'), 'built bundle has no source map reference')
  sc.assert(!bundleSource.includes('/Users/') && !bundleSource.includes('/blaxel/') && !bundleSource.includes('node_modules/dither-face'), 'built bundle contains no local or source-alias path', {})

  sc.case('malicious payloads are blocked and distinguished from normal violations')
  sinkRecords.length = 0
  await page.evaluate(() => {
    window.__s7violations = []
    const script = document.createElement('script')
    script.textContent = 'window.__csp_inline = 1'
    document.head.append(script)
  })
  await page.waitForTimeout(250)
  const inlineState = await page.evaluate(() => ({ executed: window.__csp_inline, violations: window.__s7violations }))
  sc.assert(inlineState.executed === undefined, 'inline script payload does not execute', { executed: inlineState.executed })
  sc.assert(inlineState.violations.some((violation) => /script-src/.test(violation.directive)), 'CSP reports an expected script-src violation for inline script', { violations: inlineState.violations })

  await page.evaluate(() => { window.__s7violations = [] })
  await page.evaluate((source) => {
    const script = document.createElement('script')
    script.src = source
    document.head.append(script)
  }, `${sinkOrigin}/evil.js?probe=csp`)
  await page.waitForTimeout(400)
  const externalState = await page.evaluate(() => ({ executed: window.__csp_external, violations: window.__s7violations }))
  const evilRequests = sinkRecords.filter((record) => record.url.startsWith('/evil.js'))
  sc.assert(externalState.executed === undefined && evilRequests.length === 0, 'cross-origin script is blocked before any request reaches the sink', { executed: externalState.executed, sinkRequests: evilRequests })
  sc.assert(externalState.violations.some((violation) => /script-src/.test(violation.directive) && String(violation.blockedURI).includes('/evil.js')), 'CSP reports the expected blocked external script', { violations: externalState.violations })

  await page.evaluate(() => { window.__s7violations = [] })
  await page.evaluate(() => {
    const image = new Image()
    image.id = 's7-handler-probe'
    image.setAttribute('onload', 'window.__csp_handler = 1')
    image.src = document.querySelector('#s7-data-image')?.src ?? ''
    document.body.append(image)
  })
  await page.waitForTimeout(250)
  const handlerState = await page.evaluate(() => ({ executed: window.__csp_handler, violations: window.__s7violations }))
  sc.assert(handlerState.executed === undefined, 'inline event-handler attribute does not execute', { executed: handlerState.executed })
  sc.assert(handlerState.violations.some((violation) => /script-src/.test(violation.directive)), 'CSP reports the expected handler violation', { violations: handlerState.violations })
  sc.note('The injected inline script, cross-origin script and inline handler are deliberate negative controls. Their CSP violations are expected and recorded separately; the normal page above had zero violations, so no violation was ignored or hidden.')
  await takeScreenshot(page, 's7-03-csp-normal')
  await bundle.context.close()
}

async function runS7_04(sc, { browser, installed, sinkOrigin, sinkRecords }) {
  sc.case('referrer detector positive control')
  sinkRecords.length = 0
  const probeUrl = `${sinkOrigin}/sink?probe=detector`
  await fetch(probeUrl, { headers: { referer: `${siteOrigin}/?seed=leak-probe` } })
  const probe = sinkRecords.find((record) => record.url.startsWith('/sink?probe=detector'))
  sc.assert(probe && String(probe.referer).includes('leak-probe'), 'controlled sink records a Referer when one is sent (detector is live)', { referer: probe?.referer ?? null })
  sinkRecords.length = 0

  const seed = 'privacy-seed-7f3a'
  const bundle = await newGuardedPage(browser, {
    allowedOrigins: [siteOrigin, sinkOrigin],
    permissions: ['clipboard-read', 'clipboard-write'],
    origin: siteOrigin,
  })
  const page = bundle.page
  await page.goto(`${siteOrigin}/?seed=${encodeURIComponent(seed)}&name=Ada&style=ascii-letter&size=128`)
  await page.waitForSelector('#preview svg')
  await page.waitForLoadState('networkidle')

  sc.case('privacy copy matches actual URL and share behaviour')
  const privacy = await page.locator('#privacy').textContent()
  sc.assert(/page URL/i.test(privacy), 'privacy copy says inputs are kept in the page URL', { privacy })
  sc.assert(/browser history/i.test(privacy), 'privacy copy says inputs may appear in browser history', { privacy })
  sc.assert(/not a secret or email/i.test(privacy), 'privacy copy warns not to use a secret or email', { privacy })
  const actual = await page.evaluate(() => ({
    href: location.href,
    search: location.search,
    seed: new URLSearchParams(location.search).get('seed'),
    name: new URLSearchParams(location.search).get('name'),
    style: new URLSearchParams(location.search).get('style'),
    size: new URLSearchParams(location.search).get('size'),
    historyLength: history.length,
    referrer: document.referrer,
    shareVisible: Boolean(document.getElementById('share')) && document.getElementById('share')?.textContent === 'Copy link',
  }))
  sc.assert(actual.seed === seed && actual.name === 'Ada' && actual.style === 'ascii-letter' && actual.size === '128', 'actual URL carries the current seed, name, style and size', actual)
  sc.assert(actual.search.includes(encodeURIComponent(seed)) || actual.search.includes(seed), 'seed is visibly encoded in the address-bar URL', { search: actual.search })
  sc.assert(actual.referrer === '', 'document has no referrer', { referrer: actual.referrer })
  sc.assert(actual.shareVisible, 'share action is explicitly visible as Copy link', { visible: actual.shareVisible })

  await page.getByLabel('Seed', { exact: true }).fill('second-privacy-seed')
  await page.waitForFunction(() => new URLSearchParams(location.search).get('seed') === 'second-privacy-seed')
  const afterEdit = await page.evaluate(() => ({
    href: location.href,
    historyLength: history.length,
    seed: new URLSearchParams(location.search).get('seed'),
  }))
  sc.assert(afterEdit.seed === 'second-privacy-seed', 'edit updates the visible URL seed', afterEdit)
  sc.assert(afterEdit.historyLength === actual.historyLength, 'replaceState edits do not create per-keystroke history entries', { before: actual.historyLength, after: afterEdit.historyLength })

  await page.getByRole('button', { name: 'Copy link', exact: true }).click()
  await page.waitForFunction(() => (document.querySelector('#status')?.textContent ?? '') !== '', null, { timeout: 5000 }).catch(() => {})
  const shareStatus = await page.locator('#status').textContent()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  const currentUrl = page.url()
  sc.assert(shareStatus === 'Share link copied.', 'share action reports fixed status copy', { status: shareStatus })
  sc.assert(clipboard === currentUrl && clipboard.includes('second-privacy-seed'), 'copied share URL equals the visible current URL and is not a hidden secret', { clipboard, currentUrl })

  sc.case('controlled outgoing link sends no Referer under no-referrer')
  const externalLinks = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((anchor) => anchor.href).filter((href) => /^https?:\/\//.test(href) && !href.startsWith('http://127.0.0.1')))
  await page.evaluate((href) => {
    const link = document.createElement('a')
    link.id = 's7-sink-link'
    link.href = href
    link.textContent = 'controlled sink'
    document.body.append(link)
  }, `${sinkOrigin}/sink?from=controlled`)
  await Promise.all([
    page.waitForURL((url) => url.href.startsWith(`${sinkOrigin}/sink`)),
    page.click('#s7-sink-link'),
  ])
  await page.waitForLoadState('domcontentloaded')
  const sinkRecord = sinkRecords.find((record) => record.url.startsWith('/sink?from=controlled'))
  sc.assert(Boolean(sinkRecord), 'controlled localhost sink received the outgoing link request', { sinkRecord: sinkRecord ?? null })
  sc.assert(sinkRecord && (sinkRecord.referer === null || sinkRecord.referer === ''), 'no Referer header is sent under no-referrer', { referer: sinkRecord?.referer ?? null })
  sc.assert(!String(sinkRecord?.referer ?? '').includes('privacy-seed') && !String(sinkRecord?.referer ?? '').includes('second-privacy-seed'), 'Referer contains no seed URL', { referer: sinkRecord?.referer ?? null })
  const sinkDocument = await page.evaluate(() => ({ referrer: document.referrer, href: location.href }))
  sc.assert(sinkDocument.referrer === '', 'sink page document.referrer is empty', sinkDocument)
  sc.assert(bundle.events.requests.every((request) => isLocalUrl(request.url, [siteOrigin, sinkOrigin])), 'all source-page requests are local only', { external: bundle.events.requests.filter((request) => !isLocalUrl(request.url, [siteOrigin, sinkOrigin])) })
  sc.assert(bundle.blockedAttempts.length === 0, 'no external request was attempted or blocked', { attempts: bundle.blockedAttempts })
  for (const request of bundle.events.requests) {
    const referer = request.headers?.referer ?? ''
    sc.assert(!referer.includes('privacy-seed') && !referer.includes('second-privacy-seed'), `request ${request.resourceType} carries no seed in Referer`, { url: request.url, referer })
  }
  sc.note(`External links present in page source (${externalLinks.length}) were not clicked; only the controlled localhost sink was contacted.`)
  await bundle.context.close()
}

async function runS7_05(sc, { browser, installed, golden, goldenHashes, sinkOrigin }) {
  sc.case('installed package Node network guard')
  const workerPath = path.join(probesDir, 'network-guard.mjs')
  await fsp.mkdir(probesDir, { recursive: true })
  await fsp.writeFile(
    workerPath,
    [
      "import { createHash } from 'node:crypto'",
      "import fs from 'node:fs'",
      "import { createRequire } from 'node:module'",
      "import { pathToFileURL } from 'node:url'",
      'const require = createRequire(import.meta.url)',
      "const http = require('node:http')",
      "const https = require('node:https')",
      "const net = require('node:net')",
      "const dns = require('node:dns')",
      'const calls = []',
      'const patchFailures = []',
      'const block = (name) => (...args) => { calls.push({ name, argCount: args.length }); throw new Error(`S7-05 network guard blocked ${name}`) }',
      'const patch = (object, name) => { try { Object.defineProperty(object, name, { configurable: true, writable: true, value: block(name) }) } catch (error) { patchFailures.push({ name, error: String(error.message) }) } }',
      'for (const name of ["request", "get"]) { patch(http, name); patch(https, name); }',
      'for (const name of ["connect", "createConnection"]) patch(net, name)',
      'for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) patch(dns, name)',
      'for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) patch(dns.promises, name)',
      'patch(globalThis, "fetch")',
      'patch(globalThis, "WebSocket")',
      'const [consumerPackage, goldenPath, resultPath] = process.argv.slice(2)',
      'const consumerRequire = createRequire(consumerPackage)',
      'const entry = consumerRequire.resolve("dither-face")',
      'const pkg = await import(pathToFileURL(entry).href)',
      'const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"))',
      'const hashes = {}',
      'for (const style of Object.keys(golden.styles)) {',
      '  const svg = pkg.ditherFace(golden.input.seed, { style, px: golden.input.px, name: golden.input.name })',
      '  hashes[style] = createHash("sha256").update(svg).digest("hex")',
      '}',
      'fs.writeFileSync(resultPath, JSON.stringify({ calls, patchFailures, hashes, rss: process.memoryUsage().rss }))',
    ].join('\n'),
  )
  const normalizedGoldenPath = path.join(probesDir, 'golden-normalized.json')
  await writeJson(normalizedGoldenPath, { input: golden.input, styles: goldenHashes })
  const guardResultPath = path.join(workDir, 'network-guard-result.json')
  const guard = await runChildProcess({
    label: 's7-05-network-guard',
    script: workerPath,
    scriptArgs: [path.join(consumerDir, 'package.json'), normalizedGoldenPath, guardResultPath],
    timeoutMs: childTimeoutMs,
  })
  sc.assert(guard.exitCode === 0 && !guard.timedOut, 'Node network-guard probe exits 0 within the 10s cap', { exitCode: guard.exitCode, timedOut: guard.timedOut, stderr: guard.stderr.slice(-1000) })
  let guardData = null
  try { guardData = await readJson(guardResultPath) } catch { guardData = null }
  sc.assert(guardData?.patchFailures?.length === 0, 'all Node network APIs were successfully guarded', { failures: guardData?.patchFailures ?? null })
  sc.assert(guardData?.calls?.length === 0, 'rendering all eight styles calls no network API', { calls: guardData?.calls ?? null })
  for (const [style, hash] of Object.entries(goldenHashes)) {
    sc.assert(guardData?.hashes?.[style] === hash, `${style}: guarded Node output matches frozen golden`, { expected: hash, actual: guardData?.hashes?.[style] ?? null })
  }

  sc.case('browser: all eight render offline with zero requests')
  const bundle = await newGuardedPage(browser, { allowedOrigins: [siteOrigin, sinkOrigin] })
  const page = bundle.page
  await page.goto(`${siteOrigin}/?seed=preview-output&name=7even&style=pixel-sprite&size=80`)
  await page.waitForSelector('#preview svg')
  await page.waitForLoadState('networkidle')
  const requestsBefore = bundle.events.requests.length
  const failuresBefore = bundle.events.requestFailures.length
  await bundle.context.setOffline(true)
  for (const style of installed.pkg.STYLES) {
    await page.getByRole('button', { name: `Select ${style.title}`, exact: true }).click()
    await page.waitForFunction((title) => document.querySelector('#selected-title')?.textContent === title, style.title)
    const source = await page.evaluate(() => document.querySelector('#svg-source').value)
    sc.assert(sha256(source) === goldenHashes[style.slug], `offline ${style.slug}: rendered output matches frozen golden`, { expected: goldenHashes[style.slug], actual: sha256(source) })
    sc.assert((await page.locator('#preview svg').count()) === 1, `offline ${style.slug}: preview SVG present`)
  }
  const requestsAfter = bundle.events.requests.length
  const failuresAfter = bundle.events.requestFailures.length
  sc.assert(requestsAfter === requestsBefore, 'no request is attempted after network is disabled', { before: requestsBefore, after: requestsAfter })
  sc.assert(failuresAfter === failuresBefore, 'no failed request is attempted after network is disabled', { before: failuresBefore, after: failuresAfter })
  sc.assert(bundle.blockedAttempts.length === 0, 'no blocked external attempt during offline rendering', { attempts: bundle.blockedAttempts })
  const galleryCount = await page.locator('#gallery svg').count()
  sc.assert(galleryCount === 8, 'all eight gallery avatars remain rendered offline', { count: galleryCount })
  const screenshot = await takeScreenshot(page, 's7-05-offline-eight')
  sc.note(`Offline rendering screenshot: ${screenshot.path}`)
  await bundle.context.close()

  sc.case('no dynamic or external font')
  const css = await fsp.readFile(path.join(siteDir, 'site.css'), 'utf8')
  sc.assert(!/@font-face/i.test(css), 'site CSS contains no @font-face rule')
  sc.assert(!/url\(\s*['"]?https?:/i.test(css), 'site CSS contains no external font URL')
  sc.assert(!/fonts\.(?:googleapis|gstatic)/i.test(css), 'site CSS references no third-party font host')
  const fontRequests = bundleFontRequests(bundle)
  sc.assert(fontRequests.length === 0, 'no font resource request was made', { fontRequests })
  sc.note('ASCII styles declare a system monospace stack; no webfont download or FontFace API use is present.')
}

function bundleFontRequests(bundle) {
  return (bundle?.events?.requests ?? []).filter((request) => request.resourceType === 'font' || /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(request.url))
}

async function runS7_06(sc, { installed }) {
  const manifest = await readJson(sourceManifestPath)
  const allowlist = await readJson(allowlistPath)
  const findings = []
  const reviewed = []
  const scopeStats = {}

  sc.case('tracked source scan')
  for (const file of manifest.files) {
    const full = path.join(repo, file.path)
    const text = await fsp.readFile(full, 'utf8')
    findings.push(...scanText(text, file.path))
    if (excludedFileName(file.path)) {
      const review = reviewedFalsePositive(file.path, 'excluded-file-name')
      if (review) reviewed.push({ file: file.path, line: 1, type: 'excluded-file-name', redacted: true, reason: review.reason })
      else findings.push({ file: file.path, line: 1, type: 'excluded-file-name', redacted: true })
    }
  }
  scopeStats.trackedSource = { files: manifest.fileCount, findings: findings.length }

  sc.case('tarball manifest and content scan')
  const tarList = await runCommand({ label: 's7-06-tar-list', command: `tar -tzf ${shellQuote(tarballPath)}`, cwd: workDir, timeoutMs: 60_000 })
  const tarEntries = (tarList.stdout ?? '').trim().split('\n').filter(Boolean)
  const expectedEntries = new Set(allowlist.files)
  sc.assert(tarList.exitCode === 0, 'tar listing exits 0', { exitCode: tarList.exitCode })
  sc.assert(tarEntries.length === expectedEntries.size && tarEntries.every((entry) => expectedEntries.has(entry)), 'tarball contains exactly the approved allowlist entries', { count: tarEntries.length, unexpected: tarEntries.filter((entry) => !expectedEntries.has(entry)), missing: [...expectedEntries].filter((entry) => !tarEntries.includes(entry)) })
  const forbidden = allowlist.forbiddenPatterns.map((source) => new RegExp(source))
  const forbiddenHits = tarEntries.filter((entry) => forbidden.some((pattern) => pattern.test(entry)) || excludedFileName(entry))
  sc.assert(forbiddenHits.length === 0, 'tarball contains no source, secrets, maps, logs, env, backups or auth files', { hits: forbiddenHits })
  const packageFiles = await walkFiles(extractedPackageDir)
  const tarballFindingsBefore = findings.length
  for (const file of packageFiles) {
    const entry = `package/${path.relative(extractedPackageDir, file).split(path.sep).join('/')}`
    const text = await fsp.readFile(file, 'utf8')
    findings.push(...scanText(text, entry))
  }
  scopeStats.tarball = { files: packageFiles.length, findings: findings.length - tarballFindingsBefore }

  sc.case('qualification fixture scan')
  const fixtureFindingsBefore = findings.length
  for (const file of manifest.files.filter((entry) => entry.path.startsWith('tests/qualification/'))) {
    const text = await fsp.readFile(path.join(repo, file.path), 'utf8')
    findings.push(...scanText(text, file.path))
    if (excludedFileName(file.path)) {
      const review = reviewedFalsePositive(file.path, 'excluded-file-name')
      if (review) {
        if (!reviewed.some((entry) => entry.file === file.path)) reviewed.push({ file: file.path, line: 1, type: 'excluded-file-name', redacted: true, reason: review.reason })
      } else {
        findings.push({ file: file.path, line: 1, type: 'excluded-file-name', redacted: true })
      }
    }
  }
  scopeStats.qualificationFixtures = { findings: findings.length - fixtureFindingsBefore }

  sc.case('raw log and phase-record scan')
  const logFindingsBefore = findings.length
  const scanLogRoots = [logsDir]
  for (const root of scanLogRoots) {
    if (!fs.existsSync(root)) continue
    for (const file of await walkFiles(root)) {
      const text = await fsp.readFile(file, 'utf8')
      findings.push(...scanText(text, path.relative(repo, file).split(path.sep).join('/')))
    }
  }
  for (const file of ['prepare.json', 'install.json']) {
    const full = path.join(outDir, file)
    if (fs.existsSync(full)) {
      const text = await fsp.readFile(full, 'utf8')
      findings.push(...scanText(text, path.relative(repo, full).split(path.sep).join('/')))
    }
  }
  scopeStats.logs = { findings: findings.length - logFindingsBefore }

  sc.case('secret classifier negative control with clearly fake canary')
  const canary = {
    aws: 'AKIA' + 'Q'.repeat(16),
    github: 'ghp_' + 'Z'.repeat(36),
    npm: 'npm_' + 'M'.repeat(36),
    privateKey: '-----BEGIN ' + 'PRIVATE KEY-----',
    env: 'AWS_SECRET_ACCESS_KEY=' + 'A'.repeat(40),
  }
  const canaryText = [
    'synthetic canary, not a real credential',
    canary.aws,
    canary.github,
    canary.npm,
    canary.privateKey,
    canary.env,
  ].join('\n')
  const canaryFindings = scanText(canaryText, 'synthetic-canary.txt')
  const canaryTypes = [...new Set(canaryFindings.map((finding) => finding.type))].sort()
  sc.assert(canaryFindings.length >= 5, 'conservative classifier detects the synthetic canary types', { types: canaryTypes })
  for (const type of ['aws_access_key', 'github_token', 'npm_token', 'private_key_block', 'auth_env_assignment']) {
    sc.assert(canaryTypes.includes(type), `classifier detects ${type} shape`, { types: canaryTypes })
  }
  const canarySerialized = JSON.stringify(canaryFindings)
  sc.assert(!Object.values(canary).some((value) => canarySerialized.includes(value)), 'classifier output contains no canary value, only redacted file/line/type metadata', { findingCount: canaryFindings.length, redacted: true })
  sc.note('The canary is synthetic and exists only in memory; no canary value is written to evidence or logs. Scanner findings include file, line, type and redacted=true only.')

  sc.case('artifact and runtime environment leak scan')
  const artifactRoots = [siteDir, path.dirname(path.dirname(installed.resolved))]
  const hostMarkers = ['/Users/', '/home/', '/blaxel/', 'dither-face-blaxel-runner', 'PLAYWRIGHT_BROWSERS_PATH=']
  const sensitiveEnv = Object.entries(process.env).filter(([name, value]) => /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|AUTH|_KEY$|API_KEY)/i.test(name) && typeof value === 'string' && value.length >= 12)
  const artifactFindings = []
  let artifactFiles = 0
  for (const root of artifactRoots) {
    if (!fs.existsSync(root)) continue
    for (const file of await walkFiles(root)) {
      artifactFiles += 1
      const text = await fsp.readFile(file, 'utf8')
      const relative = path.relative(root, file).split(path.sep).join('/')
      for (const marker of hostMarkers) {
        if (text.includes(marker)) artifactFindings.push({ file: relative, line: 1, type: 'host-path-marker', marker, redacted: true })
      }
      if (/process\.env\.[A-Za-z_]/.test(text)) artifactFindings.push({ file: relative, line: 1, type: 'runtime-env-reference', redacted: true })
      for (const [name, value] of sensitiveEnv) {
        if (text.includes(value)) artifactFindings.push({ file: relative, line: 1, type: 'sensitive-env-value', variable: name, redacted: true })
      }
      if (excludedFileName(relative)) artifactFindings.push({ file: relative, line: 1, type: 'excluded-file-name', redacted: true })
    }
  }
  sc.assert(artifactFindings.length === 0, 'built site and installed package embed no local environment values or excluded files', { findings: artifactFindings, sensitiveEnvChecked: sensitiveEnv.length, artifactFiles })

  sc.case('scanner result')
  const uniqueFindings = [...new Map(findings.map((finding) => [`${finding.file}:${finding.line}:${finding.type}`, finding])).values()]
  sc.assert(uniqueFindings.length === 0, 'scoped source, tarball, fixtures and logs contain no credential or excluded material', { findings: uniqueFindings, scopes: scopeStats })
  sc.note(`Findings, if any, are reported as redacted file+line+type only and require human review; this scan is conservative and is not proof that arbitrary prose contains no secret. The scan reads only the uploaded repo, tarball, qualification fixtures and own evidence logs, never home auth files. Reviewed false positive(s): ${reviewed.length ? reviewed.map((entry) => `${entry.file} (${entry.type})`).join(', ') : 'none'}.`)
  for (const entry of reviewed) sc.note(`Reviewed false positive retained for parent review: ${entry.file} [${entry.type}] - ${entry.reason}`)

  await writeJson(path.join(outDir, 'artifacts/s7-06-scan.json'), {
    scopes: scopeStats,
    findings: uniqueFindings,
    artifactFindings,
    sensitiveEnvChecked: sensitiveEnv.length,
    canary: { findingCount: canaryFindings.length, types: canaryTypes, redacted: true },
    reviewedFalsePositives: reviewed,
    excludedFileNamePatterns: patternData.excludedFileNamePatterns,
    patternVersion: patternData.version,
  })
}

async function runS7_07(sc, { installed, golden }) {
  const pkg = installed.pkg
  const extremeSeed = `s7-extreme-${'x'.repeat(extremeSeedLength - 11)}`
  const pathologicalSeed = `${'\u0301'.repeat(200_000)}\u202e\u200b\u2028\u2029\u0000\u0001\ud800`
  const workerPath = path.join(probesDir, 'extreme-render.mjs')
  await fsp.mkdir(probesDir, { recursive: true })
  await fsp.writeFile(
    workerPath,
    [
      "import { createHash } from 'node:crypto'",
      "import fs from 'node:fs'",
      "import { createRequire } from 'node:module'",
      "import { pathToFileURL } from 'node:url'",
      'const [consumerPackage, specPath, resultPath] = process.argv.slice(2)',
      'const require = createRequire(consumerPackage)',
      'const entry = require.resolve("dither-face")',
      'const pkg = await import(pathToFileURL(entry).href)',
      'const spec = JSON.parse(fs.readFileSync(specPath, "utf8"))',
      'const invalidCalls = {',
      '  "px-nan": (style, seed) => pkg.ditherFace(seed, { style, px: Number.NaN }),',
      '  "px-infinity": (style, seed) => pkg.ditherFace(seed, { style, px: Number.POSITIVE_INFINITY }),',
      '  "px-zero": (style, seed) => pkg.ditherFace(seed, { style, px: 0 }),',
      '  "px-negative": (style, seed) => pkg.ditherFace(seed, { style, px: -1 }),',
      '  "px-string": (style, seed) => pkg.ditherFace(seed, { style, px: "80" }),',
      '  "px-null": (style, seed) => pkg.ditherFace(seed, { style, px: null }),',
      '  "name-number": (style, seed) => pkg.ditherFace(seed, { style, name: 7 }),',
      '  "unknown-style": (style, seed) => pkg.ditherFace(seed, { style: "<script>alert(1)</script>" }),',
      '  "options-null": (style, seed) => pkg.ditherFace(seed, null),',
      '  "options-array": (style, seed) => pkg.ditherFace(seed, []),',
      '  "seed-number": (style, seed) => pkg.ditherFace(7, { style }),',
      '}',
      'const start = process.hrtime.bigint()',
      'const results = []',
      'for (const item of spec.items) {',
      '  try {',
      '    const svg = item.invalid ? invalidCalls[item.invalid](item.style, item.seed) : pkg.ditherFace(item.seed, item.options)',
      '    results.push({ id: item.id, ok: true, sha256: createHash("sha256").update(svg).digest("hex"), bytes: svg.length, svg })',
      '  } catch (error) {',
      '    results.push({ id: item.id, ok: false, errorName: error?.name ?? "Error", errorMessage: String(error?.message ?? error).slice(0, 200) })',
      '  }',
      '}',
      'const usage = process.resourceUsage()',
      'const memory = process.memoryUsage()',
      'fs.writeFileSync(resultPath, JSON.stringify({ results, metrics: { wallMs: Number(process.hrtime.bigint() - start) / 1e6, maxRSS: usage.maxRSS * 1024, heapUsed: memory.heapUsed, rss: memory.rss, userCPUMicros: usage.userCPUTime, systemCPUMicros: usage.systemCPUTime, seedLength: spec.items[0]?.seed?.length ?? 0 } }))',
    ].join('\n'),
  )

  sc.case('1 MB seed and pathological Unicode across all eight styles')
  const summaries = []
  for (const style of pkg.STYLES) {
    const items = [
      { id: `extreme-seed-${style.slug}`, seed: extremeSeed, options: { style: style.slug, px: 80 } },
      { id: `pathological-${style.slug}`, seed: pathologicalSeed, options: { style: style.slug, px: 80, name: pathologicalSeed } },
      { id: `large-px-${style.slug}-1e9`, seed: 'large-px', options: { style: style.slug, px: 1e9 } },
      { id: `large-px-${style.slug}-max`, seed: 'large-px', options: { style: style.slug, px: Number.MAX_VALUE } },
      ...['px-nan', 'px-infinity', 'px-zero', 'px-negative', 'px-string', 'px-null', 'name-number', 'unknown-style', 'options-null', 'options-array', 'seed-number'].map((invalid) => ({
        id: `invalid-${style.slug}-${invalid}`,
        invalid,
        style: style.slug,
        seed: 'safe',
      })),
    ]
    const specPath = path.join(probesDir, `extreme-${style.slug}.json`)
    const resultPath = path.join(probesDir, `extreme-${style.slug}-result.json`)
    await writeJson(specPath, { style: style.slug, items })
    const run = await runChildProcess({
      label: `s7-07-extreme-${style.slug}`,
      script: workerPath,
      scriptArgs: [path.join(consumerDir, 'package.json'), specPath, resultPath],
      nodeArgs: [`--max-old-space-size=${childHeapMb}`],
      timeoutMs: childTimeoutMs,
    })
    sc.assert(run.exitCode === 0 && !run.timedOut, `${style.slug}: extreme-input child exits 0 within 10s`, { exitCode: run.exitCode, timedOut: run.timedOut, signal: run.signal })
    let data = null
    try { data = await readJson(resultPath) } catch { data = null }
    sc.assert(Boolean(data), `${style.slug}: extreme-input child produced a metrics record`)
    sc.assert(data?.metrics?.wallMs < childTimeoutMs, `${style.slug}: measured wall time is below the declared 10s limit`, { wallMs: data?.metrics?.wallMs ?? null })
    sc.assert(data?.metrics?.heapUsed < childHeapMb * 1024 * 1024, `${style.slug}: measured heap stays below the 256 MB child cap`, { heapUsed: data?.metrics?.heapUsed ?? null })
    const valid = (data?.results ?? []).filter((item) => !item.id.startsWith('invalid-'))
    const invalid = (data?.results ?? []).filter((item) => item.id.startsWith('invalid-'))
    for (const item of valid) {
      sc.assert(item.ok === true, `${style.slug} ${item.id}: valid extreme input renders`, { error: item.errorName ?? null })
      if (item.ok) {
        sc.assert(typeof item.svg === 'string' && item.svg.startsWith('<svg '), `${style.slug} ${item.id}: output is a standalone SVG`, { bytes: item.bytes })
      }
    }
    for (const item of invalid) {
      sc.assert(item.ok === false, `${style.slug} ${item.id}: invalid option is rejected, not silently accepted`, { errorName: item.errorName ?? null })
      sc.assert(['TypeError', 'RangeError', 'Error'].includes(item.errorName), `${style.slug} ${item.id}: rejection uses a documented error class`, { errorName: item.errorName })
    }
    summaries.push({ style: style.slug, metrics: data?.metrics ?? null, valid: valid.length, invalid: invalid.length, failures: [...valid, ...invalid].filter((item) => (item.id.startsWith('invalid-') ? item.ok !== false : item.ok !== true)).length })
  }
  sc.assert(summaries.every((summary) => summary.failures === 0), 'all eight styles complete the bounded extreme-input matrix', { summaries })
  sc.note('Timing and memory numbers are bounded samples of this sandbox run. No constant-time or unbounded-input promise is made.')

  sc.case('independent XML parse of extreme outputs')
  const successful = []
  for (const style of pkg.STYLES) {
    const data = await readJson(path.join(probesDir, `extreme-${style.slug}-result.json`))
    for (const item of data.results.filter((entry) => entry.ok)) successful.push({ case: item.id, svg: item.svg })
  }
  const xml = await parseXmlBatch(successful, path.join(artifactsDir, 's7-07-svgs.json'), path.join(artifactsDir, 's7-07-xml.json'), 'S7-07')
  sc.assert(xml.result?.failed?.length === 0, 'extreme-input SVG outputs parse as well-formed XML', { failed: xml.result?.failed ?? null })
  sc.assert(xml.result?.rootTags?.length === 1 && xml.result.rootTags[0] === '{http://www.w3.org/2000/svg}svg', 'extreme-input outputs retain the SVG root', { rootTags: xml.result?.rootTags ?? null })

  sc.case('documented FNV-1a collision is not a vulnerability')
  const seen = new Map()
  let pair = null
  for (let index = 0; index < 300_000 && !pair; index += 1) {
    const candidate = `s7-collision-${index}`
    const hash = pkg.fnv1a(candidate)
    if (seen.has(hash)) pair = [seen.get(hash), candidate]
    else seen.set(hash, candidate)
  }
  if (pair) {
    const a = pkg.ditherFace(pair[0], { style: 'pixel-sprite', px: 80 })
    const b = pkg.ditherFace(pair[1], { style: 'pixel-sprite', px: 80 })
    sc.assert(a === b, 'colliding 32-bit hashes render identical bytes as documented, not a security defect', { pair, sha256: sha256(a) })
    sc.note(`Found a documented 32-bit FNV-1a collision in ${pair.length} sampled seed pairs; identical output is expected and is not classified as a vulnerability.`)
  } else {
    sc.note('No FNV-1a collision was found in 300,000 sampled seeds; the documentation already states collisions are possible and are not a uniqueness or security guarantee.')
  }
  await writeJson(path.join(outDir, 'artifacts/s7-07-extremes.json'), {
    limits: { childHeapMb, childTimeoutMs, extremeSeedLength, pathologicalSeedLength: pathologicalSeed.length },
    summaries,
    collision: pair ? { found: true, sameOutput: true } : { found: false },
  })
}

async function runS7_08(sc, { installed, golden }) {
  const batchWorker = path.join(probesDir, 'bounded-batch.mjs')
  const oomWorker = path.join(probesDir, 'oom-probe.mjs')
  await fsp.mkdir(probesDir, { recursive: true })
  await fsp.writeFile(
    batchWorker,
    [
      "import fs from 'node:fs'",
      "import { createRequire } from 'node:module'",
      "import { pathToFileURL } from 'node:url'",
      'const [consumerPackage, specPath, resultPath] = process.argv.slice(2)',
      'const require = createRequire(consumerPackage)',
      'const pkg = await import(pathToFileURL(require.resolve("dither-face")).href)',
      'const spec = JSON.parse(fs.readFileSync(specPath, "utf8"))',
      'const deadline = Date.now() + spec.deadlineMs',
      'let count = 0',
      'let bytes = 0',
      'const started = Date.now()',
      'while (count < spec.target && Date.now() < deadline) {',
      '  const svg = pkg.ditherFace(spec.seed, { style: spec.style, px: 80 })',
      '  bytes += svg.length',
      '  count += 1',
      '}',
      'const usage = process.resourceUsage()',
      'fs.writeFileSync(resultPath, JSON.stringify({ count, target: spec.target, deadlineMs: spec.deadlineMs, stoppedEarly: count < spec.target, wallMs: Date.now() - started, bytes, maxRSS: usage.maxRSS * 1024, heapUsed: process.memoryUsage().heapUsed }))',
    ].join('\n'),
  )
  await fsp.writeFile(
    oomWorker,
    [
      "import fs from 'node:fs'",
      "import { createRequire } from 'node:module'",
      "import { pathToFileURL } from 'node:url'",
      'const [consumerPackage, specPath, resultPath] = process.argv.slice(2)',
      'const require = createRequire(consumerPackage)',
      'const pkg = await import(pathToFileURL(require.resolve("dither-face")).href)',
      'const spec = JSON.parse(fs.readFileSync(specPath, "utf8"))',
      'const retained = []',
      'for (let index = 0; index < spec.target; index += 1) {',
      '  retained.push(pkg.ditherFace(`${spec.seed}-${index}`, { style: spec.style, px: 80 }))',
      '}',
      'fs.writeFileSync(resultPath, JSON.stringify({ count: retained.length }))',
    ].join('\n'),
  )

  sc.case('sandbox and child caps are declared before execution')
  sc.assert(childHeapMb === 256 && childTimeoutMs === 10_000, 'declared caps are 256 MB child heap and 10s per child', { childHeapMb, childTimeoutMs })
  const freeBefore = await runCommand({ label: 's7-08-free-before', command: "grep -E '^(MemTotal|MemFree|MemAvailable):' /proc/meminfo", cwd: workDir, timeoutMs: 30_000 })
  sc.assert(freeBefore.exitCode === 0, 'sandbox memory snapshot succeeds')

  sc.case('huge batch stops at the declared deadline')
  const batchSpec = path.join(probesDir, 'bounded-batch.json')
  const batchResult = path.join(probesDir, 'bounded-batch-result.json')
  await writeJson(batchSpec, { seed: 's7-batch', style: 'pixel-sprite', target: 1_000_000, deadlineMs: batchDeadlineMs })
  const batch = await runChildProcess({
    label: 's7-08-bounded-batch',
    script: batchWorker,
    scriptArgs: [path.join(consumerDir, 'package.json'), batchSpec, batchResult],
    nodeArgs: [`--max-old-space-size=${childHeapMb}`],
    timeoutMs: childTimeoutMs,
  })
  const batchData = await readJson(batchResult).catch(() => null)
  sc.assert(batch.exitCode === 0 && !batch.timedOut, 'huge-batch child exits 0 within its 10s wall cap', { exitCode: batch.exitCode, timedOut: batch.timedOut, signal: batch.signal })
  sc.assert(batchData?.count > 0, 'huge-batch child completed at least one render', { count: batchData?.count ?? null })
  sc.assert(batchData?.count <= batchData?.target, 'huge-batch child never exceeds the declared work target', { count: batchData?.count ?? null, target: batchData?.target ?? null })
  sc.assert(batchData?.wallMs < childTimeoutMs, 'huge-batch child respects the 8s internal deadline and 10s wall cap', { wallMs: batchData?.wallMs ?? null })
  sc.assert(batchData?.heapUsed < childHeapMb * 1024 * 1024, 'huge-batch heap stays below the 256 MB child cap', { heapUsed: batchData?.heapUsed ?? null })
  sc.note(`Huge batch completed ${batchData?.count ?? 'unknown'} of ${batchData?.target ?? 'unknown'} renders; stoppedEarly=${batchData?.stoppedEarly ?? 'unknown'}. The workload is deliberately bounded rather than a claim of unbounded throughput.`)

  sc.case('disposable child OOM is a runtime limit, not a package contract failure')
  const oomSpec = path.join(probesDir, 'oom-probe.json')
  const oomResult = path.join(probesDir, 'oom-probe-result.json')
  await writeJson(oomSpec, { seed: 's7-oom', style: 'pixel-sprite', target: 2_000_000 })
  const oom = await runChildProcess({
    label: 's7-08-engine-oom',
    script: oomWorker,
    scriptArgs: [path.join(consumerDir, 'package.json'), oomSpec, oomResult],
    nodeArgs: ['--max-old-space-size=32'],
    timeoutMs: childTimeoutMs,
  })
  const oomMarker = /heap out of memory|Allocation failed|JavaScript heap/i.test(oom.stderr)
  sc.assert(!oom.timedOut, 'engine OOM child terminates before the 10s wall cap', { timedOut: oom.timedOut, exitCode: oom.exitCode, signal: oom.signal })
  sc.assert(oom.exitCode !== 0 || oom.signal !== null, 'engine OOM child exits non-zero or is signalled', { exitCode: oom.exitCode, signal: oom.signal })
  sc.assert(oomMarker, 'engine reports a V8 heap/OOM condition', { stderrExcerpt: oom.stderr.slice(-1200) })
  sc.assert(!(await processAlive(oom.pid)), 'OOM child is fully reaped and leaves no running process', { pid: oom.pid })
  let oomCompleted = null
  try { oomCompleted = await readJson(oomResult) } catch { oomCompleted = null }
  sc.assert(oomCompleted === null, 'OOM child did not claim successful completion', { completed: oomCompleted })
  sc.note('Classification: a fatal V8 heap OOM is an engine/runtime resource limit. The library is not required to catch fatal OOM; no such safety claim is made. The child was disposable and capped at 32 MB heap.')

  sc.case('sandbox remains healthy after capped experiments')
  const alive = await runCommand({ label: 's7-08-alive', command: "node -e \"process.stdout.write('alive')\"", cwd: workDir, timeoutMs: 30_000 })
  sc.assert(alive.exitCode === 0 && alive.stdout.includes('alive'), 'sandbox Node runtime is still responsive', { exitCode: alive.exitCode })
  const fresh = await runCommand({
    label: 's7-08-fresh-render',
    command: `node --input-type=module -e ${shellQuote(`import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url'; const r=createRequire(${JSON.stringify(path.join(consumerDir, 'package.json'))}); const p=await import(pathToFileURL(r.resolve('dither-face')).href); const s=p.ditherFace('post-oom',{style:'pixel-sprite',px:80}); process.stdout.write(s.slice(0,4))`)}`,
    cwd: workDir,
    timeoutMs: 30_000,
  })
  sc.assert(fresh.exitCode === 0 && fresh.stdout.includes('<svg'), 'fresh render succeeds after the OOM experiment', { exitCode: fresh.exitCode })
  const freeAfter = await runCommand({ label: 's7-08-free-after', command: "grep -E '^(MemTotal|MemFree|MemAvailable):' /proc/meminfo", cwd: workDir, timeoutMs: 30_000 })
  sc.assert(freeAfter.exitCode === 0, 'post-experiment memory snapshot succeeds')
  await writeJson(path.join(outDir, 'artifacts/s7-08-limits.json'), {
    caps: { childHeapMb, childTimeoutMs, batchDeadlineMs, sandboxMemoryMb: memoryArg },
    batch: batchData,
    oom: { exitCode: oom.exitCode, signal: oom.signal, timedOut: oom.timedOut, marker: oomMarker, pid: oom.pid },
    freeBefore: freeBefore.stdout,
    freeAfter: freeAfter.stdout,
    classification: 'Fatal V8 heap OOM is an engine/runtime resource limit, not a package contract failure; the library is not expected to catch fatal OOM.',
  })
}

async function runNegativeControls({ browser, installed, siteHeaders, golden }) {
  const controls = []
  const badSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.invalid/x"/><rect onload="alert(1)"/><a href="javascript:alert(1)">x</a></svg>'
  const badTypes = [...new Set(inspectSvg(badSvg).map((violation) => violation.type))]
  const cleanSvg = installed.pkg.ditherFace(golden.input.seed, { style: 'pixel-sprite', px: golden.input.px })
  const cleanSvgViolations = inspectSvg(cleanSvg)
  controls.push({
    id: 'NC1',
    name: 'SVG checker detects script/handler/external URI and passes a clean generated SVG',
    detected: ['script-element', 'event-handler-attribute', 'external-reference', 'javascript-reference'].every((type) => badTypes.includes(type)),
    cleanPositivePasses: cleanSvgViolations.length === 0,
    types: badTypes,
  })

  const cleanHeaderProblems = validateCspHeaders(siteHeaders)
  const missingHeaderProblems = validateCspHeaders({})
  const weakHeaderProblems = validateCspHeaders({ 'Content-Security-Policy': "default-src *; script-src 'unsafe-inline' 'unsafe-eval'" })
  controls.push({
    id: 'NC2',
    name: 'CSP checker detects a missing header and unsafe directives, and passes the shipped strict header',
    detected: missingHeaderProblems.includes('missing-csp') && weakHeaderProblems.includes('unsafe-inline') && weakHeaderProblems.includes('unsafe-eval'),
    cleanPositivePasses: cleanHeaderProblems.length === 0,
    missingProblems: missingHeaderProblems,
    weakProblems: weakHeaderProblems,
  })

  const canary = {
    aws: 'AKIA' + 'R'.repeat(16),
    github: 'ghp_' + 'Y'.repeat(36),
    npm: 'npm_' + 'N'.repeat(36),
    privateKey: '-----BEGIN ' + 'PRIVATE KEY-----',
  }
  const canaryText = Object.values(canary).join('\n')
  const canaryFindings = scanText(canaryText, 'synthetic-negative-control.txt')
  const canarySerialized = JSON.stringify(canaryFindings)
  const cleanFindings = scanText('clean documentation without credential material\n', 'clean.txt')
  controls.push({
    id: 'NC3',
    name: 'Secret classifier detects a clearly fake canary and passes clean text, without logging the canary',
    detected: canaryFindings.length >= 4 && !Object.values(canary).some((value) => canarySerialized.includes(value)),
    cleanPositivePasses: cleanFindings.length === 0,
    findingCount: canaryFindings.length,
    types: [...new Set(canaryFindings.map((finding) => finding.type))].sort(),
    redacted: true,
  })

  const bundle = await newGuardedPage(browser, { allowedOrigins: ['http://127.0.0.1:4173'] })
  const page = bundle.page
  await page.setContent('<!doctype html><html><body><p>network negative-control probe</p></body></html>')
  const attemptsBefore = bundle.blockedAttempts.length
  await page.evaluate(() => fetch('http://s7-blocked.invalid/outbound-probe').catch(() => null))
  await sleep(300)
  const attempt = bundle.blockedAttempts.slice(attemptsBefore).find((entry) => entry.url.includes('s7-blocked.invalid'))
  controls.push({
    id: 'NC4',
    name: 'Network interceptor blocks and records a synthetic outbound attempt without a real connection',
    detected: Boolean(attempt),
    cleanPositivePasses: bundle.events.pageErrors.length === 0,
    attempt: attempt ?? null,
    actualOutboundConnection: false,
  })
  await bundle.context.close()

  controls.push({
    id: 'NC5',
    name: 'Normal clean inputs pass every positive checker',
    detected: controls.every((control) => control.cleanPositivePasses === true),
    cleanPositivePasses: cleanSvgViolations.length === 0 && cleanHeaderProblems.length === 0 && cleanFindings.length === 0 && bundle.events.pageErrors.length === 0,
    detail: 'Clean generated SVG, shipped strict headers, clean text and the normal UI page all pass; only the synthetic negative inputs are flagged.',
  })
  return { controls, allDetected: controls.every((control) => control.detected === true && control.cleanPositivePasses === true) }
}

async function runPhaseTest() {
  const record = {
    phase: 'test',
    assertions: 0,
    failures: [],
    scenarios: {},
    commands: [],
    versions: {},
    negativeControls: null,
    limits: { childHeapMb, childTimeoutMs, batchDeadlineMs, sandboxMemoryMb: memoryArg, activeBudgetSeconds: 1800 },
  }
  const expected = await readJson(expectedPath)
  const golden = await readJson(goldenPath)
  const goldenHashes = Object.fromEntries(golden.styles.map((entry) => [entry.slug, entry.sha256]))
  const allowlist = await readJson(allowlistPath)
  const installed = await loadInstalledPackage()
  const sinkRecords = []
  let siteServer = null
  let browser = null
  let sinkServer = null
  let sinkOrigin = null
  let html = null
  try {
    siteServer = startProcess({ label: 's7-site-server', command: 'node scripts/serve-site.mjs --port 4173', cwd: repo })
    await waitForHttp(`${siteOrigin}/`)
    sinkServer = http.createServer((request, response) => {
      sinkRecords.push({
        method: request.method,
        url: request.url,
        referer: request.headers.referer ?? null,
        host: request.headers.host ?? null,
        at: new Date().toISOString(),
      })
      if (String(request.url).startsWith('/evil.js')) {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end('window.__csp_external = 1')
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' })
        response.end('<!doctype html><html><head><meta charset="utf-8"><title>controlled sink</title></head><body><p id="sink">controlled localhost sink</p></body></html>')
      }
    })
    await new Promise((resolve, reject) => {
      sinkServer.once('error', reject)
      sinkServer.listen(0, '127.0.0.1', resolve)
    })
    sinkOrigin = `http://127.0.0.1:${sinkServer.address().port}`
    const playwright = await import(pathToFileURL(path.join(toolsDir, 'node_modules/@playwright/test/index.mjs')).href)
    browser = await playwright.chromium.launch({ headless: true })
    record.versions = {
      playwright: '1.64.1',
      chromium: browser.version(),
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      python: (() => { try { return execFileSync('python3', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return null } })(),
      sinkOrigin,
      siteOrigin,
    }
    const siteHeaders = headersFromSiteFile(await fsp.readFile(path.join(repo, 'site/_headers'), 'utf8'))

    const scenarioRunners = [
      ['S7-01', 'SVG injection', runS7_01],
      ['S7-02', 'UI injection', runS7_02],
      ['S7-03', 'CSP compatibility', runS7_03],
      ['S7-04', 'Referrer and privacy', runS7_04],
      ['S7-05', 'Network behavior', runS7_05],
      ['S7-06', 'Secrets and excluded data', runS7_06],
      ['S7-07', 'Extreme inputs', runS7_07],
      ['S7-08', 'Resource limits', runS7_08],
    ]
    for (const [id, title, runner] of scenarioRunners) {
      const sc = new Scenario(id, title)
      try {
        await runner(sc, { browser, installed, golden, goldenHashes, sinkOrigin, sinkRecords, siteHeaders })
      } catch (error) {
        sc.error(error)
      }
      record.scenarios[id] = sc.finish()
    }
    record.negativeControls = await runNegativeControls({ browser, installed, siteHeaders, golden })
    await writeJson(path.join(outDir, 'negative-controls.json'), {
      stage: 'S7',
      testedAt: new Date().toISOString(),
      controls: record.negativeControls.controls,
      allDetected: record.negativeControls.allDetected,
      note: 'All controls are synthetic/disposable. NC3 reports only redacted metadata; no canary value is written to this file. NC4 aborts at the Playwright route layer and makes no real outbound connection.',
    })
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (sinkServer) await new Promise((resolve) => sinkServer.close(() => resolve()))
    await stopProcess(siteServer)
  }

  const totals = {
    scenarios: Object.keys(record.scenarios).length,
    passed: Object.values(record.scenarios).filter((scenario) => scenario.actualStatus === 'PASS').length,
    failed: Object.values(record.scenarios).filter((scenario) => scenario.actualStatus === 'FAIL').length,
    cases: Object.values(record.scenarios).reduce((sum, scenario) => sum + scenario.cases, 0),
    assertions: Object.values(record.scenarios).reduce((sum, scenario) => sum + scenario.assertions, 0),
    failures: Object.values(record.scenarios).reduce((sum, scenario) => sum + scenario.failures, 0),
    notRun: 0,
    skipped: 0,
  }
  record.totals = totals
  record.commands = commandLog
  record.environment = {
    sandbox: sandboxArg,
    image: imageArg,
    region: regionArg,
    memoryMb: memoryArg,
    cpu: 'platform default (no CPU override)',
    volumes: [],
    ...record.versions,
  }
  record.expectedResultsSha256 = await sha256File(expectedPath)
  record.goldenSha256 = await sha256File(goldenPath)
  record.allowlistSha256 = await sha256File(allowlistPath)
  record.payloadsSha256 = await sha256File(payloadsPath)
  record.patternsSha256 = await sha256File(patternsPath)
  record.toolsLockSha256 = await sha256File(toolsLockPath)
  record.tarball = { expected: expected.expectedTarball.sha256, actual: await sha256File(tarballPath), bytes: (await fsp.stat(tarballPath)).size }
  record.sourceManifest = { commit: commitArg, sha256: (await readJson(sourceManifestPath)).sha256, fileCount: (await readJson(sourceManifestPath)).fileCount }
  record.fixtures = {
    golden: { path: path.relative(repo, goldenPath), sha256: record.goldenSha256, input: golden.input, styles: golden.styles },
    tarballAllowlist: { path: path.relative(repo, allowlistPath), sha256: record.allowlistSha256 },
    injectionPayloads: { path: path.relative(repo, payloadsPath), sha256: record.payloadsSha256, count: payloadData.payloads.length },
    secretPatterns: { path: path.relative(repo, patternsPath), sha256: record.patternsSha256, version: patternData.version },
    toolsLock: { path: path.relative(repo, toolsLockPath), sha256: record.toolsLockSha256 },
  }
  record.limits = { childHeapMb, childTimeoutMs, batchDeadlineMs, sandboxMemoryMb: memoryArg, activeBudgetSeconds: 1800, commandTimeoutSeconds: 600 }
  record.notes = [
    'Agent-observed provisional results only; this file does not approve itself or the stage.',
    'All browser, server, build and resource workloads ran in the declared Blaxel sandbox against the frozen tarball and tracked source.',
    'Low-level rect/disc/asciiGrid are trusted-fragment utilities, not sanitizers; S7-01 records that documented boundary instead of misclassifying it as a vulnerability.',
    'Tests contacted only loopback servers started by this harness; outbound attempts were aborted at the route layer and recorded.',
    'No product source, site source, package dependency, MATRIX, REPORT, PLAN or FINDINGS file was changed by this stage.',
  ]
  await writeJson(path.join(outDir, 'results.json'), record)
  await writeJson(path.join(outDir, 'environment.json'), record.environment)
  if (totals.failures > 0 || totals.failed > 0 || !record.negativeControls.allDetected) {
    throw new Error(`S7 test phase reported failures: ${JSON.stringify(totals)}; negativeControlsAllDetected=${record.negativeControls.allDetected}`)
  }
  return record
}

if (phase === 'prepare') {
  await runPhasePrepare()
  process.exit(0)
} else if (phase === 'install') {
  await runPhaseInstall()
  process.exit(0)
} else if (phase === 'test') {
  await runPhaseTest()
  process.exit(0)
} else {
  throw new Error(`unknown phase: ${phase}`)
}
