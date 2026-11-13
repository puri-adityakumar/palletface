#!/usr/bin/env node
/**
 * Stage 4 independent consumer qualification.
 *
 * Runs entirely in the dedicated sandbox. The six consumer apps live under
 * /blaxel/s4/qualify/apps (outside the uploaded repository); the approved
 * tarball is installed from a byte copy under /blaxel/s4/qualify/fixtures.
 * Every scenario records exact commands, exit codes, counts and actual output,
 * and the browser scenarios use real Chromium and Firefox pages.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import {
  compareGolden,
  createChecker,
  fetchStatus,
  goldenMap,
  hashTree,
  readJson,
  relativeLog,
  runCommand,
  scanTextFiles,
  sha256,
  sha256File,
  startProcess,
  stopProcess,
  validateGolden,
  waitForHttp,
  walkFiles,
  writeJson,
} from './s4-lib.mjs'
import { runReact, runVanilla } from './s4-browser.mjs'

const { values: args } = parseArgs({
  options: {
    repo: { type: 'string' },
    out: { type: 'string' },
    work: { type: 'string' },
    fixtures: { type: 'string' },
    apps: { type: 'string' },
    tools: { type: 'string' },
    expected: { type: 'string' },
    golden: { type: 'string' },
    tarball: { type: 'string' },
    'source-manifest': { type: 'string' },
    commit: { type: 'string' },
    sandbox: { type: 'string' },
    image: { type: 'string' },
    region: { type: 'string' },
    memory: { type: 'string' },
  },
  strict: true,
})

for (const required of ['repo', 'out', 'work', 'fixtures', 'apps', 'tools', 'expected', 'golden', 'tarball', 'source-manifest', 'commit', 'sandbox']) {
  if (!args[required]) throw new Error(`missing --${required}`)
}

const repo = path.resolve(args.repo)
const outDir = path.resolve(args.out)
const workDir = path.resolve(args.work)
const fixturesDir = path.resolve(args.fixtures)
const appsDir = path.resolve(args.apps)
const toolsDir = path.resolve(args.tools)
const expectedPath = path.resolve(args.expected)
const goldenPath = path.resolve(args.golden)
const sourceManifestPath = path.resolve(args['source-manifest'])
const tarballPath = path.resolve(args.tarball)
const logsDir = path.join(outDir, 'logs')
const reportsDir = path.join(outDir, 'reports')
const resultsDir = path.join(outDir, 'results')
const locksDir = path.join(outDir, 'locks')
const screenshotsDir = path.join(outDir, 'screenshots')
const browsersPath = '/blaxel/s4/pw-browsers'
const npmCache = '/blaxel/s4/npm-cache'
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
const startedAt = new Date().toISOString()
const startedMs = Date.now()

const appNames = ['s4-01-node', 's4-02-ts', 's4-03-vanilla', 's4-05-react']
const scenarioOrder = ['S4-01', 'S4-02', 'S4-03', 'S4-04', 'S4-05', 'S4-06', 'S4-07']
const expected = await readJson(expectedPath)
const scenarioRecords = {}
const setupCommands = []
const servers = []

// Clean only this harness's own output, never the orchestration control files
// (harness.log / harness.pid / harness.exit) that share the output directory.
await fsp.mkdir(outDir, { recursive: true })
for (const directory of [logsDir, reportsDir, resultsDir, locksDir, screenshotsDir, workDir]) {
  await fsp.rm(directory, { recursive: true, force: true })
  await fsp.mkdir(directory, { recursive: true })
}
for (const file of ['setup.json', 'results.json', 'controls.json', 'versions.json', 'environment.json']) {
  await fsp.rm(path.join(outDir, file), { force: true })
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function useCmd(commands) {
  return async function cmd(label, command, cwd, options = {}) {
    const result = await runCommand({
      label,
      command,
      cwd,
      env: { npm_config_cache: npmCache, ...(options.env ?? {}) },
      timeout: options.timeout ?? 600_000,
      logDir: logsDir,
    })
    commands.push({
      label,
      command,
      cwd,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      log: relativeLog(result.logPath, outDir),
    })
    console.log(`[cmd] ${label}: exit=${result.exitCode} timedOut=${result.timedOut} ${result.durationMs}ms`)
    return result
  }
}

async function readText(file) {
  return fsp.readFile(file, 'utf8')
}

async function writeFile(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, text)
}

async function waitClosed(url, timeoutMs = 10_000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    last = await fetchStatus(url)
    if (!last.reachable) return { ...last, durationMs: Date.now() - started }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return { ...last, durationMs: Date.now() - started }
}

async function withServer(ctx, { label, command, appDir, port, commands }, run) {
  const url = `http://127.0.0.1:${port}/`
  const logPath = path.join(logsDir, `${label}.log`)
  const server = startProcess({
    label,
    command,
    cwd: appDir,
    logPath,
    env: { npm_config_cache: npmCache, NO_COLOR: '1' },
  })
  const record = {
    label,
    command,
    cwd: appDir,
    url,
    port,
    pid: server.pid,
    startedAt: server.startedAt,
    log: relativeLog(logPath, outDir),
    ready: false,
    status: null,
    durationMs: null,
    stop: null,
    closed: false,
  }
  try {
    const ready = await waitForHttp(url, { timeoutMs: 60_000 })
    record.ready = ready.ok
    record.status = ready.status
    record.durationMs = ready.durationMs
    record.lastError = ready.lastError
    ctx.assert(ready.ok, `${label}: server became reachable`, { status: ready.status, lastError: ready.lastError })
    ctx.assert(ready.status === 200, `${label}: server returned HTTP 200`, { status: ready.status })
    if (!ready.ok) throw new Error(`${label} did not become reachable: ${ready.lastError}`)
    const value = await run({ url, ready, server, record })
    return value
  } finally {
    const stopped = await stopProcess(server)
    record.stop = stopped
    const closed = await waitClosed(url)
    record.closed = !closed.reachable
    ctx.assert(record.closed, `${label}: server closed and port no longer accepts connections`, {
      afterStop: closed,
    })
    servers.push(record)
    console.log(`[server] ${label}: ready=${record.ready} closed=${record.closed} signal=${stopped.signal}`)
  }
}

function assertGoldenStyles(ctx, rows, label) {
  const expectedHashes = goldenMap(golden)
  ctx.assert(Array.isArray(rows) && rows.length === 8, `${label}: eight style rows`)
  for (const row of rows ?? []) {
    ctx.assert(row.sha256 === expectedHashes[row.slug], `${label}: ${row.slug} matches recorded golden`, {
      actual: row.sha256,
      expected: expectedHashes[row.slug],
    })
  }
}

function engineHashes(engineResult) {
  return Object.fromEntries(
    Object.entries(engineResult.initialHashes ?? {}).map(([style, row]) => [style, row.sha256]),
  )
}

// ---------------------------------------------------------------------------
// Fixed artifact and environment setup.
// ---------------------------------------------------------------------------

const setup = createChecker()
const setupCmd = useCmd(setupCommands)

const expectedTarball = expected.expectedTarball
const tarballStat = await fsp.stat(tarballPath)
const tarballSha = await sha256File(tarballPath)
setup.assert(tarballSha === expectedTarball.sha256, 'approved tarball SHA-256', {
  actual: tarballSha,
  expected: expectedTarball.sha256,
  path: tarballPath,
})
setup.assert(tarballStat.size === expectedTarball.gzipBytes, 'approved tarball byte size', {
  actual: tarballStat.size,
  expected: expectedTarball.gzipBytes,
})
if (tarballSha !== expectedTarball.sha256) {
  const failure = {
    stage: 'S4',
    status: 'SETUP-FAIL',
    reason: 'tarball hash mismatch',
    expected: expectedTarball.sha256,
    actual: tarballSha,
    path: tarballPath,
  }
  await writeJson(path.join(outDir, 'setup.json'), failure)
  await writeJson(path.join(outDir, 'results.json'), {
    stage: 'S4',
    status: 'SETUP-FAIL',
    failure,
    scenarios: {},
  })
  console.error(JSON.stringify(failure))
  process.exit(1)
}

// Prove the fixture is a byte copy, not an alias or symlink.
const fixtureStat = await fsp.lstat(tarballPath)
const fixtureCopyPath = path.join(workDir, 'tarball-copy.tgz')
await fsp.copyFile(tarballPath, fixtureCopyPath)
const fixtureCopySha = await sha256File(fixtureCopyPath)
setup.assert(!fixtureStat.isSymbolicLink(), 'fixture tarball is a regular byte copy, not a symlink')
setup.assert(fixtureCopySha === tarballSha, 'second byte copy preserves tarball SHA-256', {
  actual: fixtureCopySha,
  expected: tarballSha,
})

const goldenStat = await fsp.stat(goldenPath)
const goldenSha = await sha256File(goldenPath)
const golden = await readJson(goldenPath)
const goldenProblems = validateGolden(golden)
setup.assert(goldenSha === expected.fixedArtifacts.golden.sha256AtCreation, 'golden file SHA-256', {
  actual: goldenSha,
  expected: expected.fixedArtifacts.golden.sha256AtCreation,
})
setup.assert(goldenProblems.length === 0, 'golden file structure', { problems: goldenProblems })
setup.assert(golden.input.seed === 'preview-output' && golden.input.name === '7even' && golden.input.px === 80, 'golden input is fixed preview-output/7even/80', {
  input: golden.input,
})
const expectedHashes = goldenMap(golden)
for (const row of golden.styles) {
  setup.assert(row.sha256 === expected.fixedArtifacts.golden.hashes[row.slug], `expected-results agrees with golden ${row.slug}`)
}

const sourceManifest = await readJson(sourceManifestPath)
const sourceFiles = await walkFiles(repo)
const sourceFileRows = sourceFiles.filter((entry) => entry.type === 'file')
const manifestByPath = new Map(sourceManifest.files.map((file) => [file.path, file]))
let manifestMismatches = 0
for (const file of sourceFileRows) {
  const row = manifestByPath.get(file.path)
  if (!row || row.sha256 !== file.sha256 || row.size !== file.size) manifestMismatches += 1
}
for (const file of sourceManifest.files) {
  if (!sourceFileRows.some((row) => row.path === file.path)) manifestMismatches += 1
}
setup.assert(manifestMismatches === 0, 'uploaded tracked source matches source manifest', {
  mismatches: manifestMismatches,
  fileCount: sourceFileRows.length,
  manifestFileCount: sourceManifest.fileCount,
})
setup.assert(sourceManifest.fileCount === sourceFileRows.length, 'source manifest file count', {
  actual: sourceFileRows.length,
  expected: sourceManifest.fileCount,
})

const preflight = await setupCmd('preflight', 'node --version && npm --version && uname -a && cat /etc/os-release', repo)
const nodeVersion = (preflight.stdout.match(/v(\d+\.\d+\.\d+)/) ?? [])[1] ?? null
const npmVersion = (preflight.stdout.match(/\n(\d+\.\d+\.\d+)\n/) ?? [])[1] ?? null
setup.assert(Boolean(nodeVersion), 'Node version recorded', { nodeVersion })
setup.assert(npmVersion === '11.19.1', 'npm version is pinned 11.19.1', { actual: npmVersion })
if (npmVersion !== '11.19.1') {
  const globalNpm = await setupCmd('setup-npm-pin', 'npm install -g npm@11.19.1 --no-audit --no-fund', repo, { timeout: 300_000 })
  setup.assert(globalNpm.exitCode === 0, 'npm 11.19.1 installed globally')
  const recheck = await setupCmd('setup-npm-recheck', 'npm --version', repo)
  setup.assert(recheck.stdout.trim() === '11.19.1', 'npm recheck after pin', { actual: recheck.stdout.trim() })
}

// Copy app and tool templates out of the repository into the sandbox projects.
await fsp.rm(appsDir, { recursive: true, force: true })
await fsp.rm(toolsDir, { recursive: true, force: true })
await fsp.mkdir(appsDir, { recursive: true })
for (const app of appNames) {
  await fsp.cp(path.join(repo, 'tests/qualification/s4/apps', app), path.join(appsDir, app), { recursive: true })
}
await fsp.cp(path.join(repo, 'tests/qualification/s4/tools'), toolsDir, { recursive: true })

const appDirs = Object.fromEntries(appNames.map((app) => [app, path.join(appsDir, app)]))
const lockRecords = []

async function bootstrapNpmProject(label, projectDir) {
  const lockFile = path.join(projectDir, 'package-lock.json')
  const trackedLock = fs.existsSync(lockFile)
  let install = null
  if (trackedLock) {
    setup.assert(true, `${label}: tracked package-lock.json is used directly`)
  } else {
    install = await setupCmd(`setup-${label}-lock`, `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, projectDir)
    setup.assert(install.exitCode === 0, `${label}: package-lock generation`, { stderr: install.stderr.slice(-2000) })
  }
  const before = fs.existsSync(lockFile) ? await sha256File(lockFile) : null
  setup.assert(Boolean(before), `${label}: package-lock.json exists`)
  const ci = await setupCmd(`setup-${label}-ci`, `npm ci --no-audit --no-fund --prefer-offline`, projectDir)
  setup.assert(ci.exitCode === 0, `${label}: npm ci reproducibility install`, {
    stderr: ci.stderr.slice(-3000),
  })
  const after = fs.existsSync(lockFile) ? await sha256File(lockFile) : null
  setup.assert(after === before, `${label}: npm ci leaves lockfile byte-identical`, { before, after })
  const modules = fs.existsSync(path.join(projectDir, 'node_modules'))
  setup.assert(modules, `${label}: node_modules installed`)
  if (before) {
    const target = path.join(locksDir, label, 'package-lock.json')
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.copyFile(lockFile, target)
    lockRecords.push({
      project: label,
      path: path.relative(outDir, target).split(path.sep).join('/'),
      sha256: before,
      source: trackedLock ? 'tracked' : 'generated-in-sandbox',
    })
  }
  return { before, after, ci, install, trackedLock }
}

const appBootstrap = {}
for (const app of appNames) {
  appBootstrap[app] = await bootstrapNpmProject(app, appDirs[app])
}
const toolsBootstrap = await bootstrapNpmProject('tools', toolsDir)

const playwrightVersion = await setupCmd('setup-playwright-version', './node_modules/.bin/playwright --version', toolsDir)
setup.assert(playwrightVersion.exitCode === 0, 'Playwright CLI available')
setup.assert(/1\.64\.1/.test(playwrightVersion.stdout), 'Playwright version is pinned 1.64.1', {
  actual: playwrightVersion.stdout.trim(),
})

const browserEnv = { PLAYWRIGHT_BROWSERS_PATH: browsersPath }
const browserInstalls = []
for (const browser of ['chromium', 'firefox']) {
  const installed = await setupCmd(
    `setup-playwright-${browser}`,
    `./node_modules/.bin/playwright install --with-deps ${browser}`,
    toolsDir,
    { timeout: 600_000, env: browserEnv },
  )
  setup.assert(installed.exitCode === 0, `${browser} installed with system dependencies`, {
    exitCode: installed.exitCode,
    stderr: installed.stderr.slice(-3000),
  })
  browserInstalls.push({ browser, exitCode: installed.exitCode, durationMs: installed.durationMs })
}
const browserVersionProbe = await setupCmd(
  'setup-browser-version-probe',
  './node_modules/.bin/playwright --version',
  toolsDir,
  { env: browserEnv },
)
setup.assert(browserVersionProbe.exitCode === 0, 'browser toolchain responds')

// Installed-package resolution must be a real copy inside each app.
const packageResolution = {}
for (const app of appNames) {
  const appDir = appDirs[app]
  const ls = await setupCmd(`setup-${app}-npm-ls`, 'npm ls dither-face --json', appDir)
  setup.assert(ls.exitCode === 0, `${app}: npm ls resolves dither-face`)
  let parsed = null
  try {
    parsed = JSON.parse(ls.stdout)
  } catch {
    parsed = null
  }
  const dependency = parsed?.dependencies?.['dither-face']
  setup.assert(Boolean(dependency), `${app}: npm dependency tree contains dither-face`)
  const installedRoot = path.join(appDir, 'node_modules/dither-face')
  const installedStat = fs.existsSync(installedRoot) ? await fsp.lstat(installedRoot) : null
  setup.assert(Boolean(installedStat?.isDirectory()) && !installedStat?.isSymbolicLink(), `${app}: installed package is a real directory`, {
    installedRoot,
    isSymlink: installedStat?.isSymbolicLink() ?? null,
  })
  const realRoot = installedStat ? await fsp.realpath(installedRoot) : null
  setup.assert(Boolean(realRoot?.includes(`/apps/${app}/node_modules/dither-face`)), `${app}: real path is inside the app`, {
    realRoot,
  })
  setup.assert(!realRoot?.includes('/qualify/repo/'), `${app}: real path is not the repository`)
  const installedPkg = installedRoot && fs.existsSync(path.join(installedRoot, 'package.json'))
    ? await readJson(path.join(installedRoot, 'package.json'))
    : null
  packageResolution[app] = {
    npmLsResolved: dependency?.resolved ?? null,
    installedRoot,
    realRoot,
    isSymlink: installedStat?.isSymbolicLink() ?? null,
    version: installedPkg?.version ?? null,
    runtimeDependencyFields: ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']
      .filter((field) => installedPkg?.[field] !== undefined),
  }
}

const environmentProbe = await setupCmd(
  'environment',
  'node --version; npm --version; uname -a; cat /etc/os-release; nproc; free -m',
  repo,
)
const environment = {
  sandbox: args.sandbox,
  image: args.image ?? 'blaxel/ts-app:latest',
  region: args.region ?? 'us-pdx-1',
  memoryMB: Number(args.memory ?? 4096),
  cpu: 'platform default (no CPU override)',
  volumes: [],
  activeBudget: '30 minutes (authorised cap)',
  os: environmentProbe.stdout,
  node: nodeVersion,
  npm: npmVersion,
  playwright: '1.64.1',
  browsersPath,
  browserInstalls,
  npmCache,
  startedAt,
}
await writeJson(path.join(outDir, 'environment.json'), environment)

const setupRecord = {
  ok: setup.failures.length === 0,
  assertions: setup.assertions,
  failures: setup.failures,
  commands: setupCommands,
  locks: lockRecords,
  packageResolution,
  tarball: {
    path: tarballPath,
    sha256: tarballSha,
    bytes: tarballStat.size,
    fixtureCopyPath,
    fixtureCopySha256: fixtureCopySha,
    symlink: fixtureStat.isSymbolicLink(),
  },
  golden: { path: goldenPath, sha256: goldenSha, problems: goldenProblems },
  source: {
    commit: args.commit,
    manifestSha256: sourceManifest.sha256,
    fileCount: sourceManifest.fileCount,
    verifiedFiles: sourceFileRows.length,
    mismatches: manifestMismatches,
  },
  environment,
  servers,
}
await writeJson(path.join(outDir, 'setup.json'), setupRecord)

if (setup.failures.length > 0) {
  const results = {
    stage: 'S4',
    status: 'SETUP-FAIL',
    startedAt,
    finishedAt: new Date().toISOString(),
    setupFailures: setup.failures,
    scenarios: Object.fromEntries(
      scenarioOrder.map((id) => [id, { id, status: 'NOT RUN', reason: 'setup failed before scenario execution' }]),
    ),
  }
  await writeJson(path.join(outDir, 'results.json'), results)
  console.error(`SETUP-FAIL ${setup.failures.length} failures`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Scenario execution.
// ---------------------------------------------------------------------------

async function runScenario(id, title, severity, body) {
  const commands = []
  const ctx = createChecker()
  const cmd = useCmd(commands)
  const started = Date.now()
  const record = {
    id,
    title,
    severity,
    expectedStatus: expected.expectations[id].expectedStatus,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    commands,
    cases: ctx.cases,
    assertions: ctx.assertions,
    failures: ctx.failures,
  }
  try {
    const actual = await body(ctx, cmd)
    record.actual = actual
    record.status = ctx.failures.length === 0 ? 'PASS' : 'FAIL'
  } catch (error) {
    ctx.assert(false, `${id}: scenario completed without harness exception`, {
      error: String(error?.stack ?? error),
    })
    record.error = String(error?.stack ?? error)
    record.status = 'FAIL'
  }
  record.finishedAt = new Date().toISOString()
  record.durationMs = Date.now() - started
  record.counts = {
    cases: ctx.cases.length,
    assertions: ctx.assertions.length,
    failedAssertions: ctx.failures.length,
    commands: commands.length,
  }
  record.commands = commands
  record.cases = ctx.cases
  record.assertions = ctx.assertions
  record.failures = ctx.failures
  scenarioRecords[id] = record
  await writeJson(path.join(resultsDir, `${id}.json`), record)
  console.log(`[scenario] ${id}: ${record.status} cases=${record.counts.cases} assertions=${record.counts.assertions} failures=${record.counts.failedAssertions}`)
  return record
}

function requirePrevious(id) {
  const record = scenarioRecords[id]
  if (!record || record.status !== 'PASS' || !record.actual) {
    throw new Error(`${id} did not produce a passing actual result; dependent check cannot be evaluated`)
  }
  return record
}

// S4-01 ---------------------------------------------------------------------
await runScenario('S4-01', 'Plain Node ESM JS', 'S1', async (ctx, cmd) => {
  const appDir = appDirs['s4-01-node']
  const reportFile = path.join(reportsDir, 'S4-01.json')
  ctx.case('plain ESM app with installed tarball')
  const run = await cmd(
    's4-01-node-app',
    `S4_GOLDEN=${shellQuote(goldenPath)} S4_OUT=${shellQuote(reportFile)} node app.mjs`,
    appDir,
  )
  ctx.assert(run.exitCode === 0, 'S4-01 app exits 0', { exitCode: run.exitCode, stderr: run.stderr.slice(-2000) })
  ctx.assert(!run.timedOut, 'S4-01 app did not time out')
  const report = await readJson(reportFile)
  ctx.assert(report.ok === true, 'S4-01 app self-check ok', { failures: report.failures })
  ctx.assert(report.styleCount === 8, 'S4-01 eight styles', { styleCount: report.styleCount })
  assertGoldenStyles(ctx, report.styles, 'S4-01')
  ctx.assert(
    report.defaults.implicit === report.defaults.emptyOptions &&
      report.defaults.implicit === report.defaults.explicit &&
      report.defaults.implicit === report.defaults.direct &&
      report.defaults.implicitNameIsSeed === true,
    'S4-01 defaults and direct renderer equivalence',
    { defaults: report.defaults },
  )
  ctx.assert(report.nameSemantics.every((row) => row.changed === row.isLetter), 'S4-01 name only changes letter styles', {
    nameSemantics: report.nameSemantics,
  })
  ctx.assert(report.unicode.count === 140, 'S4-01 Unicode/numeric matrix rendered', { count: report.unicode.count })
  ctx.assert(report.invalid.count >= 15 && report.invalid.allThrew === true, 'S4-01 all invalid inputs threw', {
    count: report.invalid.count,
    allThrew: report.invalid.allThrew,
  })
  ctx.assert(!report.packageIsSymlink, 'S4-01 imported package is not a symlink')
  ctx.assert(report.packageRoot.includes('/apps/s4-01-node/node_modules/dither-face'), 'S4-01 imported package is the app copy', {
    packageRoot: report.packageRoot,
  })
  ctx.assert(report.packageRealPath.includes('/apps/s4-01-node/node_modules/dither-face'), 'S4-01 realpath is the app copy', {
    packageRoot: report.packageRoot,
    packageRealPath: report.packageRealPath,
  })
  ctx.assert(!report.packageRoot.includes('/qualify/repo/'), 'S4-01 package does not resolve to repository source')
  ctx.assert(report.dependencyFields.length === 0, 'S4-01 installed package has no runtime dependencies', {
    dependencyFields: report.dependencyFields,
  })

  const ls = await cmd('s4-01-npm-ls', 'npm ls dither-face --json', appDir)
  ctx.assert(ls.exitCode === 0, 'S4-01 npm ls exits 0')
  const lsJson = JSON.parse(ls.stdout)
  const dependency = lsJson.dependencies?.['dither-face']
  ctx.assert(Boolean(dependency), 'S4-01 npm dependency exists', { dependency })
  ctx.assert(Boolean(dependency?.version === '0.1.0'), 'S4-01 npm resolves version 0.1.0', {
    version: dependency?.version ?? null,
    resolved: dependency?.resolved ?? null,
  })
  ctx.assert(Boolean(report.packageRealPath.includes('/apps/s4-01-node/node_modules/dither-face')), 'S4-01 realpath stays inside the app', {
    packageRealPath: report.packageRealPath,
  })

  return {
    report: {
      ok: report.ok,
      styleCount: report.styleCount,
      styles: report.styles,
      defaults: report.defaults,
      nameSemantics: report.nameSemantics,
      unicodeCount: report.unicode.count,
      invalidCount: report.invalid.count,
      invalidAllThrew: report.invalid.allThrew,
      packageRoot: report.packageRoot,
      packageRealPath: report.packageRealPath,
      packageIsSymlink: report.packageIsSymlink,
      dependencyFields: report.dependencyFields,
      resolvedUrl: report.resolvedUrl,
      npmLsResolved: dependency?.resolved ?? null,
    },
  }
})

// S4-02 ---------------------------------------------------------------------
await runScenario('S4-02', 'Strict TypeScript app', 'S1', async (ctx, cmd) => {
  const appDir = appDirs['s4-02-ts']
  ctx.case('strict TypeScript consumer')
  const bundler = await cmd('s4-02-tsc-bundler', './node_modules/.bin/tsc -p tsconfig.bundler.json', appDir)
  ctx.assert(bundler.exitCode === 0, 'S4-02 Bundler strict compile exits 0', { stderr: bundler.stderr.slice(-3000) })
  ctx.assert(!/error TS\d+/.test(bundler.raw), 'S4-02 Bundler compile has no diagnostics')
  const nodenext = await cmd('s4-02-tsc-nodenext', './node_modules/.bin/tsc -p tsconfig.nodenext.json', appDir)
  ctx.assert(nodenext.exitCode === 0, 'S4-02 NodeNext strict compile exits 0', { stderr: nodenext.stderr.slice(-3000) })
  ctx.assert(!/error TS\d+/.test(nodenext.raw), 'S4-02 NodeNext compile has no diagnostics')

  const reportFile = path.join(reportsDir, 'S4-02.json')
  const run = await cmd(
    's4-02-node-run',
    `S4_GOLDEN=${shellQuote(goldenPath)} S4_OUT=${shellQuote(reportFile)} node dist-node/main.js`,
    appDir,
  )
  ctx.assert(run.exitCode === 0, 'S4-02 emitted NodeNext program exits 0', { stderr: run.stderr.slice(-3000) })
  const report = await readJson(reportFile)
  ctx.assert(report.ok === true, 'S4-02 runtime self-check ok', { failures: report.failures })
  assertGoldenStyles(ctx, report.styles, 'S4-02')
  ctx.assert(report.typedUsage.style === 'pixel-sprite', 'S4-02 documented StyleSlug usage')
  ctx.assert(Boolean(report.resolution?.startsWith('file://')), 'S4-02 runtime resolution recorded', {
    resolution: report.resolution,
  })

  const trace = await cmd('s4-02-tsc-trace', './node_modules/.bin/tsc -p tsconfig.nodenext.json --traceResolution', appDir)
  ctx.assert(trace.exitCode === 0, 'S4-02 traceResolution compile exits 0')
  ctx.assert(trace.raw.includes('node_modules/dither-face/dist/index.d.ts'), 'S4-02 trace resolves installed dist/index.d.ts')
  ctx.assert(!trace.raw.includes('/qualify/repo/src/'), 'S4-02 trace never resolves repository src')

  const negatives = ['invalid-style', 'invalid-options', 'invalid-seed', 'invalid-readonly']
  const negativeRows = []
  for (const name of negatives) {
    const source = await readText(path.join(appDir, 'negative', `${name}.ts`))
    ctx.assert(!source.includes('@ts-expect-error'), `S4-02 ${name}: no suppression comment`)
    const negative = await cmd(
      `s4-02-negative-${name}`,
      `./node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node negative/${name}.ts`,
      appDir,
    )
    const diagnostic = (negative.raw.match(/error TS\d+.*/m) ?? [''])[0]
    ctx.assert(negative.exitCode !== 0, `S4-02 negative ${name}: compiler rejects fixture`, {
      exitCode: negative.exitCode,
      diagnostic,
    })
    ctx.assert(
      /error TS\d+/.test(negative.raw) && negative.raw.includes(`negative/${name}.ts`),
      `S4-02 negative ${name}: diagnostic points at the fixture, not an unrelated failure`,
      { diagnostic },
    )
    negativeRows.push({ name, exitCode: negative.exitCode, diagnostic })
  }

  return {
    bundler: { exitCode: bundler.exitCode, durationMs: bundler.durationMs },
    nodenext: { exitCode: nodenext.exitCode, durationMs: nodenext.durationMs },
    runtime: { ok: report.ok, styles: report.styles, resolution: report.resolution },
    trace: {
      resolvedInstalledTypes: trace.raw.includes('node_modules/dither-face/dist/index.d.ts'),
      resolvedRepositorySource: trace.raw.includes('/qualify/repo/src/'),
    },
    negatives: negativeRows,
  }
})

// S4-03 ---------------------------------------------------------------------
await runScenario('S4-03', 'Vite vanilla dev', 'S1', async (ctx, cmd) => {
  const appDir = appDirs['s4-03-vanilla']
  ctx.case('vanilla Vite dev server and browsers')
  const result = await withServer(
    ctx,
    {
      label: 's4-03-vite-dev',
      command: 'npm run dev -- --host 127.0.0.1 --port 4310 --strictPort',
      appDir,
      port: 4310,
      commands: [],
    },
    async ({ url }) => {
      const chromium = await runVanilla(ctx, {
        engineName: 'chromium',
        url,
        mode: 'dev',
        scenarioId: 'S4-03',
        golden,
        toolsDir,
        outDir,
      })
      const firefox = await runVanilla(ctx, {
        engineName: 'firefox',
        url,
        mode: 'dev',
        scenarioId: 'S4-03',
        golden,
        toolsDir,
        outDir,
      })
      const chromiumHashes = engineHashes(chromium)
      const firefoxHashes = engineHashes(firefox)
      for (const row of golden.styles) {
        ctx.assert(
          chromiumHashes[row.slug] === firefoxHashes[row.slug],
          `S4-03 cross-engine ${row.slug} parity`,
          { chromium: chromiumHashes[row.slug], firefox: firefoxHashes[row.slug] },
        )
      }
      return { url, engines: { chromium, firefox }, hashes: { chromium: chromiumHashes, firefox: firefoxHashes } }
    },
  )
  return result
})

// S4-04 ---------------------------------------------------------------------
await runScenario('S4-04', 'Vite vanilla production', 'S1', async (ctx, cmd) => {
  const appDir = appDirs['s4-03-vanilla']
  ctx.case('vanilla Vite production build and preview')
  const build = await cmd('s4-04-build', 'npm run build', appDir)
  ctx.assert(build.exitCode === 0, 'S4-04 production build exits 0', { stderr: build.stderr.slice(-3000) })
  const indexPath = path.join(appDir, 'dist/index.html')
  ctx.assert(fs.existsSync(indexPath), 'S4-04 dist/index.html exists')
  const indexHtml = await readText(indexPath)
  const assetRefs = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
  ctx.assert(assetRefs.length > 0, 'S4-04 index references hashed assets', { assetRefs })
  const missingAssets = assetRefs.filter((ref) => !fs.existsSync(path.join(appDir, 'dist', ref.replace(/^\//, ''))))
  ctx.assert(missingAssets.length === 0, 'S4-04 every referenced asset exists', { missingAssets })
  const distFiles = (await walkFiles(path.join(appDir, 'dist'))).filter((row) => row.type === 'file')
  ctx.assert(distFiles.length >= 3, 'S4-04 production dist contains build output', { fileCount: distFiles.length })

  const result = await withServer(
    ctx,
    {
      label: 's4-04-vite-preview',
      command: 'npm run preview -- --host 127.0.0.1 --port 4311 --strictPort',
      appDir,
      port: 4311,
      commands: [],
    },
    async ({ url }) => {
      const chromium = await runVanilla(ctx, {
        engineName: 'chromium',
        url,
        mode: 'production',
        scenarioId: 'S4-04',
        golden,
        toolsDir,
        outDir,
      })
      const firefox = await runVanilla(ctx, {
        engineName: 'firefox',
        url,
        mode: 'production',
        scenarioId: 'S4-04',
        golden,
        toolsDir,
        outDir,
      })

      const dev = requirePrevious('S4-03')
      for (const engine of ['chromium', 'firefox']) {
        const devHashes = dev.actual.engines[engine].initialHashes
        const prodHashes = (engine === 'chromium' ? chromium : firefox).initialHashes
        for (const row of golden.styles) {
          ctx.assert(
            devHashes[row.slug]?.sha256 === prodHashes[row.slug]?.sha256,
            `S4-04 ${engine} ${row.slug} dev/production parity`,
            { dev: devHashes[row.slug]?.sha256, production: prodHashes[row.slug]?.sha256 },
          )
        }
      }
      return {
        url,
        engines: { chromium, firefox },
        hashes: { chromium: engineHashes(chromium), firefox: engineHashes(firefox) },
      }
    },
  )
  return {
    ...result,
    build: {
      exitCode: build.exitCode,
      durationMs: build.durationMs,
      assetRefs,
      fileCount: distFiles.length,
      files: distFiles.map((row) => ({ path: row.path, size: row.size, sha256: row.sha256 })),
    },
  }
})

// S4-05 ---------------------------------------------------------------------
await runScenario('S4-05', 'Vite React dev', 'S1', async (ctx, cmd) => {
  const appDir = appDirs['s4-05-react']
  ctx.case('React Vite dev server and browsers')
  const typecheck = await cmd('s4-05-typecheck', 'npm run typecheck', appDir)
  ctx.assert(typecheck.exitCode === 0, 'S4-05 React strict typecheck exits 0', { stderr: typecheck.stderr.slice(-3000) })
  const result = await withServer(
    ctx,
    {
      label: 's4-05-react-dev',
      command: 'npm run dev -- --host 127.0.0.1 --port 4312 --strictPort',
      appDir,
      port: 4312,
      commands: [],
    },
    async ({ url }) => {
      const chromium = await runReact(ctx, {
        engineName: 'chromium',
        url,
        mode: 'dev',
        scenarioId: 'S4-05',
        golden,
        toolsDir,
        outDir,
      })
      const firefox = await runReact(ctx, {
        engineName: 'firefox',
        url,
        mode: 'dev',
        scenarioId: 'S4-05',
        golden,
        toolsDir,
        outDir,
      })
      ctx.assert(chromium.initialHash === firefox.initialHash, 'S4-05 cross-engine React golden parity', {
        chromium: chromium.initialHash,
        firefox: firefox.initialHash,
      })
      return { url, engines: { chromium, firefox } }
    },
  )
  return { ...result, typecheck: { exitCode: typecheck.exitCode, durationMs: typecheck.durationMs } }
})

// S4-06 ---------------------------------------------------------------------
await runScenario('S4-06', 'Vite React production', 'S1', async (ctx, cmd) => {
  const appDir = appDirs['s4-05-react']
  ctx.case('React Vite production build, dist and preview')
  const build = await cmd('s4-06-build', 'npm run build', appDir)
  ctx.assert(build.exitCode === 0, 'S4-06 production build exits 0', { stderr: build.stderr.slice(-3000) })
  const distDir = path.join(appDir, 'dist')
  const distIndexPath = path.join(distDir, 'index.html')
  ctx.assert(fs.existsSync(distIndexPath), 'S4-06 dist/index.html exists')
  const indexHtml = await readText(distIndexPath)
  const assetRefs = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
  ctx.assert(assetRefs.length > 0, 'S4-06 index references hashed assets', { assetRefs })
  const missingAssets = assetRefs.filter((ref) => !fs.existsSync(path.join(distDir, ref.replace(/^\//, ''))))
  ctx.assert(missingAssets.length === 0, 'S4-06 every referenced asset exists', { missingAssets })

  // Match actual Node built-in imports ("node:fs"), not object keys such as
  // `{node:n}` that happen to contain the same four characters.
  const scan = await scanTextFiles(distDir, ['playwright', 'vitest', '@playwright', "[\"']node:[a-z]", 'child_process', '\\brequire\\('])
  ctx.assert(scan.findings.length === 0, 'S4-06 dist contains no test tooling or Node-only APIs', {
    findings: scan.findings,
  })

  const ls = await cmd('s4-06-npm-ls', 'npm ls --omit=dev --json', appDir)
  ctx.assert(ls.exitCode === 0, 'S4-06 production npm ls exits 0')
  const lsJson = JSON.parse(ls.stdout)
  const productionDeps = Object.keys(lsJson.dependencies ?? {}).sort()
  const allowed = new Set(['dither-face', 'react', 'react-dom', 'scheduler'])
  ctx.assert(productionDeps.includes('dither-face'), 'S4-06 dither-face is a consumer dependency', { productionDeps })
  ctx.assert(productionDeps.includes('react') && productionDeps.includes('react-dom'), 'S4-06 React runtime is a consumer dependency', {
    productionDeps,
  })
  ctx.assert(
    productionDeps.every((name) => allowed.has(name)),
    'S4-06 production tree contains no test/build tooling',
    { productionDeps },
  )
  const installedPkg = await readJson(path.join(appDir, 'node_modules/dither-face/package.json'))
  const runtimeFields = ['dependencies', 'optionalDependencies', 'peerDependencies'].filter((field) => installedPkg[field] !== undefined)
  ctx.assert(runtimeFields.length === 0, 'S4-06 dither-face package itself has no runtime dependencies', { runtimeFields })

  const result = await withServer(
    ctx,
    {
      label: 's4-06-react-preview',
      command: 'npm run preview -- --host 127.0.0.1 --port 4313 --strictPort',
      appDir,
      port: 4313,
      commands: [],
    },
    async ({ url }) => {
      const chromium = await runReact(ctx, {
        engineName: 'chromium',
        url,
        mode: 'production',
        scenarioId: 'S4-06',
        golden,
        toolsDir,
        outDir,
      })
      const firefox = await runReact(ctx, {
        engineName: 'firefox',
        url,
        mode: 'production',
        scenarioId: 'S4-06',
        golden,
        toolsDir,
        outDir,
      })
      const dev = requirePrevious('S4-05')
      for (const engine of ['chromium', 'firefox']) {
        const devHash = dev.actual.engines[engine].initialHash
        const prodHash = (engine === 'chromium' ? chromium : firefox).initialHash
        ctx.assert(devHash === prodHash, `S4-06 ${engine} React dev/production parity`, { dev: devHash, production: prodHash })
      }
      return { url, engines: { chromium, firefox } }
    },
  )
  return {
    ...result,
    build: { exitCode: build.exitCode, durationMs: build.durationMs, assetRefs },
    scan: { files: scan.files.length, findings: scan.findings },
    productionDeps,
    runtimeFields,
  }
})

// S4-07 ---------------------------------------------------------------------
await runScenario('S4-07', 'Browser/Node parity', 'S1', async (ctx, cmd) => {
  ctx.case('Node and browser decoded SVG golden parity')
  const appDir = appDirs['s4-01-node']
  const installedIndex = path.join(appDir, 'node_modules/dither-face/dist/index.js')
  const module = await import(pathToFileURL(installedIndex).href)
  const nodeRows = []
  const nodeSvgs = {}
  for (const row of golden.styles) {
    const svg = module.ditherFace(golden.input.seed, {
      style: row.slug,
      px: golden.input.px,
      name: golden.input.name,
    })
    const hash = sha256(svg)
    nodeSvgs[row.slug] = svg
    ctx.assert(hash === expectedHashes[row.slug], `S4-07 Node ${row.slug} recorded golden`, {
      actual: hash,
      expected: expectedHashes[row.slug],
    })
    nodeRows.push({ style: row.slug, sha256: hash, bytes: Buffer.byteLength(svg) })
  }

  const preview = await readJson(path.join(repo, 'src/fixtures/preview.json'))
  const q001 = preview.records.find((row) => row.style === 'ascii-letter')
  ctx.assert(q001?.sha256 === expectedHashes['ascii-letter'], 'S4-07 Q-001 ascii-letter source fixture matches golden', {
    q001: q001?.sha256 ?? null,
    golden: expectedHashes['ascii-letter'],
  })

  const dev = requirePrevious('S4-03')
  const prod = requirePrevious('S4-04')
  const browserRows = []
  for (const engine of ['chromium', 'firefox']) {
    for (const [mode, record] of [['dev', dev], ['production', prod]]) {
      const sourceHashes = record.actual.engines[engine].initialHashes
      const row = { engine, mode, styles: {} }
      for (const goldenRow of golden.styles) {
        const browserHash = sourceHashes[goldenRow.slug]?.sha256 ?? null
        const nodeHash = nodeRows.find((entry) => entry.style === goldenRow.slug)?.sha256 ?? null
        ctx.assert(browserHash === expectedHashes[goldenRow.slug], `S4-07 ${engine}/${mode} ${goldenRow.slug} browser decoded golden`, {
          actual: browserHash,
          expected: expectedHashes[goldenRow.slug],
        })
        ctx.assert(browserHash === nodeHash, `S4-07 ${engine}/${mode} ${goldenRow.slug} Node/browser byte parity`, {
          browser: browserHash,
          node: nodeHash,
        })
        row.styles[goldenRow.slug] = { sha256: browserHash, nodeSha256: nodeHash }
      }
      browserRows.push(row)
    }
  }

  // Negative controls use the exact production comparator.
  const spriteGold = expectedHashes['pixel-sprite']
  const good = compareGolden(nodeSvgs['pixel-sprite'], spriteGold)
  ctx.assert(good.equal === true, 'S4-07 comparator accepts unmodified fixed SVG', good)
  const mutated = nodeSvgs['pixel-sprite'].replace('</svg>', ' </svg>')
  ctx.assert(mutated !== nodeSvgs['pixel-sprite'], 'S4-07 mutation actually changes bytes')
  const mutatedResult = compareGolden(mutated, spriteGold)
  ctx.assert(mutatedResult.equal === false, 'S4-07 comparator rejects one-byte SVG mutation', mutatedResult)
  const wrongDigest = `${spriteGold[0] === '0' ? '1' : '0'}${spriteGold.slice(1)}`
  const wrongResult = compareGolden(nodeSvgs['pixel-sprite'], wrongDigest)
  ctx.assert(wrongResult.equal === false, 'S4-07 comparator rejects wrong expected digest', wrongResult)

  return {
    node: { rows: nodeRows, module: installedIndex },
    q001: { source: q001?.sha256 ?? null, golden: expectedHashes['ascii-letter'] },
    browser: browserRows,
    comparator: {
      good,
      mutated: mutatedResult,
      wrongDigest: wrongResult,
      mutation: { originalBytes: Buffer.byteLength(nodeSvgs['pixel-sprite']), mutatedBytes: Buffer.byteLength(mutated) },
    },
  }
})

// ---------------------------------------------------------------------------
// Negative controls and final evidence.
// ---------------------------------------------------------------------------

const controls = []
const controlCtx = createChecker()
const controlCmd = useCmd([])
try {
  const appDir = appDirs['s4-01-node']
  const brokenFile = path.join(appDir, 'broken-import.mjs')
  await writeFile(brokenFile, "import { ditherFace } from 'dither-face/dist/nope.js'\nconsole.log(ditherFace('x'))\n")
  const broken = await controlCmd('nc1-broken-import', 'node broken-import.mjs', appDir)
  const brokenDetected = broken.exitCode !== 0 && /ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot find package|Cannot find module/.test(broken.raw)
  controlCtx.assert(brokenDetected, 'S4-NC1 broken import fails with a real module-resolution error', {
    exitCode: broken.exitCode,
    stderr: broken.stderr.slice(-1000),
  })
  const positive = await controlCmd(
    'nc1-positive-import',
    `node --input-type=module -e "import('dither-face').then(m => console.log(typeof m.ditherFace))"`,
    appDir,
  )
  controlCtx.assert(positive.exitCode === 0 && positive.stdout.includes('function'), 'S4-NC1 positive root import still succeeds', {
    exitCode: positive.exitCode,
    stdout: positive.stdout.trim(),
  })
  await fsp.rm(brokenFile, { force: true })
  controls.push({
    id: 'S4-NC1',
    description: 'broken package subpath import',
    detected: brokenDetected,
    command: broken.command,
    exitCode: broken.exitCode,
    stderr: broken.stderr.slice(-1000),
    positiveExitCode: positive.exitCode,
  })

  const tsAppDir = appDirs['s4-02-ts']
  const invalidType = await controlCmd(
    'nc2-invalid-type',
    './node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node negative/invalid-options.ts',
    tsAppDir,
  )
  const invalidDetected = invalidType.exitCode !== 0 && /error TS\d+/.test(invalidType.raw)
  controlCtx.assert(invalidDetected, 'S4-NC2 actual tsc checker rejects invalid type fixture', {
    exitCode: invalidType.exitCode,
    diagnostic: (invalidType.raw.match(/error TS\d+.*/m) ?? [''])[0],
  })
  const validCompile = await controlCmd('nc2-valid-type', './node_modules/.bin/tsc -p tsconfig.bundler.json', tsAppDir)
  controlCtx.assert(validCompile.exitCode === 0, 'S4-NC2 valid fixture still compiles', { exitCode: validCompile.exitCode })
  controls.push({
    id: 'S4-NC2',
    description: 'invalid TypeScript fixture',
    detected: invalidDetected,
    command: invalidType.command,
    exitCode: invalidType.exitCode,
    diagnostic: (invalidType.raw.match(/error TS\d+.*/m) ?? [''])[0],
    positiveExitCode: validCompile.exitCode,
  })

  const s407 = scenarioRecords['S4-07']
  const comparatorDetected = s407?.actual?.comparator?.mutated?.equal === false && s407?.actual?.comparator?.wrongDigest?.equal === false
  const comparatorPositive = s407?.actual?.comparator?.good?.equal === true
  controlCtx.assert(comparatorDetected && comparatorPositive, 'S4-NC3 production comparator rejects wrong SVG and wrong digest', {
    comparator: s407?.actual?.comparator ?? null,
  })
  controls.push({
    id: 'S4-NC3',
    description: 'wrong expected SVG and wrong digest',
    detected: comparatorDetected,
    positive: comparatorPositive,
    comparator: s407?.actual?.comparator ?? null,
  })
} catch (error) {
  controlCtx.assert(false, 'negative controls completed without exception', { error: String(error?.stack ?? error) })
}

const controlsRecord = {
  ok: controlCtx.failures.length === 0,
  assertions: controlCtx.assertions,
  failures: controlCtx.failures,
  controls,
}
await writeJson(path.join(outDir, 'controls.json'), controlsRecord)

const harnessFiles = ['s4-qualify.mjs', 's4-lib.mjs', 's4-browser.mjs']
const harnessHashes = {}
for (const file of harnessFiles) {
  harnessHashes[file] = await sha256File(path.join(repo, 'scripts/testing', file))
}

const scenarioValues = scenarioOrder.map((id) => scenarioRecords[id]).filter(Boolean)
const allPass = scenarioValues.length === 7 && scenarioValues.every((record) => record.status === 'PASS')
const totals = {
  scenarios: scenarioValues.length,
  passed: scenarioValues.filter((record) => record.status === 'PASS').length,
  failed: scenarioValues.filter((record) => record.status === 'FAIL').length,
  notRun: scenarioOrder.length - scenarioValues.length,
  cases: scenarioValues.reduce((sum, record) => sum + record.counts.cases, 0),
  assertions: scenarioValues.reduce((sum, record) => sum + record.counts.assertions, 0),
  failedAssertions: scenarioValues.reduce((sum, record) => sum + record.counts.failedAssertions, 0),
  controlsDetected: controls.filter((control) => control.detected === true).length,
  controlsTotal: controls.length,
  durationMs: Date.now() - startedMs,
}

const results = {
  stage: 'S4',
  title: 'Independent Node/TypeScript/Vite browser use',
  status: allPass && controlsRecord.ok ? 'PASS (provisional; parent disposition PENDING)' : 'FAIL',
  disposition: 'PENDING — this harness does not approve itself',
  startedAt,
  finishedAt: new Date().toISOString(),
  sandbox: args.sandbox,
  source: {
    commit: args.commit,
    manifestSha256: sourceManifest.sha256,
    fileCount: sourceManifest.fileCount,
    verifiedFiles: sourceFileRows.length,
  },
  tarball: setupRecord.tarball,
  golden: setupRecord.golden,
  harness: harnessHashes,
  environment,
  locks: lockRecords,
  packageResolution,
  scenarios: Object.fromEntries(scenarioValues.map((record) => [record.id, record])),
  controls: controlsRecord,
  servers,
  totals,
}
await writeJson(path.join(outDir, 'results.json'), results)
await writeJson(path.join(outDir, 'versions.json'), {
  node: nodeVersion,
  npm: npmVersion,
  playwright: '1.64.1',
  playwrightCli: playwrightVersion.stdout.trim(),
  browsers: Object.fromEntries(
    Object.entries(scenarioRecords).flatMap(([id, record]) =>
      record.actual?.engines
        ? Object.entries(record.actual.engines).map(([engine, value]) => [`${id}/${engine}`, { version: value.browserVersion, executablePath: value.executablePath }])
        : [],
    ),
  ),
  vite: appBootstrap['s4-03-vanilla']?.before ? (await readJson(path.join(appDirs['s4-03-vanilla'], 'node_modules/vite/package.json'))).version : null,
  react: appBootstrap['s4-05-react']?.before ? (await readJson(path.join(appDirs['s4-05-react'], 'node_modules/react/package.json'))).version : null,
  typescript: appBootstrap['s4-02-ts']?.before ? (await readJson(path.join(appDirs['s4-02-ts'], 'node_modules/typescript/package.json'))).version : null,
})

console.log(JSON.stringify({
  stage: 'S4',
  status: results.status,
  totals,
  scenarioStatuses: Object.fromEntries(scenarioValues.map((record) => [record.id, record.status])),
  controls: controlsRecord.ok,
}))
if (!allPass || !controlsRecord.ok) process.exitCode = 1
