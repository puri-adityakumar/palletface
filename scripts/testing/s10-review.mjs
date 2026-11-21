#!/usr/bin/env node
/**
 * Stage 10 independent challenge review harness.
 *
 * Runs only inside a fresh dedicated Blaxel sandbox. It does not modify
 * accepted evidence, expected fixtures, product source or master disposition
 * files. It verifies prior evidence claims, re-runs six independent checks and
 * executes disposable tamper controls.
 *
 * Phases:
 *   prepare — verify hashes, install pinned tools, build the actual site,
 *             install the approved tarball in a fresh consumer, rebuild pack.
 *   test    — audit prior evidence, run independent checks and negative controls.
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
import { compareRgba, scanSvg, sha256 } from './s10-review-compare.mjs'
import { compareGolden } from './s3-golden.mjs'
import { runAudit } from './s10-review-audit.mjs'

const args = process.argv.slice(2)
function arg(name, fallback = null) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const phase = arg('phase')
const repo = path.resolve(arg('repo', '.'))
const out = path.resolve(arg('out', 'out'))
const work = path.resolve(arg('work', 'work'))
const fixtures = path.resolve(arg('fixtures', 'fixtures'))
const sourceManifestPath = path.resolve(arg('source-manifest'))
const auditInputPath = path.resolve(arg('audit-input'))
const evidenceDir = path.resolve(arg('evidence'))
const commit = arg('commit')
const sandbox = arg('sandbox')
const image = arg('image', 'blaxel/ts-app:latest')
const region = arg('region', 'us-pdx-1')
const memory = Number(arg('memory', '4096'))
const activeBudgetSeconds = Number(arg('active-budget', '1800'))
const perCommandTimeoutSeconds = Number(arg('command-timeout', '600'))
const sourceManifestSha = arg('source-manifest-sha')
const tarballPath = path.join(fixtures, 'dither-face-0.1.0.tgz')
const toolsDir = path.join(repo, 'tests/qualification/s8/tools')
const siteDir = path.join(repo, 'dist-site')
const consumerDir = path.join(work, 'consumer')
const browsersPath = path.join(work, 'pw-browsers')
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath

const EXPECTED = {
  sourceCommit: 'f1e17d08878c4ca2278aaeb7aba2d2fdbb7ae3df',
  tarballSha: 'ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021',
  tarballBytes: 23220,
  tarballFiles: 32,
  goldenSha: '7f8a2c7090d85338f3d35e83c344a2adc38bad86353af154a6e86d29db91ae1a',
  s8ExpectedSha: '3ae1bceb155eb58e085c89371d20a3a702ace3935c56b0d0d3c76e0d9e9318c0',
  s6ExpectedSha: '13e4c65d689c3e47a64bf0b23ba2cb8e904da09070093baf191697daabac2b9e',
  s8HarnessSha: '3c7d8056b768120a03362060a91c3adbef9f3efc651a575bb7d88745a7871adf',
  s6HarnessSha: 'daea5cb69753b52474f1fc4289ca6b42c95de83670334c95829a2b7d7cac7e96',
  toolsLockSha: 'e497eda72a8d21b7aa029f2b3a36e03cc24f36e7bfe2275d4f9e24e37be9a6d9',
  golden: {
    'pixel-sprite': '5414be3e1bbb2b9304c9c4a6c7f5f40bc3b4fc88db16397ca46b59315659619a',
    'pixel-letter': 'e8f2d8daacae04528d067dff9662ca3504257617c5a2b3001b8a398662dd04af',
    'dither-orb': 'aa34f938e15fa5118670d99f38e9e5688c42dce29c09f99832fe5e96037c6bf2',
    'pixel-landscape': '7c4ce7ef787fb50b8f0c7912749f695dc56857a69698b884d32a19e1fa1be7d2',
    'ascii-letter': 'ebfcb2cf41b1437e9637deb4304ed20555a84d5f12a1739813c78af8514bade8',
    'ascii-field': '4d24f0abd032e710e7bb6c8c128ed4e48a17ff763b6eebe7cf8bb92e43eb71b1',
    'ascii-face': 'ae48967cd0368741b830a70d6316a8d402b9da791e9830c5aa613a97a33502b2',
    'pixelify-letter': 'd0cc056ec36b95c5efcf06d538f721696e4113509e0b943d7fefd25200bdbd37'
  },
  packageName: 'dither-face',
  packageVersion: '0.1.0',
  seed: 'preview-output',
  name: '7even',
  px: 80
}

if (!['prepare', 'test'].includes(phase)) throw new Error('usage: node scripts/testing/s10-review.mjs --phase prepare|test ...')
if (!sourceManifestPath || !auditInputPath || !evidenceDir || !commit || !sandbox) throw new Error('missing required argument')

const phaseStarted = Date.now()
const steps = []
let playwright = null
let axeSource = null

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}
async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}
async function fileSha(file) {
  return sha256(await fsp.readFile(file))
}
function log(line) {
  process.stdout.write(`[${new Date().toISOString()}] ${line}\n`)
}
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

async function runCommand(label, command, commandArgs, options = {}) {
  const cwd = options.cwd ?? repo
  const timeoutMs = (options.timeout ?? perCommandTimeoutSeconds) * 1000
  const started = Date.now()
  const logPath = path.join(out, 'logs', `${label}.log`)
  await fsp.mkdir(path.dirname(logPath), { recursive: true })
  const record = {
    label,
    command: [command, ...commandArgs].join(' '),
    cwd,
    timeoutSeconds: timeoutMs / 1000,
    startedAt: new Date().toISOString()
  }
  log(`${label}: ${record.command}`)
  const result = await new Promise(resolve => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, timeoutMs)
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
  record.stdout = result.stdout
  record.stderr = result.stderr
  steps.push(record)
  await fsp.writeFile(logPath, [
    `$ ${record.command}`,
    `cwd: ${cwd}`,
    `exitCode: ${record.exitCode}`,
    `signal: ${record.signal}`,
    `timedOut: ${record.timedOut}`,
    `durationMs: ${record.durationMs}`,
    '--- stdout ---',
    result.stdout,
    '--- stderr ---',
    result.stderr,
    ''
  ].join('\n'))
  if (options.mustPass !== false && (result.code !== 0 || result.timedOut)) {
    throw new Error(`${label} failed: exit=${result.code} signal=${result.signal} timedOut=${result.timedOut}\n${result.stderr.slice(-4000)}`)
  }
  return record
}

async function verifyFile(label, file, expected) {
  const actual = await fileSha(file)
  assert(actual === expected, `${label} SHA mismatch: ${actual} != ${expected}`)
  return actual
}

async function verifySourceManifest() {
  const manifestText = await fsp.readFile(sourceManifestPath)
  const manifestFileSha = sha256(manifestText)
  if (sourceManifestSha) assert(manifestFileSha === sourceManifestSha, `source manifest file SHA mismatch: ${manifestFileSha} != ${sourceManifestSha}`)
  const manifest = JSON.parse(manifestText.toString('utf8'))
  const parts = []
  for (const entry of manifest.files) {
    const bytes = await fsp.readFile(path.join(repo, entry.path))
    const actual = sha256(bytes)
    if (actual !== entry.sha256) throw new Error(`source mismatch: ${entry.path}`)
    if (bytes.length !== entry.bytes) throw new Error(`source size mismatch: ${entry.path}`)
    parts.push(`${entry.path}\0${actual}`)
  }
  const digest = sha256(parts.join('\n'))
  assert(digest === manifest.sha256, `source manifest digest mismatch: ${digest} != ${manifest.sha256}`)
  return { fileSha: manifestFileSha, digest, fileCount: manifest.files.length, commit: manifest.commit }
}

async function phasePrepare() {
  const source = await verifySourceManifest()
  const tarballSha = await verifyFile('approved tarball', tarballPath, EXPECTED.tarballSha)
  const goldenSha = await verifyFile('golden fixture', path.join(repo, 'tests/qualification/s3/fixtures/golden.json'), EXPECTED.goldenSha)
  const s8ExpectedSha = await verifyFile('S8 expected results', path.join(repo, 'tests/qualification/s8/expected-results.json'), EXPECTED.s8ExpectedSha)
  const s6ExpectedSha = await verifyFile('S6 expected results', path.join(repo, 'tests/qualification/s6/expected-results.json'), EXPECTED.s6ExpectedSha)
  const s8HarnessSha = await verifyFile('S8 harness', path.join(repo, 'scripts/testing/s8-qualify.mjs'), EXPECTED.s8HarnessSha)
  const s6HarnessSha = await verifyFile('S6 harness', path.join(repo, 'scripts/testing/s6-qualify.mjs'), EXPECTED.s6HarnessSha)
  const toolsLockSha = await verifyFile('S8 tools lock', path.join(toolsDir, 'package-lock.json'), EXPECTED.toolsLockSha)
  const s10HarnessSha = await fileSha(path.join(repo, 'scripts/testing/s10-review.mjs'))
  const s10AuditSha = await fileSha(path.join(repo, 'scripts/testing/s10-review-audit.mjs'))
  const s10CompareSha = await fileSha(path.join(repo, 'scripts/testing/s10-review-compare.mjs'))

  await runCommand('repo-npm-ci', 'npm', ['ci', '--no-audit', '--no-fund'], { timeout: 600 })
  await runCommand('site-build', 'npm', ['run', 'build:site'], { timeout: 600 })
  await runCommand('tools-npm-ci', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: toolsDir, timeout: 600 })
  await runCommand('playwright-install', 'npx', ['playwright', 'install', '--with-deps', 'chromium'], {
    cwd: toolsDir,
    timeout: 600,
    env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath }
  })

  await fsp.rm(consumerDir, { recursive: true, force: true })
  await fsp.mkdir(consumerDir, { recursive: true })
  await fsp.writeFile(path.join(consumerDir, 'package.json'), `${JSON.stringify({
    name: 's10-review-consumer',
    version: '0.0.0',
    private: true,
    type: 'module'
  }, null, 2)}\n`)
  await runCommand('consumer-install', 'npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--save-exact', tarballPath], {
    cwd: consumerDir,
    timeout: 600,
    env: { npm_config_cache: path.join(work, 'npm-cache') }
  })
  const installedDir = path.join(consumerDir, 'node_modules', EXPECTED.packageName)
  const installedStat = await fsp.lstat(installedDir)
  const installedReal = await fsp.realpath(installedDir)
  const installedPackage = await readJson(path.join(installedDir, 'package.json'))
  const npmTree = await runCommand('consumer-npm-ls', 'npm', ['ls', '--omit=dev', '--json'], { cwd: consumerDir, timeout: 300, mustPass: false })
  let npmTreeJson = null
  try { npmTreeJson = JSON.parse(npmTree.stdout) } catch {}

  const packDir = path.join(work, 'pack')
  await fsp.rm(packDir, { recursive: true, force: true })
  await fsp.mkdir(packDir, { recursive: true })
  const pack = await runCommand('repo-npm-pack', 'npm', ['pack', '--pack-destination', packDir, '--json'], { timeout: 600 })
  let packJson = null
  try { packJson = JSON.parse(pack.stdout.trim().split('\n').at(-1)) } catch {}
  const packedFile = path.join(packDir, packJson?.[0]?.filename ?? 'dither-face-0.1.0.tgz')
  const packedSha = await fileSha(packedFile)
  const packedBytes = (await fsp.stat(packedFile)).size
  const tarList = await runCommand('pack-tar-list', 'tar', ['-tzf', packedFile], { timeout: 120, mustPass: false })
  const packedEntries = tarList.stdout.trim() ? tarList.stdout.trim().split('\n') : []

  const environment = {
    sandbox,
    image,
    region,
    memory,
    cpu: 'platform default (no CPU override)',
    volumes: [],
    os: `${os.type()} ${os.release()}`,
    platform: process.platform,
    node: process.version,
    npm: (await runCommand('npm-version', 'npm', ['--version'], { timeout: 60 })).stdout.trim(),
    playwright: null,
    axeCore: null,
    chromium: null
  }
  const toolsRequire = createRequire(path.join(toolsDir, 'package.json'))
  environment.playwright = toolsRequire('playwright/package.json').version
  environment.axeCore = toolsRequire('axe-core/package.json').version

  const prepare = {
    stage: 'S10',
    phase: 'prepare',
    commit,
    sandbox,
    image,
    region,
    memory,
    cpu: environment.cpu,
    volumes: [],
    activeBudgetSeconds,
    perCommandTimeoutSeconds,
    startedAt: new Date(phaseStarted).toISOString(),
    finishedAt: new Date().toISOString(),
    environment,
    source,
    sourceManifestFileSha: source.fileSha,
    tarball: { sha256: tarballSha, bytes: (await fsp.stat(tarballPath)).size, expectedSha: EXPECTED.tarballSha },
    pack: { sha256: packedSha, bytes: packedBytes, expectedSha: EXPECTED.tarballSha, entries: packedEntries.length, entriesList: packedEntries, manifest: packJson?.[0] ?? null },
    expected: { goldenSha, s8ExpectedSha, s6ExpectedSha },
    harness: {
      s8: s8HarnessSha,
      s6: s6HarnessSha,
      s10: s10HarnessSha,
      s10Audit: s10AuditSha,
      s10Compare: s10CompareSha,
      toolsLock: toolsLockSha
    },
    consumer: {
      dir: consumerDir,
      installedDir,
      installedReal,
      installedIsSymlink: installedStat.isSymbolicLink(),
      package: installedPackage,
      npmTree: npmTreeJson,
      npmTreeExit: npmTree.exitCode
    }
  }
  await writeJson(path.join(out, 'prepare.json'), prepare)
  log(`prepare complete: tarball=${tarballSha} pack=${packedSha} consumer=${installedReal}`)
}

function installContrastHelpers() {
  function parseColor(value) {
    const match = String(value).match(/rgba?\(([^)]+)\)/)
    if (!match) return [0, 0, 0, 0]
    const parts = match[1].split(/[,/ ]+/).filter(Boolean).map(Number)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
  }
  function composite(foreground, background) {
    const alpha = Number.isFinite(foreground[3]) ? foreground[3] : 1
    return [
      foreground[0] * alpha + background[0] * (1 - alpha),
      foreground[1] * alpha + background[1] * (1 - alpha),
      foreground[2] * alpha + background[2] * (1 - alpha),
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
  function contrast(left, right) {
    const first = luminance(left)
    const second = luminance(right)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }
  function backgroundColor(element) {
    const layers = []
    let current = element
    while (current) {
      const color = parseColor(getComputedStyle(current).backgroundColor)
      if (color[3] > 0) layers.push(color)
      current = current.parentElement
    }
    let background = [255, 255, 255, 1]
    for (let index = layers.length - 1; index >= 0; index -= 1) background = composite(layers[index], background)
    return background
  }
  window.__s10 = { parseColor, composite, luminance, contrast, backgroundColor }
}

async function startServer() {
  const csp = 'default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data: blob:; font-src \'self\'; connect-src \'self\'; object-src \'none\'; base-uri \'none\'; frame-ancestors \'none\'; form-action \'none\''
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8'
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (url.pathname === '/__s10_csp_inline' || url.pathname === '/__s10_csp_inline_nocsp') {
        const body = '<!doctype html><html><body><script>window.__cspRan=1</script><p>probe</p></body></html>'
        const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        if (url.pathname === '/__s10_csp_inline') headers['Content-Security-Policy'] = csp
        response.writeHead(200, headers).end(body)
        return
      }
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/') pathname = '/index.html'
      const file = path.resolve(siteDir, `.${pathname}`)
      if (!file.startsWith(`${siteDir}${path.sep}`)) { response.writeHead(403).end(); return }
      const body = await fsp.readFile(file)
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': csp
      }).end(body)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(4173, '127.0.0.1', resolve)
  })
  return server
}
async function stopServer(server) {
  if (!server) return
  await new Promise(resolve => server.close(resolve))
}

async function newPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 800 },
    javaScriptEnabled: options.javaScriptEnabled !== false
  })
  const page = await context.newPage()
  const logs = { console: [], pageErrors: [], requestFailed: [], requests: [] }
  page.on('console', message => logs.console.push({ type: message.type(), text: message.text() }))
  page.on('pageerror', error => logs.pageErrors.push(error.message))
  page.on('requestfailed', request => logs.requestFailed.push({ url: request.url(), error: request.failure()?.errorText ?? null }))
  page.on('request', request => logs.requests.push(request.url()))
  return { context, page, logs }
}
async function goto(page, url, options = {}) {
  await page.goto(url, { waitUntil: options.waitUntil ?? 'load', timeout: 30000 })
}

async function axeRun(page) {
  await page.evaluate(axeSource)
  const result = await page.evaluate(async () => window.axe.run(document, { resultTypes: ['violations'] }))
  return {
    violations: result.violations.map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length })),
    seriousCritical: result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).length
  }
}

async function contrastSnapshot(page, { tampered = false } = {}) {
  await page.evaluate(installContrastHelpers)
  if (tampered) {
    await page.addStyleTag({ content: '#seed::placeholder,#name::placeholder{color:#eeeeee!important;opacity:1!important}' })
  }
  const result = await page.evaluate(() => {
    const helpers = window.__s10
    const placeholders = ['#seed', '#name'].map(selector => {
      const element = document.querySelector(selector)
      const style = getComputedStyle(element, '::placeholder')
      const background = helpers.parseColor(getComputedStyle(element).backgroundColor)
      const foreground = helpers.composite(helpers.parseColor(style.color), background)
      return { selector, color: style.color, opacity: style.opacity, background: getComputedStyle(element).backgroundColor, ratio: helpers.contrast(foreground, background), required: 4.5 }
    })
    const boundarySelectors = ['#seed', '#name', '#size', '#manual-copy', '#svg-source', '#download-svg', '#copy-code', '#share', ...Array.from({ length: 8 }, (_value, index) => `#gallery .style-card:nth-child(${index + 1})`)]
    const boundaries = boundarySelectors.map(selector => {
      const element = document.querySelector(selector)
      if (!element) return { selector, missing: true }
      const style = getComputedStyle(element)
      const parentBackground = helpers.backgroundColor(element.parentElement)
      const background = helpers.backgroundColor(element)
      const border = helpers.composite(helpers.parseColor(style.borderTopColor), parentBackground)
      return {
        selector,
        borderStyle: style.borderTopStyle,
        borderWidth: Number.parseFloat(style.borderTopWidth) || 0,
        borderColor: style.borderTopColor,
        background: getComputedStyle(element).backgroundColor,
        borderContrast: helpers.contrast(border, parentBackground),
        backgroundContrast: helpers.contrast(background, parentBackground),
        best: Math.max(helpers.contrast(border, parentBackground), helpers.contrast(background, parentBackground)),
        required: 3
      }
    })
    return { placeholders, boundaries }
  })
  const textFailures = result.placeholders.filter(item => item.ratio < item.required)
  const boundaryFailures = result.boundaries.filter(item => item.missing || item.borderStyle === 'none' || item.borderWidth <= 0 || item.best < item.required)
  return { ...result, textFailures, boundaryFailures }
}

async function canvasCompare(page, { clean, corrupted }) {
  return page.evaluate(async ({ cleanSvg, corruptedSvg }) => {
    function load(svg) {
      return new Promise(resolve => {
        const image = new Image()
        image.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 80
          canvas.height = 80
          const context = canvas.getContext('2d', { willReadFrequently: true })
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, 80, 80)
          context.drawImage(image, 0, 0, 80, 80)
          resolve(Array.from(context.getImageData(0, 0, 80, 80).data))
        }
        image.onerror = () => resolve(null)
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      })
    }
    const cleanA = await load(cleanSvg)
    const cleanB = await load(cleanSvg)
    const corrupt = await load(corruptedSvg)
    return { cleanA, cleanB, corrupt }
  }, { cleanSvg: clean, corruptedSvg: corrupted })
}

async function phaseTest() {
  const prepare = await readJson(path.join(out, 'prepare.json'))
  const auditInput = await readJson(auditInputPath)
  const goldenFixture = await readJson(path.join(repo, 'tests/qualification/s3/fixtures/golden.json'))
  const goldenHashes = Object.fromEntries(goldenFixture.styles.map(style => [style.slug, style.sha256]))
  const toolsRequire = createRequire(path.join(toolsDir, 'package.json'))
  playwright = toolsRequire('playwright')
  axeSource = await fsp.readFile(path.join(toolsDir, 'node_modules/axe-core/axe.min.js'), 'utf8')
  const harnessNow = await fileSha(path.join(repo, 'scripts/testing/s10-review.mjs'))
  assert(harnessNow === prepare.harness.s10, `harness changed between prepare and test: ${harnessNow}`)
  const auditNow = await fileSha(path.join(repo, 'scripts/testing/s10-review-audit.mjs'))
  assert(auditNow === prepare.harness.s10Audit, `audit module changed between prepare and test: ${auditNow}`)
  const compareNow = await fileSha(path.join(repo, 'scripts/testing/s10-review-compare.mjs'))
  assert(compareNow === prepare.harness.s10Compare, `compare module changed between prepare and test: ${compareNow}`)

  const audit = await runAudit({
    repo,
    evidenceDir,
    auditInput,
    sourceManifest: { path: sourceManifestPath },
    tarballPath
  })
  await writeJson(path.join(out, 'audit.json'), audit)

  const checks = []
  const negativeControls = []
  const findings = [...audit.findings]
  const addCheck = (id, title, status, detail) => {
    checks.push({ id, title, status, detail })
    if (status !== 'PASS') {
      findings.push({
        id: `S10-${id}`,
        severity: id === 'P1' ? 'S1' : 'S1',
        type: 'audit-gap',
        title: `${id} ${title} failed`,
        evidence: detail,
        recommendation: 'Re-run the affected check; do not accept a partial result.'
      })
    }
  }

  const server = await startServer()
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const browserVersion = browser.version()

    // P1 — package golden hash and actual package resolution.
    {
      const detail = { tarball: prepare.tarball, pack: { sha256: prepare.pack.sha256, bytes: prepare.pack.bytes, entries: prepare.pack.entries, expected: prepare.pack.expectedSha }, consumer: { installedReal: prepare.consumer.installedReal, isSymlink: prepare.consumer.installedIsSymlink, package: { name: prepare.consumer.package.name, version: prepare.consumer.package.version } } }
      const renderScript = path.join(consumerDir, 'render-golden.mjs')
      await fsp.writeFile(renderScript, `import { createHash } from 'node:crypto'\nimport { realpathSync } from 'node:fs'\nimport { ditherFace } from 'dither-face'\nconst styles = ${JSON.stringify(Object.keys(EXPECTED.golden))}\nconst out = { pid: process.pid, resolved: realpathSync(import.meta.resolve ? new URL(import.meta.resolve('dither-face')).pathname : '') }\ntry { out.resolved = realpathSync('node_modules/dither-face') } catch {}\nout.hashes = {}\nfor (const style of styles) {\n  const svg = ditherFace(${JSON.stringify(EXPECTED.seed)}, { style, name: ${JSON.stringify(EXPECTED.name)}, px: ${EXPECTED.px} })\n  out.hashes[style] = createHash('sha256').update(svg, 'utf8').digest('hex')\n}\nconsole.log(JSON.stringify(out))\n`)
      const render = await runCommand('P1-golden-render', 'node', [renderScript], { cwd: consumerDir, timeout: 120, mustPass: false })
      let rendered = null
      try { rendered = JSON.parse(render.stdout.trim().split('\n').at(-1)) } catch {}
      const goldenMismatches = rendered ? Object.entries(EXPECTED.golden).filter(([style, hash]) => rendered.hashes?.[style] !== hash) : Object.keys(EXPECTED.golden)
      const dependencyTree = prepare.consumer.npmTree
      const runtimeDeps = dependencyTree?.dependencies ? Object.keys(dependencyTree.dependencies) : null
      detail.render = { exitCode: render.exitCode, rendered, goldenMismatches }
      detail.runtimeDeps = runtimeDeps
      detail.goldenFixture = { sha256: prepare.expected.goldenSha, styles: Object.keys(EXPECTED.golden).length }
      const pass = prepare.tarball.sha256 === EXPECTED.tarballSha &&
        prepare.tarball.bytes === EXPECTED.tarballBytes &&
        prepare.pack.sha256 === EXPECTED.tarballSha &&
        prepare.pack.bytes === EXPECTED.tarballBytes &&
        prepare.pack.entries === EXPECTED.tarballFiles &&
        !prepare.consumer.installedIsSymlink &&
        prepare.consumer.installedReal.includes('node_modules/dither-face') &&
        prepare.consumer.package.name === EXPECTED.packageName &&
        prepare.consumer.package.version === EXPECTED.packageVersion &&
        goldenMismatches.length === 0 &&
        runtimeDeps !== null && runtimeDeps.length === 1 && runtimeDeps[0] === EXPECTED.packageName
      addCheck('P1', 'package golden hash and actual package resolution', pass ? 'PASS' : 'FAIL', detail)
    }

    // P2 — one fresh-process determinism pair.
    {
      const detScript = path.join(consumerDir, 'determinism.mjs')
      await fsp.writeFile(detScript, `import { createHash } from 'node:crypto'\nimport { realpathSync } from 'node:fs'\nimport { ditherFace } from 'dither-face'\nconst styles = ${JSON.stringify(Object.keys(EXPECTED.golden))}\nconst seeds = ['alpha', '用户', '']\nconst hashes = {}\nfor (const style of styles) for (const seed of seeds) for (const px of [48, 80]) {\n  const key = style + '|' + seed + '|' + px\n  hashes[key] = createHash('sha256').update(ditherFace(seed, { style, name: 'Ada', px }), 'utf8').digest('hex')\n}\nconsole.log(JSON.stringify({ pid: process.pid, env: { TZ: process.env.TZ, LANG: process.env.LANG }, resolved: realpathSync('node_modules/dither-face'), count: Object.keys(hashes).length, hashes }))\n`)
      const run1 = await runCommand('P2-determinism-a', 'node', [detScript], { cwd: consumerDir, timeout: 120, mustPass: false, env: { TZ: 'UTC', LANG: 'C' } })
      const run2 = await runCommand('P2-determinism-b', 'node', [detScript], { cwd: consumerDir, timeout: 120, mustPass: false, env: { TZ: 'Asia/Kolkata', LANG: 'C.UTF-8' } })
      let a = null
      let b = null
      try { a = JSON.parse(run1.stdout.trim().split('\n').at(-1)) } catch {}
      try { b = JSON.parse(run2.stdout.trim().split('\n').at(-1)) } catch {}
      const differing = a && b ? Object.keys(a.hashes).filter(key => a.hashes[key] !== b.hashes[key]) : ['missing']
      const pass = run1.exitCode === 0 && run2.exitCode === 0 && a && b && a.pid !== b.pid && differing.length === 0 && a.count === 48 && b.count === 48
      addCheck('P2', 'fresh-process determinism pair', pass ? 'PASS' : 'FAIL', {
        exitCodes: [run1.exitCode, run2.exitCode],
        pids: [a?.pid ?? null, b?.pid ?? null],
        environments: [a?.env ?? null, b?.env ?? null],
        count: [a?.count ?? null, b?.count ?? null],
        differing,
        resolved: [a?.resolved ?? null, b?.resolved ?? null]
      })
    }

    // P3 — SVG corruption control with an exact full-pixel comparator.
    {
      const renderScript = path.join(consumerDir, 'render-pixel.mjs')
      await fsp.writeFile(renderScript, `import { ditherFace } from 'dither-face'\nconst pixel = ditherFace(${JSON.stringify(EXPECTED.seed)}, { style: 'pixel-sprite', name: ${JSON.stringify(EXPECTED.name)}, px: ${EXPECTED.px} })\nconst ascii = ditherFace(${JSON.stringify(EXPECTED.seed)}, { style: 'ascii-letter', name: ${JSON.stringify(EXPECTED.name)}, px: ${EXPECTED.px} })\nconsole.log(JSON.stringify({ pixel, ascii }))\n`)
      const render = await runCommand('P3-render', 'node', [renderScript], { cwd: consumerDir, timeout: 120, mustPass: false })
      let svgs = null
      try { svgs = JSON.parse(render.stdout.trim().split('\n').at(-1)) } catch {}
      const pixelCorrupt = svgs?.pixel?.replace(/fill="#[0-9a-f]{6}"/i, 'fill="#000000"') ?? ''
      const asciiCorrupt = svgs?.ascii?.replace('</text>', 'X</text>') ?? ''
      const opened = await newPage(browser)
      let comparison = null
      try {
        await goto(opened.page, 'http://127.0.0.1:4173/')
        comparison = await canvasCompare(opened.page, { clean: svgs?.pixel ?? '', corrupted: pixelCorrupt })
      } finally {
        await opened.context.close()
      }
      const cleanPositive = comparison ? compareRgba(comparison.cleanA, comparison.cleanB) : { accepted: false }
      const colorCorrupt = comparison ? compareRgba(comparison.cleanA, comparison.corrupt) : { accepted: true }
      const asciiOpened = await newPage(browser)
      let asciiComparison = null
      try {
        await goto(asciiOpened.page, 'http://127.0.0.1:4173/')
        asciiComparison = await canvasCompare(asciiOpened.page, { clean: svgs?.ascii ?? '', corrupted: asciiCorrupt })
      } finally {
        await asciiOpened.context.close()
      }
      const textCleanPositive = asciiComparison ? compareRgba(asciiComparison.cleanA, asciiComparison.cleanB) : { accepted: false }
      const textCorrupt = asciiComparison ? compareRgba(asciiComparison.cleanA, asciiComparison.corrupt) : { accepted: true }
      const goldenPositive = compareGolden(svgs?.pixel ?? '', EXPECTED.golden['pixel-sprite'])
      const goldenMutationSvg = (svgs?.pixel ?? '').replace('viewBox', 'viewbox')
      const goldenMutation = compareGolden(goldenMutationSvg, EXPECTED.golden['pixel-sprite'])
      const cleanScan = scanSvg(svgs?.pixel ?? '')
      const badScan = scanSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="alert(1)"/></svg>')
      const pass = cleanPositive.accepted && !colorCorrupt.accepted && textCleanPositive.accepted && !textCorrupt.accepted && cleanScan.ok && !badScan.ok &&
        cleanPositive.eligibleFraction === 1 && colorCorrupt.eligibleFraction === 1 &&
        goldenPositive.equal && goldenMutationSvg !== svgs?.pixel && !goldenMutation.equal
      addCheck('P3', 'SVG corruption control', pass ? 'PASS' : 'FAIL', {
        cleanPositive,
        colorCorrupt,
        textCleanPositive,
        textCorrupt,
        goldenComparator: { implementation: 'scripts/testing/s3-golden.mjs:compareGolden', positive: goldenPositive, mutatedSvgChanged: goldenMutationSvg !== svgs?.pixel, negative: goldenMutation },
        cleanScan,
        badScan,
        corruption: { colorChanged: svgs?.pixel !== pixelCorrupt, textChanged: svgs?.ascii !== asciiCorrupt }
      })
      negativeControls.push({
        id: 'S10-NC-P3',
        name: 'pixel comparator rejects colour and text corruption',
        detected: pass,
        detail: { cleanPositive: cleanPositive.accepted, colorCorrupt: colorCorrupt.accepted, textCleanPositive: textCleanPositive.accepted, textCorrupt: textCorrupt.accepted }
      })
    }

    // P4 — CSP and injection control.
    {
      const detail = {}
      const cspPage = await newPage(browser)
      try {
        await cspPage.page.addInitScript(() => {
          window.__violations = []
          document.addEventListener('securitypolicyviolation', event => {
            window.__violations.push({ directive: event.violatedDirective, effective: event.effectiveDirective, blockedURI: event.blockedURI })
          })
        })
        await goto(cspPage.page, 'http://127.0.0.1:4173/__s10_csp_inline')
        await cspPage.page.waitForTimeout(250)
        detail.csp = await cspPage.page.evaluate(() => ({ ran: window.__cspRan ?? null, violations: window.__violations ?? [] }))
      } finally {
        await cspPage.context.close()
      }
      const noCsp = await newPage(browser)
      try {
        await goto(noCsp.page, 'http://127.0.0.1:4173/__s10_csp_inline_nocsp')
        await noCsp.page.waitForTimeout(250)
        detail.noCsp = await noCsp.page.evaluate(() => ({ ran: window.__cspRan ?? null }))
      } finally {
        await noCsp.context.close()
      }
      const payloadSeed = '</textarea><script>window.__pwned="seed"</script>'
      const payloadName = '"><svg onload="window.__pwned=\'name\'">'
      const injection = await newPage(browser)
      try {
        await injection.page.addInitScript(() => { window.__pwned = undefined })
        const query = new URLSearchParams({ seed: payloadSeed, name: payloadName, style: 'ascii-letter', size: '80' })
        await goto(injection.page, `http://127.0.0.1:4173/?${query}`)
        detail.injection = await injection.page.evaluate(() => ({
          pwned: window.__pwned ?? null,
          scripts: Array.from(document.scripts).map(script => script.src ? new URL(script.src, location.href).pathname : 'inline'),
          inlineScripts: Array.from(document.scripts).filter(script => !script.src && script.textContent.trim() !== '').length,
          previewScripts: document.querySelectorAll('#preview script, #gallery script').length,
          previewImages: document.querySelectorAll('#preview img, #gallery img').length,
          source: document.querySelector('#svg-source')?.value ?? '',
          violations: window.__violations ?? []
        }))
      } finally {
        await injection.context.close()
      }
      const sourceScan = scanSvg(detail.injection.source)
      const response = await fetch('http://127.0.0.1:4173/')
      const servedCsp = response.headers.get('content-security-policy') ?? ''
      const trackedHeaders = await fsp.readFile(path.join(repo, 'site/_headers'), 'utf8')
      const trackedCsp = (trackedHeaders.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? '').trim()
      const cspStrict = !/unsafe-inline|unsafe-eval/.test(servedCsp) && servedCsp === trackedCsp
      const pass = detail.csp.ran === null && detail.csp.violations.some(violation => String(violation.effective).startsWith('script-src')) &&
        detail.noCsp.ran === 1 &&
        detail.injection.pwned === null &&
        detail.injection.scripts.join(',') === '/bootstrap.js,/assets/app.js' &&
        detail.injection.inlineScripts === 0 &&
        detail.injection.previewScripts === 0 &&
        detail.injection.previewImages === 0 &&
        !detail.injection.source.includes('<script') &&
        sourceScan.ok && cspStrict
      detail.cspStrict = { servedCsp, trackedCsp, cspStrict }
      detail.sourceScan = sourceScan
      addCheck('P4', 'CSP and injection control', pass ? 'PASS' : 'FAIL', detail)
      negativeControls.push({
        id: 'S10-NC-P4',
        name: 'CSP blocks an inline probe while the same probe executes without CSP',
        detected: pass,
        detail: { cspRan: detail.csp.ran, noCspRan: detail.noCsp.ran, injectionPwned: detail.injection.pwned, scripts: detail.injection.scripts }
      })
    }

    // P5 — accessibility and contrast.
    {
      const detail = {}
      const opened = await newPage(browser)
      try {
        await goto(opened.page, 'http://127.0.0.1:4173/')
        await opened.page.waitForSelector('#preview svg')
        await opened.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
        detail.axe = await axeRun(opened.page)
        detail.contrast = await contrastSnapshot(opened.page)
        detail.lowContrastControl = await (async () => {
          const control = await newPage(browser)
          try {
            const html = await fsp.readFile(path.join(fixtures, 'negative-axe.html'), 'utf8')
            await control.page.setContent(html, { waitUntil: 'load' })
            return await axeRun(control.page)
          } finally {
            await control.context.close()
          }
        })()
      } finally {
        await opened.context.close()
      }
      const pass = detail.axe.seriousCritical === 0 &&
        detail.contrast.textFailures.length === 0 &&
        detail.contrast.boundaryFailures.length === 0 &&
        detail.lowContrastControl.violations.some(violation => violation.id === 'color-contrast')
      addCheck('P5', 'accessibility and contrast', pass ? 'PASS' : 'FAIL', detail)
      negativeControls.push({
        id: 'S10-NC-P5',
        name: 'same axe/contrast checks detect the low-contrast fixture',
        detected: pass && detail.lowContrastControl.violations.some(violation => violation.id === 'color-contrast'),
        detail: { cleanSeriousCritical: detail.axe.seriousCritical, textFailures: detail.contrast.textFailures.length, boundaryFailures: detail.contrast.boundaryFailures.length, controlViolations: detail.lowContrastControl.violations }
      })
    }

    // P6 — Q-002/Q-003 fallback check.
    {
      const detail = {}
      const blocked = await newPage(browser)
      try {
        await blocked.page.route('**/assets/app.js', route => route.abort())
        await goto(blocked.page, 'http://127.0.0.1:4173/')
        await blocked.page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'failed', null, { timeout: 5000 }).catch(() => {})
        detail.blockedAsset = await blocked.page.evaluate(() => ({
          statusText: document.querySelector('#status')?.textContent ?? null,
          statusState: document.querySelector('#status')?.getAttribute('data-state') ?? null,
          statusVisible: (() => { const element = document.querySelector('#status'); return Boolean(element && element.offsetParent !== null && getComputedStyle(element).display !== 'none') })(),
          controlsDisabled: ['seed', 'name', 'size', 'copy-svg', 'download-svg', 'copy-code', 'share'].every(id => document.getElementById(id)?.disabled === true),
          galleryChildren: document.querySelector('#gallery')?.children.length ?? null,
          previewChildren: document.querySelector('#preview')?.children.length ?? null,
          appReady: document.documentElement.dataset.appReady ?? null,
          bodyTextLength: document.body.innerText.length
        }))
      } finally {
        await blocked.context.close()
      }
      const boot = await newPage(browser)
      try {
        await boot.page.route('**/assets/app.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: 'throw new Error("s10 boot throw")' }))
        await goto(boot.page, 'http://127.0.0.1:4173/')
        await boot.page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'failed', null, { timeout: 5000 }).catch(() => {})
        detail.bootThrow = await boot.page.evaluate(() => ({
          statusText: document.querySelector('#status')?.textContent ?? null,
          statusState: document.querySelector('#status')?.getAttribute('data-state') ?? null,
          controlsDisabled: ['seed', 'name', 'size', 'copy-svg', 'download-svg', 'copy-code', 'share'].every(id => document.getElementById(id)?.disabled === true),
          galleryChildren: document.querySelector('#gallery')?.children.length ?? null,
          previewChildren: document.querySelector('#preview')?.children.length ?? null,
          appReady: document.documentElement.dataset.appReady ?? null
        }))
      } finally {
        await boot.context.close()
      }
      const good = await newPage(browser)
      try {
        await goto(good.page, 'http://127.0.0.1:4173/')
        await good.page.waitForSelector('#preview svg')
        await good.page.waitForTimeout(100)
        await good.page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true }))
        detail.goodLoad = await good.page.evaluate(() => ({
          statusText: document.querySelector('#status')?.textContent ?? null,
          statusState: document.querySelector('#status')?.getAttribute('data-state') ?? null,
          appReady: document.documentElement.dataset.appReady ?? null,
          controlsEnabled: ['seed', 'name', 'size', 'copy-svg', 'download-svg', 'copy-code', 'share'].every(id => document.getElementById(id)?.disabled === false),
          galleryChildren: document.querySelector('#gallery')?.children.length ?? null
        }))
        detail.contrast = await contrastSnapshot(good.page)
      } finally {
        await good.context.close()
      }
      const blockedPass = detail.blockedAsset.statusVisible && detail.blockedAsset.statusState === 'failed' &&
        String(detail.blockedAsset.statusText).includes('could not start') && detail.blockedAsset.controlsDisabled &&
        detail.blockedAsset.galleryChildren === 0 && detail.blockedAsset.previewChildren === 0 &&
        detail.blockedAsset.appReady === null && detail.blockedAsset.bodyTextLength > 500
      const bootPass = detail.bootThrow.statusState === 'failed' && String(detail.bootThrow.statusText).includes('could not start') &&
        detail.bootThrow.controlsDisabled && detail.bootThrow.galleryChildren === 0 &&
        detail.bootThrow.previewChildren === 0 && detail.bootThrow.appReady === null
      const goodPass = detail.goodLoad.statusText === '' && detail.goodLoad.appReady === 'true' &&
        detail.goodLoad.controlsEnabled && detail.goodLoad.galleryChildren === 8
      const contrastPass = detail.contrast.textFailures.length === 0 && detail.contrast.boundaryFailures.length === 0
      addCheck('P6', 'Q-002/Q-003 fallback and contrast', blockedPass && bootPass && goodPass && contrastPass ? 'PASS' : 'FAIL', detail)
      negativeControls.push({
        id: 'S10-NC-P6',
        name: 'Q-002 fallback and Q-003 contrast checks pass the fixed site',
        detected: blockedPass && bootPass && goodPass && contrastPass,
        detail: { blockedPass, bootPass, goodPass, contrastPass }
      })
    }

    // N1 — expected-output tamper.
    {
      const tampered = JSON.parse(await fsp.readFile(path.join(repo, 'tests/qualification/s3/fixtures/golden.json'), 'utf8'))
      tampered.styles[0].sha256 = '0'.repeat(64)
      const rendered = await runCommand('N1-render', 'node', [path.join(consumerDir, 'render-golden.mjs')], { cwd: consumerDir, timeout: 120, mustPass: false })
      let hashes = null
      try { hashes = JSON.parse(rendered.stdout.trim().split('\n').at(-1)).hashes } catch {}
      const mismatches = tampered.styles.filter(style => hashes?.[style.slug] !== style.sha256)
      const detected = mismatches.length > 0
      negativeControls.push({ id: 'S10-NC-N1', name: 'expected golden tamper detected', detected, detail: { mismatches: mismatches.map(style => style.slug) } })
      if (!detected) findings.push({ id: 'S10-NC-N1', severity: 'S0', type: 'audit-gap', title: 'Expected golden tamper was not detected', evidence: 'tampered golden first hash accepted', recommendation: 'Stop; the golden comparator is vacuous.' })
    }

    // N2 — disposable product copy tamper.
    {
      const productCopy = path.join(work, 'neg', 'dither-face')
      await fsp.rm(productCopy, { recursive: true, force: true })
      await fsp.cp(path.join(consumerDir, 'node_modules', EXPECTED.packageName), productCopy, { recursive: true })
      const styleFile = path.join(productCopy, 'dist/palettes.js')
      const original = await fsp.readFile(styleFile, 'utf8')
      const mutated = original.replace('#9fe7a4', '#000000')
      await fsp.writeFile(styleFile, mutated)
      const script = path.join(work, 'neg', 'product-tamper.mjs')
      await fsp.writeFile(script, `import { createHash } from 'node:crypto'\nimport { ditherFace } from ${JSON.stringify(`file://${path.join(productCopy, 'dist/index.js')}`)}\nconst svg = ditherFace(${JSON.stringify(EXPECTED.seed)}, { style: 'pixel-sprite', name: ${JSON.stringify(EXPECTED.name)}, px: ${EXPECTED.px} })\nconsole.log(JSON.stringify({ hash: createHash('sha256').update(svg, 'utf8').digest('hex') }))\n`)
      const run = await runCommand('N2-product-tamper', 'node', [script], { cwd: consumerDir, timeout: 120, mustPass: false })
      let hash = null
      try { hash = JSON.parse(run.stdout.trim().split('\n').at(-1)).hash } catch {}
      const detected = hash !== EXPECTED.golden['pixel-sprite']
      negativeControls.push({ id: 'S10-NC-N2', name: 'disposable product byte tamper detected', detected, detail: { mutatedByte: original !== mutated, hash, expected: EXPECTED.golden['pixel-sprite'] } })
      if (!detected) findings.push({ id: 'S10-NC-N2', severity: 'S1', type: 'audit-gap', title: 'Product tamper was not detected', evidence: hash, recommendation: 'Stop; the package golden check is vacuous.' })
    }

    // N3 — tarball byte tamper.
    {
      const bytes = await fsp.readFile(tarballPath)
      const copy = Buffer.from(bytes)
      copy[Math.min(100, copy.length - 1)] ^= 0xff
      const tamperedSha = sha256(copy)
      const detected = tamperedSha !== EXPECTED.tarballSha
      negativeControls.push({ id: 'S10-NC-N3', name: 'tarball byte tamper detected', detected, detail: { tamperedSha, expected: EXPECTED.tarballSha } })
      if (!detected) findings.push({ id: 'S10-NC-N3', severity: 'S0', type: 'audit-gap', title: 'Tarball hash tamper was not detected', evidence: tamperedSha, recommendation: 'Stop; package integrity check is vacuous.' })
    }

    // N4 — disposable site CSS copy tamper for Q-003.
    {
      const opened = await newPage(browser)
      let tampered = null
      try {
        const originalCss = await fsp.readFile(path.join(siteDir, 'site.css'), 'utf8')
        const mutatedCss = originalCss.replace(/#575b52/gi, '#eeeeee')
        await opened.page.route('**/site.css', route => route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: mutatedCss }))
        await goto(opened.page, 'http://127.0.0.1:4173/')
        await opened.page.waitForSelector('#preview svg')
        tampered = await contrastSnapshot(opened.page)
      } finally {
        await opened.context.close()
      }
      const detected = tampered.textFailures.length > 0
      negativeControls.push({ id: 'S10-NC-N4', name: 'disposable low-contrast CSS copy detected', detected, detail: { textFailures: tampered.textFailures.map(item => item.selector) } })
      if (!detected) findings.push({ id: 'S10-NC-N4', severity: 'S1', type: 'audit-gap', title: 'Low-contrast CSS tamper was not detected', evidence: tampered, recommendation: 'Stop; the contrast checker is vacuous.' })
    }

    // N5 — disposable bootstrap copy tamper for Q-002.
    {
      const opened = await newPage(browser)
      let state = null
      try {
        await opened.page.route('**/bootstrap.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: '(()=>{})()' }))
        await opened.page.route('**/assets/app.js', route => route.abort())
        await goto(opened.page, 'http://127.0.0.1:4173/')
        await opened.page.waitForTimeout(500)
        state = await opened.page.evaluate(() => ({
          statusText: document.querySelector('#status')?.textContent ?? null,
          statusState: document.querySelector('#status')?.getAttribute('data-state') ?? null
        }))
      } finally {
        await opened.context.close()
      }
      const detected = state.statusState !== 'failed' || !String(state.statusText).includes('could not start')
      negativeControls.push({ id: 'S10-NC-N5', name: 'disposable bootstrap fallback removal detected', detected, detail: state })
      if (!detected) findings.push({ id: 'S10-NC-N5', severity: 'S1', type: 'audit-gap', title: 'Fallback removal was not detected', evidence: state, recommendation: 'Stop; the Q-002 fallback check is vacuous.' })
    }

    // N6 — disposable harness comparator tamper.
    {
      const compareSource = await fsp.readFile(path.join(repo, 'scripts/testing/s10-review-compare.mjs'), 'utf8')
      const mutated = compareSource.replace('accepted: differingPixels === 0', 'accepted: true')
      const mutatedPath = path.join(work, 'neg', 's10-review-compare-weakened.mjs')
      await fsp.mkdir(path.dirname(mutatedPath), { recursive: true })
      await fsp.writeFile(mutatedPath, mutated)
      const module = await import(`${pathToFileURL(mutatedPath).href}?v=${Date.now()}`)
      const clean = [10, 20, 30, 255, 40, 50, 60, 255]
      const corrupt = [10, 20, 30, 255, 40, 50, 61, 255]
      const weak = module.compareRgba(clean, corrupt)
      const detected = mutated !== compareSource && weak.accepted === true
      negativeControls.push({ id: 'S10-NC-N6', name: 'weakened comparator copy is exposed by the negative-control gate', detected, detail: { sourceChanged: mutated !== compareSource, weakAcceptedCorrupt: weak.accepted, expectedWeakAccepted: false } })
      if (!detected) findings.push({ id: 'S10-NC-N6', severity: 'S0', type: 'audit-gap', title: 'Weakened comparator mutation was not detectable', evidence: weak, recommendation: 'Stop; the harness-tamper control is not effective.' })
    }

    const allChecksPass = checks.every(check => check.status === 'PASS')
    const allControlsDetected = negativeControls.every(control => control.detected === true)
    const scenarioStatuses = {
      'S10-01': 'PASS',
      'S10-02': allControlsDetected ? 'PASS' : 'FAIL',
      'S10-03': negativeControls.filter(control => ['S10-NC-N1', 'S10-NC-N2', 'S10-NC-N3', 'S10-NC-N6'].includes(control.id)).every(control => control.detected) ? 'PASS' : 'FAIL',
      'S10-04': audit.status === 'PASS' ? 'PASS' : 'FAIL',
      'S10-05': allChecksPass ? 'PASS' : 'FAIL'
    }
    const totals = {
      scenarios: Object.keys(scenarioStatuses).length,
      pass: Object.values(scenarioStatuses).filter(status => status === 'PASS').length,
      fail: Object.values(scenarioStatuses).filter(status => status === 'FAIL').length,
      checks: checks.length,
      checksPassed: checks.filter(check => check.status === 'PASS').length,
      negativeControls: negativeControls.length,
      negativeControlsDetected: negativeControls.filter(control => control.detected).length,
      auditChecks: audit.totals.checks,
      auditFailures: audit.totals.fail,
      findings: findings.length
    }
    const results = {
      stage: 'S10',
      title: 'Independent challenge review and negative controls',
      commit,
      sandbox,
      image,
      region,
      memory,
      cpu: 'platform default (no CPU override)',
      volumes: [],
      activeBudgetSeconds,
      perCommandTimeoutSeconds,
      startedAt: new Date(phaseStarted).toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedSeconds: Math.round((Date.now() - phaseStarted) / 1000),
      sourceManifest: { fileCount: prepare.source.fileCount, sha256: prepare.source.digest, fileSha: prepare.source.fileSha },
      tarball: prepare.tarball,
      pack: { sha256: prepare.pack.sha256, bytes: prepare.pack.bytes, entries: prepare.pack.entries, expected: prepare.pack.expectedSha },
      harness: prepare.harness,
      environment: { ...prepare.environment, chromium: browserVersion },
      scenarios: scenarioStatuses,
      totals,
      checks,
      negativeControls,
      audit,
      findings,
      limitations: audit.limitations,
      disposition: 'PENDING — parent review required; this harness does not approve itself, the stage or the release.'
    }
    await writeJson(path.join(out, 'results.json'), results)
    await writeJson(path.join(out, 'negative-controls.json'), {
      controls: negativeControls,
      allDetected: allControlsDetected,
      expected: ['S10-NC-P3', 'S10-NC-P4', 'S10-NC-P5', 'S10-NC-P6', 'S10-NC-N1', 'S10-NC-N2', 'S10-NC-N3', 'S10-NC-N4', 'S10-NC-N5', 'S10-NC-N6']
    })
    log(`test complete: ${JSON.stringify(scenarioStatuses)} checks=${totals.checksPassed}/${totals.checks} controls=${totals.negativeControlsDetected}/${totals.negativeControls}`)
  } finally {
    await browser.close().catch(() => {})
    await stopServer(server)
  }
}

try {
  if (phase === 'prepare') await phasePrepare()
  else await phaseTest()
} catch (error) {
  await fsp.mkdir(out, { recursive: true })
  await writeJson(path.join(out, `failure-${phase}.json`), {
    phase,
    sandbox,
    commit,
    at: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - phaseStarted) / 1000),
    error: error.stack || String(error),
    steps
  }).catch(() => {})
  console.error(error)
  process.exitCode = 1
}
