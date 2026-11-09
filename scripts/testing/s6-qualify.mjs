#!/usr/bin/env node
/**
 * Stage 6 qualification harness.
 *
 * Runs in the dedicated sandbox in two bounded phases:
 *   prepare: npm ci, library/site builds, pinned Playwright browsers,
 *            independent tarball consumer install, source/lock/bundle hashes.
 *   test:    localhost-only site server, real Chromium/Firefox/WebKit/mobile
 *            pages, all nine S6 scenarios, three negative controls, raw
 *            results/traces/screenshots under the harness output directory.
 *
 * The harness never weakens a scenario to make a run pass: a failed check is
 * recorded and makes the phase exit non-zero. It never modifies product source.
 */
import { createRequire } from 'node:module'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  ensureDir,
  hashTree,
  readJson,
  runCommand,
  sha256,
  sha256File,
  startServer,
  stopServer,
  waitForHttp,
  writeJson,
} from './s6-lib.mjs'
import { captureScreenshot } from './s6-page.mjs'
import { runScenariosA } from './s6-cases-a.mjs'
import { runNegativeControls, runScenariosB } from './s6-cases-b.mjs'
import { createSerializedBrowserRegistry } from './browser-lifecycle.mjs'

const { values: args } = parseArgs({
  options: {
    phase: { type: 'string' },
    repo: { type: 'string' },
    out: { type: 'string' },
    work: { type: 'string' },
    expected: { type: 'string' },
    golden: { type: 'string' },
    tarball: { type: 'string' },
    'source-manifest': { type: 'string' },
    'expected-sha': { type: 'string' },
    'golden-sha': { type: 'string' },
    commit: { type: 'string' },
    sandbox: { type: 'string' },
    image: { type: 'string' },
    region: { type: 'string' },
    memory: { type: 'string' },
  },
  strict: true,
})

for (const required of ['phase', 'repo', 'out', 'work', 'expected', 'golden', 'tarball', 'source-manifest', 'commit', 'sandbox']) {
  if (!args[required]) throw new Error(`missing --${required}`)
}
if (!['prepare', 'test'].includes(args.phase)) throw new Error('--phase must be prepare or test')

const repo = path.resolve(args.repo)
const outDir = path.resolve(args.out)
const workDir = path.resolve(args.work)
const expectedPath = path.resolve(args.expected)
const goldenPath = path.resolve(args.golden)
const tarballPath = path.resolve(args.tarball)
const sourceManifestPath = path.resolve(args['source-manifest'])
const logsDir = path.join(outDir, 'logs')
const reportsDir = path.join(outDir, 'reports')
const screenshotsDir = path.join(outDir, 'screenshots')
const downloadsDir = path.join(outDir, 'downloads')
const locksDir = path.join(outDir, 'locks')
const consumerDir = path.join(workDir, 'consumer')
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/blaxel/s6/pw-browsers'
const npmCache = process.env.S6_NPM_CACHE || '/blaxel/s6/npm-cache'
const origin = 'http://127.0.0.1:4173'
const startedAt = new Date().toISOString()
const phaseState = { phase: args.phase, startedAt, steps: [], exit: null }
const logLines = []

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  logLines.push(line)
}

async function flushLog() {
  await ensureDir(outDir)
  await fsp.writeFile(path.join(outDir, `harness-${args.phase}.log`), `${logLines.join('\n')}\n`)
}

async function cmd(label, command, cwd = repo, { timeout = 600_000, env = {} } = {}) {
  const result = await runCommand({
    label,
    command,
    cwd,
    timeout,
    logDir: logsDir,
    env: {
      npm_config_cache: npmCache,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      NO_COLOR: '1',
      ...env,
    },
  })
  phaseState.steps.push({
    label,
    command,
    cwd,
    timeoutMs: timeout,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    log: `logs/${label}.log`,
  })
  log(`[cmd] ${label}: exit=${result.exitCode} timedOut=${result.timedOut} ${result.durationMs}ms`)
  return result
}

function requireExit(result, label) {
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`${label} failed: exit=${result.exitCode} timedOut=${result.timedOut}\n${result.stderr.slice(-4000)}`)
  }
}

async function verifySourceManifest(commit) {
  const manifest = await readJson(sourceManifestPath)
  if (manifest.commit !== commit) throw new Error(`source manifest commit ${manifest.commit} != ${commit}`)
  const digestParts = []
  for (const file of manifest.files) {
    const absolute = path.join(repo, file.path)
    const bytes = await fsp.readFile(absolute)
    const actual = sha256(bytes)
    if (actual !== file.sha256) throw new Error(`source manifest mismatch for ${file.path}: ${actual} != ${file.sha256}`)
    digestParts.push(`${file.path}\0${actual}`)
  }
  const digest = sha256(digestParts.join('\n'))
  if (digest !== manifest.sha256) throw new Error(`source manifest digest mismatch: ${digest} != ${manifest.sha256}`)
  return { commit, sha256: digest, fileCount: manifest.files.length }
}

async function prepare() {
  await ensureDir(outDir)
  await ensureDir(workDir)
  for (const directory of [logsDir, reportsDir, screenshotsDir, downloadsDir, locksDir]) {
    await fsp.rm(directory, { recursive: true, force: true })
    await fsp.mkdir(directory, { recursive: true })
  }
  await fsp.rm(consumerDir, { recursive: true, force: true })
  await fsp.mkdir(consumerDir, { recursive: true })
  for (const file of ['setup.json', 'results.json', 'negative-controls.json', 'versions.json', 'environment.json']) {
    await fsp.rm(path.join(outDir, file), { force: true })
  }

  const expectedSha = await sha256File(expectedPath)
  const goldenSha = await sha256File(goldenPath)
  const tarballSha = await sha256File(tarballPath)
  if (args['expected-sha'] && expectedSha !== args['expected-sha']) throw new Error(`expected results SHA mismatch: ${expectedSha}`)
  if (args['golden-sha'] && goldenSha !== args['golden-sha']) throw new Error(`golden SHA mismatch: ${goldenSha}`)
  if (tarballSha !== 'ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021') {
    throw new Error(`approved tarball SHA mismatch: ${tarballSha}`)
  }
  const sourceManifest = await verifySourceManifest(args.commit)
  log(`source manifest ${sourceManifest.sha256} (${sourceManifest.fileCount} files)`)

  const environment = await cmd('00-environment', [
    'uname -a',
    'cat /etc/os-release',
    'nproc || true',
    'free -m || true',
    'df -h / || true',
    'node --version',
    'npm --version',
  ].join('; '), '/', { timeout: 120_000 })
  requireExit(environment, 'environment preflight')

  const lockBefore = await sha256File(path.join(repo, 'package-lock.json'))
  const npmCi = await cmd('01-npm-ci', 'npm ci', repo)
  requireExit(npmCi, 'npm ci')
  const lockAfter = await sha256File(path.join(repo, 'package-lock.json'))
  if (lockBefore !== lockAfter) throw new Error(`package-lock changed during npm ci: ${lockBefore} != ${lockAfter}`)

  const build = await cmd('02-library-build', 'npm run build', repo)
  requireExit(build, 'library build')
  const siteBuild = await cmd('03-site-build', 'npm run build:site', repo)
  requireExit(siteBuild, 'site build')
  const playwrightInstall = await cmd(
    '04-playwright-install',
    'npx playwright install --with-deps chromium firefox webkit',
    repo,
    { timeout: 540_000 },
  )
  requireExit(playwrightInstall, 'Playwright browser install')

  await fsp.writeFile(
    path.join(consumerDir, 'package.json'),
    `${JSON.stringify({ name: 's6-independent-consumer', version: '1.0.0', private: true, type: 'module' }, null, 2)}\n`,
  )
  const consumerInstall = await cmd(
    '05-consumer-install',
    `npm install --no-audit --no-fund --ignore-scripts --save-exact ${JSON.stringify(tarballPath)}`,
    consumerDir,
  )
  requireExit(consumerInstall, 'consumer tarball install')
  const consumerLockPath = path.join(consumerDir, 'package-lock.json')
  const consumerLockSha = (await fsp.stat(consumerLockPath).catch(() => null)) ? await sha256File(consumerLockPath) : null
  const installedPackage = JSON.parse(await fsp.readFile(path.join(consumerDir, 'node_modules/dither-face/package.json'), 'utf8'))

  const nodeVersion = (await cmd('06-node-version', 'node --version', repo, { timeout: 60_000 })).stdout.trim()
  const npmVersion = (await cmd('07-npm-version', 'npm --version', repo, { timeout: 60_000 })).stdout.trim()
  const playwrightVersion = (await cmd('08-playwright-version', 'npx playwright --version', repo, { timeout: 120_000 })).stdout.trim()
  const packageVersion = JSON.parse(await fsp.readFile(path.join(repo, 'package.json'), 'utf8')).version

  const productSource = await hashTree(path.join(repo, 'src'))
  const siteSource = await hashTree(path.join(repo, 'site'))
  const siteBundle = await hashTree(path.join(repo, 'dist-site'))
  const siteBundleSha = await sha256File(path.join(repo, 'dist-site/assets/app.js'))
  await fsp.copyFile(path.join(repo, 'package-lock.json'), path.join(locksDir, 'package-lock.json'))
  if (consumerLockSha) await fsp.copyFile(consumerLockPath, path.join(locksDir, 'consumer-package-lock.json'))

  const setup = {
    stage: 'S6',
    phase: 'prepare',
    commit: args.commit,
    sandbox: args.sandbox,
    image: args.image ?? null,
    region: args.region ?? null,
    memory: args.memory ?? null,
    cpu: 'platform default (no CPU override)',
    volumes: [],
    origin,
    expectedResultsSha256: expectedSha,
    goldenSha256: goldenSha,
    sourceManifest,
    productSource: { sha256: productSource.sha256, fileCount: productSource.files.length },
    siteSource: { sha256: siteSource.sha256, fileCount: siteSource.files.length },
    siteBundle: { sha256: siteBundleSha, treeSha256: siteBundle.sha256, fileCount: siteBundle.files.length },
    tarball: { path: tarballPath, sha256: tarballSha, bytes: (await fsp.stat(tarballPath)).size },
    locks: {
      packageLockBefore: lockBefore,
      packageLockAfter: lockAfter,
      packageLockUnchanged: lockBefore === lockAfter,
      consumerPackageLockSha256: consumerLockSha,
    },
    versions: {
      node: nodeVersion,
      npm: npmVersion,
      playwright: playwrightVersion,
      package: packageVersion,
      installedConsumerPackage: installedPackage.version,
    },
    consumer: {
      dir: consumerDir,
      installExitCode: consumerInstall.exitCode,
      installLog: 'logs/05-consumer-install.log',
      installedVersion: installedPackage.version,
      packageLockSha256: consumerLockSha,
    },
    environment: {
      command: 'uname -a && cat /etc/os-release && nproc && free -m && df -h / && node --version && npm --version',
      stdout: environment.stdout,
      exitCode: environment.exitCode,
    },
    commands: phaseState.steps,
  }
  await writeJson(path.join(outDir, 'setup.json'), setup)
  const locks = {
    packageLock: { path: 'locks/package-lock.json', sha256: lockBefore, unchangedByNpmCi: lockBefore === lockAfter },
    consumerPackageLock: { path: 'locks/consumer-package-lock.json', sha256: consumerLockSha },
    tarball: { path: tarballPath, sha256: tarballSha, bytes: setup.tarball.bytes },
    expectedResults: { path: expectedPath, sha256: expectedSha },
    golden: { path: goldenPath, sha256: goldenSha },
  }
  await writeJson(path.join(outDir, 'locks.json'), locks)
  await writeJson(path.join(outDir, 'source-hashes.json'), {
    commit: args.commit,
    sourceManifest,
    productSourceSha256: productSource.sha256,
    siteSourceSha256: siteSource.sha256,
    siteBundleSha256: siteBundleSha,
    siteBundleTreeSha256: siteBundle.sha256,
  })
  log(`prepared: node=${nodeVersion} playwright=${playwrightVersion} tarball=${tarballSha} bundle=${siteBundleSha}`)
}

function fatalScenarioState(id, expectedDefinition, message) {
  return {
    id,
    title: expectedDefinition.title,
    expectedStatus: expectedDefinition.expectedStatus,
    expectedCases: expectedDefinition.cases,
    cases: 0,
    assertions: 0,
    failures: [{ case: '__fatal__', assertions: 0, failures: [{ message }] }],
    caseRecords: [],
    notes: [],
    traces: [],
    screenshots: [],
    actualStatus: 'FAIL',
    expectedStatusMatched: false,
  }
}

async function runTest() {
  for (const directory of [logsDir, reportsDir, screenshotsDir, downloadsDir]) {
    await ensureDir(directory)
  }
  const setup = await readJson(path.join(outDir, 'setup.json'))
  const expected = await readJson(expectedPath)
  const golden = await readJson(goldenPath)
  const expectedSha = await sha256File(expectedPath)
  const goldenSha = await sha256File(goldenPath)
  if (expectedSha !== setup.expectedResultsSha256) throw new Error('expected results changed after prepare')
  if (goldenSha !== setup.goldenSha256) throw new Error('golden file changed after prepare')
  if (await sha256File(tarballPath) !== setup.tarball.sha256) throw new Error('tarball changed after prepare')
  const goldenHashes = Object.fromEntries(golden.styles.map((entry) => [entry.slug, entry.sha256]))
  if (Object.keys(goldenHashes).length !== 8) throw new Error('golden fixture does not contain eight styles')
  if (golden.input?.seed !== 'preview-output' || golden.input?.name !== '7even' || golden.input?.px !== 80) {
    throw new Error('golden input does not match the expected fixture')
  }
  const expectedCaseTotal = Object.values(expected.expectations).reduce((sum, entry) => sum + entry.cases.length, 0)
  if (expectedCaseTotal !== expected.expectedTotals.cases) throw new Error('expected case total is inconsistent')

  const lib = await import(pathToFileURL(path.join(repo, 'dist/index.js')).href)
  log(`library loaded: ${lib.STYLES.length} styles`)

  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  const playwright = await import('playwright')

  const serverLog = path.join(logsDir, 'site-server.log')
  const server = startServer({
    command: process.execPath,
    args: ['scripts/serve-site.mjs', '--port', '4173'],
    cwd: repo,
    logPath: serverLog,
    env: { NO_COLOR: '1' },
  })
  const ready = await waitForHttp(`${origin}/`, { timeoutMs: 30_000 })
  log(`site server ready=${ready.ok} status=${ready.status} ${ready.durationMs}ms`)
  if (!ready.ok) {
    await stopServer(server)
    throw new Error(`site server did not become ready: ${JSON.stringify(ready)}`)
  }

  const browserRegistry = createSerializedBrowserRegistry(playwright, ['chromium', 'firefox', 'webkit'], {
    onLifecycle: (event) => log(`[browser-lifecycle] ${JSON.stringify(event)}`),
  })
  const browsers = browserRegistry.browsers
  const versions = {}
  let states = {}
  let controls = []
  let fatal = null
  try {
    try {
      versions.playwrightPackage = createRequire(import.meta.url)('playwright/package.json').version
    } catch {
      versions.playwrightPackage = setup.versions.playwright
    }
    versions.node = setup.versions.node
    versions.npm = setup.versions.npm
    versions.package = setup.versions.package
    log('browser engines launch lazily; the lifecycle registry permits one active engine at a time')

    const screenshots = []
    async function screenshot(page, label) {
      const record = await captureScreenshot(page, screenshotsDir, label)
      screenshots.push(record)
      return record
    }
    const ctx = {
      expected,
      goldenHashes,
      lib,
      origin,
      chromium: browsers.chromium,
      firefox: browsers.firefox,
      webkit: browsers.webkit,
      devices: playwright.devices,
      outDir,
      downloadsDir,
      screenshotsDir,
      consumerDir,
      tarballPath,
      setup,
      cmd,
      screenshot,
      log,
    }
    states = { ...(await runScenariosA(ctx)), ...(await runScenariosB(ctx)) }
    controls = await runNegativeControls(ctx)
  } catch (error) {
    fatal = error
    log(`FATAL: ${error.stack || error.message}`)
  } finally {
    await browserRegistry.closeAll()
    const stopped = await stopServer(server)
    log(`site server stopped: ${JSON.stringify(stopped)}`)
  }

  const observedVersions = browserRegistry.versions()
  versions.chromium = observedVersions.chromium
  versions.firefox = observedVersions.firefox
  versions.webkit = observedVersions.webkit
  versions.mobileChromium = versions.chromium ? `${versions.chromium} (Pixel 7 emulation)` : null
  log(`browsers: chromium=${versions.chromium} firefox=${versions.firefox} webkit=${versions.webkit}`)

  const orderedIds = Object.keys(expected.expectations)
  for (const id of orderedIds) {
    if (!states[id]) states[id] = fatalScenarioState(id, expected.expectations[id], fatal?.message ?? 'scenario did not run')
  }

  const scenarioResults = {}
  let caseTotal = 0
  let assertionTotal = 0
  let failureTotal = 0
  let caseCountsMatch = true
  let statusesMatch = true
  for (const id of orderedIds) {
    const state = states[id]
    const definition = expected.expectations[id]
    caseTotal += state.cases
    assertionTotal += state.assertions
    failureTotal += state.failures.length
    if (state.cases !== definition.cases.length) caseCountsMatch = false
    if (state.actualStatus !== definition.expectedStatus) statusesMatch = false
    scenarioResults[id] = {
      title: state.title,
      severity: definition.severity,
      expectedStatus: state.expectedStatus,
      actualStatus: state.actualStatus,
      cases: state.cases,
      expectedCases: definition.cases.length,
      assertions: state.assertions,
      failures: state.failures,
      notes: state.notes,
      report: `reports/${id}.json`,
      networkTrace: `logs/${id}-network.json`,
      screenshots: state.screenshots,
    }
    await writeJson(path.join(reportsDir, `${id}.json`), {
      scenario: id,
      title: state.title,
      expectedStatus: state.expectedStatus,
      actualStatus: state.actualStatus,
      cases: state.cases,
      assertions: state.assertions,
      failures: state.failures,
      caseRecords: state.caseRecords,
      notes: state.notes,
      screenshots: state.screenshots,
    })
    await writeJson(path.join(logsDir, `${id}-network.json`), state.traces)
  }

  const controlsDetected = controls.length === expected.negativeControls.length && controls.every((entry) => entry.detected === true)
  await writeJson(path.join(outDir, 'negative-controls.json'), {
    stage: 'S6',
    required: expected.negativeControls,
    controls,
    allDetected: controlsDetected,
  })

  const checks = {
    allNineExpectedStatuses: orderedIds.length === 9 && statusesMatch,
    zeroFailures: failureTotal === 0,
    expectedCaseCounts: caseCountsMatch,
    expectedCaseTotal: caseTotal === expected.expectedTotals.cases,
    threeNegativeControlsDetected: controlsDetected,
    tarballMatchesApproved: setup.tarball.sha256 === 'ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021',
    expectedResultsHash: expectedSha === setup.expectedResultsSha256,
    goldenHash: goldenSha === setup.goldenSha256,
    packageLockUnchanged: setup.locks.packageLockUnchanged === true,
    sourceManifestMatches: setup.sourceManifest.sha256 === (await verifySourceManifest(args.commit)).sha256,
    noFatal: fatal === null,
  }

  const finishedAt = new Date().toISOString()
  const results = {
    stage: 'S6',
    commit: args.commit,
    sandbox: args.sandbox,
    image: setup.image,
    region: setup.region,
    memory: setup.memory,
    cpu: setup.cpu,
    volumes: setup.volumes,
    origin,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    expectedResultsSha256: expectedSha,
    goldenSha256: goldenSha,
    sourceManifest: setup.sourceManifest,
    productSource: setup.productSource,
    siteSource: setup.siteSource,
    siteBundle: setup.siteBundle,
    tarball: setup.tarball,
    locks: setup.locks,
    versions,
    scenarios: scenarioResults,
    totals: {
      scenarios: orderedIds.length,
      cases: caseTotal,
      expectedCases: expected.expectedTotals.cases,
      assertions: assertionTotal,
      failures: failureTotal,
      expectedStatuses: expected.expectedTotals.expectedStatuses,
    },
    checks,
    fatal: fatal ? { message: fatal.message, stack: fatal.stack } : null,
  }
  await writeJson(path.join(outDir, 'results.json'), results)
  await writeJson(path.join(outDir, 'versions.json'), versions)
  await writeJson(path.join(outDir, 'environment.json'), {
    ...setup.environment,
    browserVersions: versions,
    sandbox: args.sandbox,
    image: setup.image,
    region: setup.region,
    memory: setup.memory,
    cpu: setup.cpu,
    volumes: setup.volumes,
  })
  await flushLog()
  if (fatal) throw fatal
  if (!Object.values(checks).every(Boolean)) throw new Error(`Stage 6 checks failed: ${JSON.stringify(checks)}`)
}

async function main() {
  try {
    if (args.phase === 'prepare') await prepare()
    else await runTest()
    phaseState.exit = { ok: true }
  } catch (error) {
    phaseState.exit = { ok: false, error: error.stack || String(error) }
    log(`PHASE FAILED: ${error.stack || error}`)
  } finally {
    phaseState.finishedAt = new Date().toISOString()
    await ensureDir(outDir)
    await writeJson(path.join(outDir, `phase-${args.phase}.json`), phaseState)
    await flushLog()
  }
  if (!phaseState.exit.ok) process.exitCode = 1
}

await main()
