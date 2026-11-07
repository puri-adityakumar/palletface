#!/usr/bin/env node
/**
 * Stage 9 library/performance track — in-sandbox phase runner.
 *
 * Phases are synchronous and non-overlapping:
 *   prepare      verify source/tarball, install/build, tools and Node 22
 *   library      golden/exports/bundles/soak/cancellation/negative controls
 *   bench        measured 1/100/1000 matrix for one Node filter
 *   playground   throttled browser interaction and resilience
 *   finalize     aggregate, cross-check and write the evidence manifest
 *
 * The runner writes every result under the unique per-run output directory.
 * It never starts an unmanaged background process and never edits product
 * source. Performance rows are measurements, not self-approved PASSes.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  Recorder,
  compareGolden,
  compressedSizes,
  ensureDir,
  hashTree,
  mib,
  parseArgs,
  readJson,
  runCommand,
  runNode,
  runWithCap,
  sha256,
  sha256File,
  walkFiles,
  writeJson,
} from './perf-s9-lib.mjs'
import { runPlayground } from './perf-s9-playground.mjs'

const args = parseArgs(process.argv.slice(2))
if (!args.config) throw new Error('Usage: perf-s9-library.mjs --config <file> [--phase prepare|library|bench|playground|finalize] [--node-filter node24|node22]')
const config = await readJson(args.config)
const phase = args.phase ?? 'prepare'
const expected = await readJson(path.join(config.fixtures, 'expected-results.json'))
const goldenPath = path.join(config.fixtures, 'fixtures/golden.json')
const golden = await readJson(goldenPath)
const styles = golden.styles.map((entry) => entry.slug)
const consumerIndex = path.join(config.work, 'consumer', 'node_modules', 'dither-face', 'dist', 'index.js')
const sourceIndex = path.join(config.repo, 'dist', 'index.js')
const node22 = path.join(config.work, 'node22', 'bin', 'node')
const outRoot = config.out
const commandsDir = path.join(outRoot, 'logs', 'commands')
await ensureDir(commandsDir)

function logCommand(record) {
  const file = path.join(commandsDir, `${record.label.replace(/[^a-zA-Z0-9._-]+/g, '-')}.log`)
  const text = [
    `label: ${record.label}`,
    `command: ${record.command ?? [record.node, ...(record.args ?? [])].join(' ')}`,
    `cwd: ${record.cwd}`,
    `startedAt: ${record.startedAt}`,
    `endedAt: ${record.endedAt}`,
    `durationMs: ${record.durationMs}`,
    `timeoutMs: ${record.timeoutMs}`,
    `exitCode: ${record.exitCode}`,
    `signal: ${record.signal}`,
    `timedOut: ${record.timedOut}`,
    '--- stdout ---',
    record.stdout ?? '',
    '--- stderr ---',
    record.stderr ?? '',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

function commandOk(record) {
  return record.exitCode === 0 && !record.timedOut
}

function outputBytes(record) {
  return (record.stdout?.length ?? 0) + (record.stderr?.length ?? 0)
}

async function writePhase(recorder, name, extra = {}) {
  const summary = recorder.summary()
  await writeJson(path.join(outRoot, name, 'results.json'), { ...summary, ...extra })
  return summary
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function percentiles(values) {
  if (values.length === 0) return { min: null, median: null, p95: null, max: null }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
  return {
    min: sorted[0],
    median: median(sorted),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  }
}

async function environmentRecord() {
  const env = runCommand({
    label: 'environment',
    command: [
      'uname -a',
      'cat /etc/os-release',
      'nproc',
      "lscpu | grep -E 'Model name|CPU\\(s\\)|Thread|Core|Socket|MHz' || true",
      'free -m',
      'df -h /',
      'cat /sys/fs/cgroup/memory.max 2>/dev/null || true',
      'node --version',
      'npm --version',
      'node -p "JSON.stringify(process.versions)"',
    ].join('; '),
    cwd: config.repo,
    timeoutMs: 120000,
  })
  logCommand(env)
  return env
}

function nodeVersion(node) {
  const result = runNode({ label: `version-${path.basename(node)}`, node, args: ['--version'], cwd: config.repo, timeoutMs: 30000 })
  return commandOk(result) ? result.stdout.trim() : null
}

async function verifySourceManifest(recorder) {
  const manifest = await readJson(config.sourceManifest)
  const record = recorder.case('prepare-source-manifest', 'PREPARE', 'Tracked source manifest verification')
  recorder.check(record, 'manifest file count matches upload', manifest.files.length === manifest.fileCount, manifest.fileCount, manifest.files.length)
  let mismatches = 0
  for (const entry of manifest.files) {
    const file = path.join(config.repo, entry.path)
    if (!fs.existsSync(file)) {
      mismatches += 1
      continue
    }
    const bytes = await fsp.readFile(file)
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) mismatches += 1
  }
  recorder.check(record, 'all tracked source files match manifest bytes/hashes', mismatches === 0, 0, mismatches)
  const digest = sha256(manifest.files.map((entry) => `${entry.path}\0${entry.sha256}`).sort().join('\n'))
  recorder.check(record, 'source manifest aggregate digest', digest === manifest.sha256, manifest.sha256, digest)
  recorder.check(record, 'expected source manifest SHA-256 argument', digest === config.sourceManifestSha, config.sourceManifestSha, digest)
  recorder.finish(record, mismatches === 0 ? 'completed' : 'failed')
  return { manifest, digest, mismatches }
}

async function extractTarball(recorder) {
  const extractDir = path.join(config.work, 'tarball')
  await fsp.rm(extractDir, { recursive: true, force: true })
  await ensureDir(extractDir)
  const tar = runCommand({
    label: 'extract-tarball',
    command: `tar -xzf ${JSON.stringify(config.tarball)} -C ${JSON.stringify(extractDir)} && tar -tzf ${JSON.stringify(config.tarball)} | wc -l`,
    cwd: config.root,
    timeoutMs: 120000,
  })
  logCommand(tar)
  const record = recorder.case('prepare-tarball-extract', 'PREPARE', 'Actual frozen tarball extraction')
  recorder.check(record, 'tar extraction exit code', commandOk(tar), 0, tar.exitCode)
  const packageRoot = path.join(extractDir, 'package')
  recorder.check(record, 'tarball contains package/ root', fs.existsSync(packageRoot), true, fs.existsSync(packageRoot))
  recorder.check(record, 'tarball is non-empty', outputBytes(tar) > 0, '>0 listed bytes', outputBytes(tar))
  const tree = await hashTree(packageRoot)
  recorder.check(record, 'tarball package file count', tree.fileCount > 0, '>0', tree.fileCount)
  const tarballBytes = await fsp.readFile(config.tarball)
  recorder.check(record, 'tarball SHA-256', sha256(tarballBytes) === expected.frozenTarball.sha256, expected.frozenTarball.sha256, sha256(tarballBytes))
  recorder.check(record, 'tarball byte length', tarballBytes.length === expected.frozenTarball.bytes, expected.frozenTarball.bytes, tarballBytes.length)
  recorder.finish(record)
  return { packageRoot, tree, tarballBytes }
}

async function compareBuiltSource(recorder, packageRoot) {
  const record = recorder.case('prepare-source-vs-tarball', 'PREPARE', 'Source build vs actual tarball dist/package manifest')
  const sourceDist = await hashTree(path.join(config.repo, 'dist'))
  const packedDist = await hashTree(path.join(packageRoot, 'dist'))
  recorder.check(record, 'dist file lists are identical', JSON.stringify(sourceDist.files.map((entry) => entry.path)) === JSON.stringify(packedDist.files.map((entry) => entry.path)), sourceDist.fileCount, packedDist.fileCount)
  const sourceMap = new Map(sourceDist.files.map((entry) => [entry.path, entry.sha256]))
  const mismatches = packedDist.files.filter((entry) => sourceMap.get(entry.path) !== entry.sha256).map((entry) => entry.path)
  recorder.check(record, 'every compiled file byte-identical', mismatches.length === 0, [], mismatches)
  recorder.check(record, 'dist aggregate SHA-256', sourceDist.sha256 === packedDist.sha256, sourceDist.sha256, packedDist.sha256)
  const packedPackageJson = await sha256File(path.join(packageRoot, 'package.json'))
  const repoPackageJson = await sha256File(path.join(config.repo, 'package.json'))
  recorder.check(record, 'packed package.json equals repo package.json', packedPackageJson === repoPackageJson, repoPackageJson, packedPackageJson)
  const packedReadme = await sha256File(path.join(packageRoot, 'README.md'))
  const repoReadme = await sha256File(path.join(config.repo, 'README.md'))
  recorder.check(record, 'packed README equals repo README', packedReadme === repoReadme, repoReadme, packedReadme)
  const packedLicense = await sha256File(path.join(packageRoot, 'LICENSE'))
  const repoLicense = await sha256File(path.join(config.repo, 'LICENSE'))
  recorder.check(record, 'packed LICENSE equals repo LICENSE', packedLicense === repoLicense, repoLicense, packedLicense)
  recorder.finish(record)
  return { sourceDist, packedDist, mismatches }
}

async function installConsumer(recorder) {
  const consumer = path.join(config.work, 'consumer')
  await fsp.rm(consumer, { recursive: true, force: true })
  await ensureDir(consumer)
  await fsp.writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({
    name: 's9-library-consumer',
    version: '0.0.0',
    private: true,
    type: 'module',
  }, null, 2)}\n`)
  const install = runCommand({
    label: 'consumer-install',
    command: `npm install --no-audit --no-fund --ignore-scripts --no-package-lock --prefer-offline ${JSON.stringify(config.tarball)}`,
    cwd: consumer,
    env: { npm_config_cache: path.join(config.work, 'npm-cache') },
    timeoutMs: 180000,
  })
  logCommand(install)
  const record = recorder.case('prepare-consumer-install', 'PREPARE', 'Empty consumer installs actual tarball')
  recorder.check(record, 'npm install exit code', commandOk(install), 0, install.exitCode)
  const installedRoot = path.join(consumer, 'node_modules', 'dither-face')
  recorder.check(record, 'installed package directory exists', fs.existsSync(installedRoot), true, fs.existsSync(installedRoot))
  const real = fs.existsSync(installedRoot) ? await fsp.realpath(installedRoot) : null
  recorder.check(record, 'installed package is not a symlink to the repo', real !== null && !real.startsWith(config.repo), `not under ${config.repo}`, real)
  const tree = fs.existsSync(installedRoot) ? await hashTree(installedRoot) : { fileCount: 0, files: [] }
  recorder.check(record, 'installed package has dist files', tree.files.some((entry) => entry.path === 'dist/index.js'), true, tree.fileCount)
  const ls = runCommand({
    label: 'consumer-npm-ls',
    command: 'npm ls --omit=dev --json',
    cwd: consumer,
    timeoutMs: 60000,
  })
  logCommand(ls)
  let parsed = null
  try { parsed = JSON.parse(ls.stdout) } catch {}
  const dependencies = parsed?.dependencies ?? {}
  const runtimeDependencies = Object.keys(dependencies).filter((name) => dependencies[name]?.version && dependencies[name]?.resolved?.startsWith?.('http'))
  recorder.check(record, 'no runtime dependencies installed', runtimeDependencies.length === 0, [], runtimeDependencies)
  recorder.finish(record)
  return { consumer, installedRoot, tree, ls: parsed, install }
}

async function writeConsumerSmoke() {
  const consumer = path.join(config.work, 'consumer')
  const file = path.join(consumer, 'smoke.mjs')
  await fsp.writeFile(file, `import { createHash } from 'node:crypto'
import { ditherFace, STYLES } from 'dither-face'
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const styles = {}
for (const style of STYLES) {
  styles[style.slug] = sha256(ditherFace('preview-output', { style: style.slug, px: 80, name: '7even' }))
}
console.log(JSON.stringify({ exports: Object.keys(await import('dither-face')).sort(), styleCount: STYLES.length, styles }))
`)
  return file
}

async function runConsumerSmoke(recorder, node, label, nodeTag) {
  const file = await writeConsumerSmoke()
  const result = runNode({ label, node, args: [file], cwd: path.join(config.work, 'consumer'), timeoutMs: 60000 })
  logCommand(result)
  const record = recorder.case(`prepare-consumer-smoke-${nodeTag}`, 'PREPARE', `Consumer package import and golden smoke (${nodeTag})`)
  recorder.check(record, 'smoke exit code', commandOk(result), 0, result.exitCode)
  let parsed = null
  try { parsed = JSON.parse(result.stdout.trim()) } catch {}
  recorder.check(record, 'smoke emits JSON', parsed !== null, true, result.stdout.slice(0, 200))
  if (parsed) {
    recorder.check(record, 'eight styles enumerated', parsed.styleCount === 8, 8, parsed.styleCount)
    const comparison = compareGolden(golden, parsed.styles)
    recorder.check(record, 'consumer output matches golden', comparison.ok, 'all eight match', comparison.mismatches)
  }
  recorder.finish(record)
  return { result, parsed }
}

async function preparePhase() {
  const recorder = new Recorder({ stage: 'S9', track: 'library-performance', phase: 'prepare' })
  await ensureDir(path.join(outRoot, 'prepare'))
  const env = await environmentRecord()
  const versions = {
    os: (env.stdout.match(/PRETTY_NAME="([^"]+)"/) ?? [])[1] ?? null,
    kernel: (env.stdout.match(/Linux \S+ /) ?? [])[0]?.trim() ?? null,
    nproc: (env.stdout.match(/^(\d+)$/m) ?? [])[1] ? Number((env.stdout.match(/^(\d+)$/m) ?? [])[1]) : null,
    cpuModel: (env.stdout.match(/Model name:\s*(.+)/) ?? [])[1]?.trim() ?? null,
    node24: null,
    npm24: null,
    node22: null,
    npm22: null,
  }
  const node24Version = runCommand({ label: 'node24-version', command: 'node --version', cwd: config.repo, timeoutMs: 30000 })
  versions.node24 = node24Version.stdout.trim()
  const npm24Version = runCommand({ label: 'npm24-version', command: 'npm --version', cwd: config.repo, timeoutMs: 30000 })
  versions.npm24 = npm24Version.stdout.trim()
  logCommand(node24Version)
  logCommand(npm24Version)

  const manifest = await verifySourceManifest(recorder)
  const tarball = await extractTarball(recorder)

  const npmCi = runCommand({ label: 'repo-npm-ci', command: 'npm ci --no-audit --no-fund', cwd: config.repo, timeoutMs: 300000 })
  logCommand(npmCi)
  const ciCase = recorder.case('prepare-repo-npm-ci', 'PREPARE', 'Repository dependency install')
  recorder.check(ciCase, 'npm ci exit code', commandOk(npmCi), 0, npmCi.exitCode)
  recorder.finish(ciCase)

  const build = runCommand({ label: 'repo-build', command: 'npm run build', cwd: config.repo, timeoutMs: 180000 })
  logCommand(build)
  const buildCase = recorder.case('prepare-repo-build', 'PREPARE', 'Compile source with tsc')
  recorder.check(buildCase, 'npm run build exit code', commandOk(build), 0, build.exitCode)
  recorder.finish(buildCase)

  const buildWeb = runCommand({ label: 'repo-build-web', command: 'npm run build:web', cwd: config.repo, timeoutMs: 180000 })
  logCommand(buildWeb)
  const webCase = recorder.case('prepare-repo-build-web', 'PREPARE', 'Build product IIFE')
  recorder.check(webCase, 'npm run build:web exit code', commandOk(buildWeb), 0, buildWeb.exitCode)
  recorder.finish(webCase)

  const buildSite = runCommand({ label: 'repo-build-site', command: 'npm run build:site', cwd: config.repo, timeoutMs: 180000 })
  logCommand(buildSite)
  const siteCase = recorder.case('prepare-repo-build-site', 'PREPARE', 'Build site for playground resilience')
  recorder.check(siteCase, 'npm run build:site exit code', commandOk(buildSite), 0, buildSite.exitCode)
  recorder.finish(siteCase)

  const sourceComparison = await compareBuiltSource(recorder, tarball.packageRoot)
  const consumer = await installConsumer(recorder)

  const toolsCi = runCommand({
    label: 'tools-npm-ci',
    command: 'npm ci --no-audit --no-fund --ignore-scripts',
    cwd: config.tools,
    timeoutMs: 180000,
  })
  logCommand(toolsCi)
  const toolsCase = recorder.case('prepare-tools-install', 'PREPARE', 'Pinned esbuild/Playwright tools install')
  recorder.check(toolsCase, 'tools npm ci exit code', commandOk(toolsCi), 0, toolsCi.exitCode)
  recorder.finish(toolsCase)

  const toolsLockSha = await sha256File(path.join(config.tools, 'package-lock.json'))
  const toolsCase2 = recorder.case('prepare-tools-lock', 'PREPARE', 'Tools lock pin check')
  recorder.check(toolsCase2, 'tools lock SHA-256', toolsLockSha === config.toolsLockSha, config.toolsLockSha, toolsLockSha)
  recorder.finish(toolsCase2)

  const playwrightInstall = runCommand({
    label: 'playwright-install-chromium',
    command: 'npx playwright install --with-deps chromium',
    cwd: config.tools,
    env: { PLAYWRIGHT_BROWSERS_PATH: config.pwBrowsers },
    timeoutMs: 420000,
  })
  logCommand(playwrightInstall)
  const pwCase = recorder.case('prepare-playwright-chromium', 'PREPARE', 'Pinned Chromium install')
  recorder.check(pwCase, 'playwright install exit code', commandOk(playwrightInstall), 0, playwrightInstall.exitCode)
  const browserList = runCommand({
    label: 'playwright-install-list',
    command: 'npx playwright install --list',
    cwd: config.tools,
    env: { PLAYWRIGHT_BROWSERS_PATH: config.pwBrowsers },
    timeoutMs: 60000,
  })
  logCommand(browserList)
  recorder.check(pwCase, 'browser list reports Chromium', /chromium/i.test(browserList.stdout), 'Chromium entry', browserList.stdout.slice(0, 500))
  recorder.finish(pwCase)

  await ensureDir(path.join(config.work, 'node22'))
  const node22Archive = path.join(config.work, 'node22.tar.gz')
  let node22Available = false
  let node22Record = null
  if (!fs.existsSync(path.join(config.work, 'node22', 'bin', 'node'))) {
    const downloadScript = path.join(config.work, 'download-node22.mjs')
    await fsp.writeFile(downloadScript, `import fs from 'node:fs'
const [url, destination] = process.argv.slice(2)
const response = await fetch(url)
if (!response.ok) throw new Error('download failed: ' + response.status + ' ' + response.statusText)
fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
`)
    const download = runNode({
      label: 'node22-download',
      node: process.execPath,
      args: [downloadScript, 'https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.gz', node22Archive],
      cwd: config.work,
      timeoutMs: 180000,
    })
    logCommand(download)
    const checksum = runCommand({
      label: 'node22-checksum',
      command: `printf '%s  %s\\n' ${JSON.stringify(expected.tools.node22.sha256)} ${JSON.stringify(node22Archive)} | sha256sum -c -`,
      cwd: config.work,
      timeoutMs: 60000,
    })
    logCommand(checksum)
    const extract = runCommand({
      label: 'node22-extract',
      command: `tar -xzf ${JSON.stringify(node22Archive)} -C ${JSON.stringify(path.join(config.work, 'node22'))} --strip-components=1`,
      cwd: config.work,
      timeoutMs: 120000,
    })
    logCommand(extract)
    node22Record = {
      exitCode: download.exitCode === 0 && checksum.exitCode === 0 && extract.exitCode === 0 ? 0 : 1,
      error: [download.error, checksum.error, extract.error].filter(Boolean).join('; ') || null,
      download,
      checksum,
      extract,
    }
    const downloadCase = recorder.case('prepare-node22-download', 'PREPARE', 'Pinned Node 22 runtime download, checksum and extract')
    recorder.check(downloadCase, 'download exit code', commandOk(download), 0, download.exitCode)
    recorder.check(downloadCase, 'archive checksum exit code', commandOk(checksum), 0, checksum.exitCode)
    recorder.check(downloadCase, 'archive extraction exit code', commandOk(extract), 0, extract.exitCode)
    recorder.finish(downloadCase)
  }
  if (fs.existsSync(node22)) {
    const version = nodeVersion(node22)
    if (version === 'v22.23.4') {
      node22Available = true
      versions.node22 = version
      const npm22Version = runNode({ label: 'npm22-version', node: node22, args: [path.join(config.work, 'node22', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), '--version'], cwd: config.repo, timeoutMs: 30000 })
      versions.npm22 = commandOk(npm22Version) ? npm22Version.stdout.trim() : null
      logCommand(npm22Version)
      const check = recorder.case('prepare-node22-runtime', 'PREPARE', 'Pinned Node 22 runtime identity')
      recorder.check(check, 'Node 22 version', version === 'v22.23.4', 'v22.23.4', version)
      if (fs.existsSync(node22Archive)) {
        const archiveSha = sha256(await fsp.readFile(node22Archive))
        recorder.check(check, 'Node 22 archive SHA-256', archiveSha === expected.tools.node22.sha256, expected.tools.node22.sha256, archiveSha)
      } else {
        recorder.check(check, 'Node 22 archive available for hash pin', false, true, false)
      }
      recorder.finish(check)
    }
  }
  if (!node22Available) {
    const record = recorder.case('prepare-node22-unavailable', 'PREPARE', 'Pinned Node 22 runtime')
    recorder.check(record, 'Node 22 available for runtime comparison', false, true, false)
    recorder.finish(record, 'blocked')
  }

  const node24Smoke = await runConsumerSmoke(recorder, process.execPath, 'consumer-smoke-node24', 'node24')
  let node22Smoke = null
  if (node22Available) node22Smoke = await runConsumerSmoke(recorder, node22, 'consumer-smoke-node22', 'node22')

  const esbuildVersion = runCommand({ label: 'esbuild-version', command: 'node_modules/.bin/esbuild --version', cwd: config.tools, timeoutMs: 30000 })
  const playwrightVersion = runCommand({ label: 'playwright-version', command: 'npx playwright --version', cwd: config.tools, env: { PLAYWRIGHT_BROWSERS_PATH: config.pwBrowsers }, timeoutMs: 30000 })
  logCommand(esbuildVersion)
  logCommand(playwrightVersion)
  const chromiumFind = runCommand({
    label: 'chromium-binary-find',
    command: `find ${JSON.stringify(config.pwBrowsers)} -type f \\( -name chrome -o -name headless_shell \\) 2>/dev/null | head -5`,
    cwd: config.repo,
    timeoutMs: 30000,
  })
  logCommand(chromiumFind)
  const chromiumBinary = chromiumFind.stdout.split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? null

  const prepare = {
    versions: {
      ...versions,
      node24: versions.node24,
      npm24: versions.npm24,
      node22: node22Available ? versions.node22 : null,
      npm22: versions.npm22,
      esbuild: esbuildVersion.stdout.trim() || null,
      playwright: playwrightVersion.stdout.trim() || null,
      chromiumBinary,
      playwrightList: browserList.stdout.trim(),
    },
    environmentText: env.stdout,
    manifest: { fileCount: manifest.manifest.fileCount, sha256: manifest.digest },
    tarball: { path: config.tarball, bytes: tarball.tarballBytes.length, sha256: sha256(tarball.tarballBytes), tree: tarball.tree },
    sourceDist: sourceComparison.sourceDist,
    packedDist: sourceComparison.packedDist,
    distMismatches: sourceComparison.mismatches,
    consumer: { tree: consumer.tree, npmLs: consumer.ls },
    node22Available,
    node22Download: node22Record ? { exitCode: node22Record.exitCode, error: node22Record.error } : null,
    commands: { npmCi: npmCi.exitCode, build: build.exitCode, buildWeb: buildWeb.exitCode, buildSite: buildSite.exitCode, toolsCi: toolsCi.exitCode, playwrightInstall: playwrightInstall.exitCode },
    consumerSmokes: { node24: node24Smoke.parsed, node22: node22Smoke?.parsed ?? null },
    completedAt: new Date().toISOString(),
  }
  await writeJson(path.join(outRoot, 'prepare', 'prepare.json'), prepare)
  await writePhase(recorder, 'prepare', { prepare })
  return prepare
}

function requireTools() {
  const requireFromTools = createRequire(path.join(config.tools, 'package.json'))
  return {
    esbuild: requireFromTools('esbuild'),
    playwright: requireFromTools('playwright'),
  }
}

async function buildBundles(recorder) {
  const { esbuild } = requireTools()
  const consumer = path.join(config.work, 'consumer')
  const entries = path.join(consumer, 's9-bundle-entries')
  const outputs = path.join(outRoot, 'library', 'bundles')
  await ensureDir(entries)
  await ensureDir(outputs)
  const entryFiles = {
    all: path.join(entries, 'all-esm.mjs'),
    oneRoot: path.join(entries, 'one-root-esm.mjs'),
    oneDirect: path.join(entries, 'one-direct-esm.mjs'),
  }
  await fsp.writeFile(entryFiles.all, `import { ditherFace } from 'dither-face'\nconsole.log(ditherFace('bundle-all', { style: 'pixel-sprite', px: 80 }))\n`)
  await fsp.writeFile(entryFiles.oneRoot, `import { pixelSprite } from 'dither-face'\nconsole.log(pixelSprite('bundle-one-root', 80))\n`)
  await fsp.writeFile(entryFiles.oneDirect, `import { pixelSprite } from '../node_modules/dither-face/dist/styles/pixel-sprite.js'\nconsole.log(pixelSprite('bundle-one-direct', 80))\n`)

  const builds = {}
  for (const [name, entry] of Object.entries(entryFiles)) {
    for (const minify of [false, true]) {
      const variant = minify ? `${name}Min` : name
      const outfile = path.join(outputs, `${name}${minify ? '-min' : ''}.js`)
      const result = await esbuild.build({
        absWorkingDir: consumer,
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: ['es2022'],
        outfile,
        minify,
        metafile: true,
        logLevel: 'silent',
        write: true,
      })
      const bytes = await fsp.readFile(outfile)
      const inputs = Object.keys(result.metafile.inputs).sort()
      const outputInputs = Object.values(result.metafile.outputs)[0]?.inputs ?? {}
      const includedInputBytes = Object.fromEntries(Object.entries(outputInputs).map(([input, info]) => [input, info.bytesInOutput ?? 0]))
      const includedStyles = Object.entries(includedInputBytes)
        .filter(([, bytesInOutput]) => bytesInOutput > 0)
        .map(([input]) => input.match(/dist\/styles\/([a-z-]+)\.js$/))
        .filter(Boolean)
        .map((match) => match[1])
      builds[variant] = {
        entry,
        minify,
        outfile,
        bytes: bytes.length,
        ...compressedSizes(bytes),
        inputs,
        includedStyles,
        includedInputBytes,
        includedInputs: result.metafile.inputs,
      }
      await fsp.writeFile(path.join(outputs, `${variant}.metafile.json`), `${JSON.stringify(result.metafile, null, 2)}\n`)
      recorder.measure(recorder.cases.find((entry) => entry.id === 'library-bundles') ?? { id: 'library-bundles', scenario: 'S9-04' }, `bundle ${name}${minify ? '-min' : ''} raw`, bytes.length, 'bytes')
    }
  }

  // One-renderer IIFE diagnostic. Built unminified so it is comparable with
  // the product's unminified dist/dither-face.js; a minified variant is also
  // recorded as supplementary information.
  const iifeEntry = path.join(entries, 'one-direct-iife.mjs')
  await fsp.writeFile(iifeEntry, `import { pixelSprite } from '../node_modules/dither-face/dist/styles/pixel-sprite.js'\nglobalThis.S9One = { pixelSprite }\n`)
  for (const minify of [false, true]) {
    const suffix = minify ? '-min' : ''
    const iifeOut = path.join(outputs, `one-direct-iife${suffix}.js`)
    const iifeResult = await esbuild.build({
      absWorkingDir: consumer,
      entryPoints: [iifeEntry],
      bundle: true,
      format: 'iife',
      globalName: 'S9One',
      platform: 'browser',
      target: ['es2022'],
      outfile: iifeOut,
      minify,
      metafile: true,
      logLevel: 'silent',
      write: true,
    })
    const iifeBytes = await fsp.readFile(iifeOut)
    const iifeInputs = Object.entries(iifeResult.metafile.inputs)
    const iifeOutputInputs = Object.values(iifeResult.metafile.outputs)[0]?.inputs ?? {}
    const iifeIncludedInputBytes = Object.fromEntries(Object.entries(iifeOutputInputs).map(([input, info]) => [input, info.bytesInOutput ?? 0]))
    builds[minify ? 'oneDirectIifeMin' : 'oneDirectIife'] = {
      entry: iifeEntry,
      minify,
      outfile: iifeOut,
      bytes: iifeBytes.length,
      ...compressedSizes(iifeBytes),
      inputs: iifeInputs.map(([input]) => input).sort(),
      includedStyles: Object.entries(iifeIncludedInputBytes)
        .filter(([, bytesInOutput]) => bytesInOutput > 0)
        .map(([input]) => input.match(/dist\/styles\/([a-z-]+)\.js$/))
        .filter(Boolean)
        .map((match) => match[1]),
      includedInputBytes: iifeIncludedInputBytes,
    }
    await fsp.writeFile(path.join(outputs, `one-direct-iife${suffix}.metafile.json`), `${JSON.stringify(iifeResult.metafile, null, 2)}\n`)
  }
  return builds
}

async function libraryPhase() {
  const recorder = new Recorder({ stage: 'S9', track: 'library-performance', phase: 'library' })
  await ensureDir(path.join(outRoot, 'library'))
  const prepare = await readJson(path.join(outRoot, 'prepare', 'prepare.json'))
  const tarballModule = await import(pathToFileURL(consumerIndex).href)
  const sourceModule = await import(pathToFileURL(sourceIndex).href)
  const expectedExports = await readJson(path.join(config.repo, 'tests/qualification/s3/expected-exports.json'))

  const actualStyles = {}
  for (const style of styles) {
    actualStyles[style] = sha256(tarballModule.ditherFace('preview-output', { style, px: 80, name: '7even' }))
  }
  const goldenCase = recorder.case('library-golden-tarball', 'PREPARE', 'Actual tarball output vs parent-accepted golden')
  const goldenComparison = compareGolden(golden, actualStyles)
  recorder.check(goldenCase, 'all eight fixed hashes match golden', goldenComparison.ok, 'all eight', goldenComparison.mismatches)
  recorder.finish(goldenCase)

  const parityCase = recorder.case('library-source-tarball-parity', 'PREPARE', 'Source build vs actual tarball output parity')
  let parityMismatches = []
  for (const style of styles) {
    const sourceSha = sha256(sourceModule.ditherFace('preview-output', { style, px: 80, name: '7even' }))
    if (sourceSha !== actualStyles[style]) parityMismatches.push({ style, tarball: actualStyles[style], source: sourceSha })
  }
  recorder.check(parityCase, 'source and tarball render identical bytes', parityMismatches.length === 0, [], parityMismatches)
  recorder.check(parityCase, 'source build dist equals packed dist', prepare.distMismatches.length === 0, [], prepare.distMismatches)
  recorder.finish(parityCase)

  const exportsCase = recorder.case('library-exports', 'S9-04', 'Public runtime export inventory')
  const actualExports = Object.keys(tarballModule).sort()
  const expectedExportsList = [...expectedExports.runtimeValueExports].sort()
  recorder.check(exportsCase, 'runtime exports exactly match expected inventory', JSON.stringify(actualExports) === JSON.stringify(expectedExportsList), expectedExportsList, actualExports)
  recorder.check(exportsCase, 'runtime export count', actualExports.length === expectedExportsList.length, expectedExportsList.length, actualExports.length)
  recorder.finish(exportsCase)

  // Cold import cost: root vs one direct style, five fresh processes each.
  const importCosts = {}
  for (const [label, modulePath, count] of [
    ['root', consumerIndex, 5],
    ['oneDirect', path.join(config.work, 'consumer', 'node_modules', 'dither-face', 'dist', 'styles', 'pixel-sprite.js'), 5],
  ]) {
    const runs = []
    for (let index = 0; index < count; index += 1) {
      const result = runNode({
        label: `import-${label}-${index}`,
        node: process.execPath,
        args: [path.join(config.repo, 'scripts/testing/perf-s9-import.mjs'), '--module', modulePath],
        cwd: config.repo,
        timeoutMs: 60000,
      })
      logCommand(result)
      let parsed = null
      if (result.exitCode === 0) {
        try { parsed = JSON.parse(result.stdout.trim()) } catch { parsed = null }
      }
      runs.push({ exitCode: result.exitCode, timedOut: result.timedOut, parsed })
    }
    importCosts[label] = runs
  }
  const importCase = recorder.case('library-import-cost', 'S9-04', 'Cold import cost root vs one renderer')
  const rootParsed = importCosts.root.filter((run) => run.parsed).map((run) => run.parsed)
  const directParsed = importCosts.oneDirect.filter((run) => run.parsed).map((run) => run.parsed)
  recorder.check(importCase, 'five root import runs succeeded', rootParsed.length === 5, 5, rootParsed.length)
  recorder.check(importCase, 'five direct renderer import runs succeeded', directParsed.length === 5, 5, directParsed.length)
  recorder.check(importCase, 'root export inventory matches expected', JSON.stringify(rootParsed[0]?.exports) === JSON.stringify(expectedExportsList), expectedExportsList, rootParsed[0]?.exports)
  recorder.check(importCase, 'direct renderer import exposes pixelSprite', directParsed[0]?.exports?.includes('pixelSprite') === true, true, directParsed[0]?.exports)
  const importSummary = {
    root: {
      runs: rootParsed.length,
      importMs: percentiles(rootParsed.map((entry) => entry.importMs)),
      rssMiB: percentiles(rootParsed.map((entry) => mib(entry.rssBytes))),
      heapUsedMiB: percentiles(rootParsed.map((entry) => mib(entry.heapUsedBytes))),
      exportCount: rootParsed[0]?.exportCount ?? null,
    },
    oneDirect: {
      runs: directParsed.length,
      importMs: percentiles(directParsed.map((entry) => entry.importMs)),
      rssMiB: percentiles(directParsed.map((entry) => mib(entry.rssBytes))),
      heapUsedMiB: percentiles(directParsed.map((entry) => mib(entry.heapUsedBytes))),
      exportCount: directParsed[0]?.exportCount ?? null,
    },
  }
  recorder.measure(importCase, 'root import ms median', importSummary.root.importMs.median, 'ms', { runs: importSummary.root.runs })
  recorder.measure(importCase, 'one renderer import ms median', importSummary.oneDirect.importMs.median, 'ms', { runs: importSummary.oneDirect.runs })
  recorder.finish(importCase)

  // Size and tree-shaking.
  const bundleCase = recorder.case('library-bundles', 'S9-04', 'Package and bundle size / esbuild tree-shaking')
  const bundles = await buildBundles(recorder)
  const productEsm = await fsp.readFile(sourceIndex)
  const productIifePath = path.join(config.repo, 'dist', 'dither-face.js')
  const productIife = await fsp.readFile(productIifePath)
  const productSizes = {
    tarballBytes: prepare.tarball.bytes,
    packedDistBytes: prepare.packedDist.totalBytes,
    packedDistFiles: prepare.packedDist.fileCount,
    esm: { path: 'dist/index.js', ...compressedSizes(productEsm) },
    iife: { path: 'dist/dither-face.js', ...compressedSizes(productIife) },
  }
  const allStylesIncluded = styles.every((style) => bundles.all.includedStyles.includes(style))
  const directExcluded = styles.filter((style) => style !== 'pixel-sprite').every((style) => !bundles.oneDirect.includedStyles.includes(style))
  recorder.check(bundleCase, 'all-renderer ESM includes all eight style modules', allStylesIncluded, styles, bundles.all.includedStyles)
  recorder.check(bundleCase, 'direct one-renderer bundle excludes the other seven styles', directExcluded, styles.filter((style) => style !== 'pixel-sprite'), bundles.oneDirect.includedStyles)
  recorder.check(bundleCase, 'direct one-renderer bundle includes pixel-sprite', bundles.oneDirect.includedStyles.includes('pixel-sprite'), true, bundles.oneDirect.includedStyles)
  recorder.check(bundleCase, 'all-renderer bundle is larger than direct one-renderer bundle', bundles.all.bytes > bundles.oneDirect.bytes, '>', `${bundles.all.bytes} > ${bundles.oneDirect.bytes}`)
  recorder.check(bundleCase, 'all-renderer IIFE product is larger than one-renderer IIFE diagnostic', productIife.length > bundles.oneDirectIife.bytes, '>', `${productIife.length} > ${bundles.oneDirectIife.bytes}`)
  const rootTreeShaken = styles.filter((style) => style !== 'pixel-sprite').every((style) => !bundles.oneRoot.includedStyles.includes(style))
  recorder.check(bundleCase, 'root pixelSprite import excludes unused style code', rootTreeShaken, true, bundles.oneRoot.includedStyles)
  recorder.measure(bundleCase, 'root one-renderer import tree-shaken', rootTreeShaken, 'boolean', { includedStyles: bundles.oneRoot.includedStyles })
  // Verify the product IIFE global actually renders correctly in a VM.
  const vm = await import('node:vm')
  let iifeGlobal = null
  let iifeRender = null
  let iifeError = null
  try {
    const sandbox = {}
    vm.runInNewContext(productIife.toString('utf8'), sandbox)
    iifeGlobal = sandbox.DitherFace
    iifeRender = typeof iifeGlobal?.ditherFace === 'function' ? iifeGlobal.ditherFace('preview-output', { style: 'pixel-sprite', px: 80, name: '7even' }) : null
  } catch (error) {
    iifeError = error.stack || String(error)
  }
  recorder.check(bundleCase, 'product IIFE evaluates without exception', iifeError === null, 'no exception', iifeError)
  recorder.check(bundleCase, 'product IIFE exposes DitherFace.ditherFace', typeof iifeGlobal?.ditherFace === 'function', true, typeof iifeGlobal?.ditherFace)
  recorder.check(bundleCase, 'product IIFE output matches golden', iifeRender !== null && sha256(iifeRender) === golden.styles.find((entry) => entry.slug === 'pixel-sprite').sha256, golden.styles.find((entry) => entry.slug === 'pixel-sprite').sha256, iifeRender ? sha256(iifeRender) : null)
  recorder.finish(bundleCase)
  const sizeSummary = { productSizes, bundles: Object.fromEntries(Object.entries(bundles).map(([name, value]) => [name, {
    entry: value.entry,
    bytes: value.bytes,
    rawBytes: value.rawBytes,
    gzipBytes: value.gzipBytes,
    brotliBytes: value.brotliBytes,
    includedStyles: value.includedStyles,
    includedInputBytes: value.includedInputBytes,
    inputs: value.inputs,
  }])), rootOneRendererTreeShaken: rootTreeShaken }

  // Node soaks.
  const soakSummary = {}
  for (const [nodeTag, node, renders, windowSize, urlCycles] of [
    ['node24', process.execPath, expected.predeclaredMonitoringLimits.soak.node24Renders, expected.predeclaredMonitoringLimits.soak.node24WindowRenders, expected.predeclaredMonitoringLimits.soak.node24UrlCycles],
    ['node22', node22, expected.predeclaredMonitoringLimits.soak.node22Renders, expected.predeclaredMonitoringLimits.soak.node22WindowRenders, expected.predeclaredMonitoringLimits.soak.node22UrlCycles],
  ]) {
    if (nodeTag === 'node22' && !prepare.node22Available) continue
    const result = runNode({
      label: `soak-${nodeTag}`,
      node,
      args: ['--expose-gc', path.join(config.repo, 'scripts/testing/perf-s9-soak.mjs'), '--module', consumerIndex, '--golden', goldenPath, '--renders', String(renders), '--window', String(windowSize), '--urlCycles', String(urlCycles)],
      cwd: config.repo,
      timeoutMs: 420000,
    })
    logCommand(result)
    const record = recorder.case(`library-soak-${nodeTag}`, 'S9-05', `Repeated render and Blob URL soak (${nodeTag})`)
    recorder.check(record, 'soak exit code', commandOk(result), 0, result.exitCode)
    let parsed = null
    try { parsed = JSON.parse(result.stdout.trim()) } catch {}
    recorder.check(record, 'soak emits JSON', parsed !== null, true, result.stdout.slice(-200))
    if (parsed) {
      recorder.check(record, 'fixed hashes match golden before and after soak', parsed.fixedHashesMatch === true, true, parsed.fixedHashesMatch)
      recorder.check(record, 'no invalid SVG output', parsed.invalid === 0, 0, parsed.invalid)
      recorder.check(record, 'all object URLs revoked', parsed.urlAllRevoked === true, true, { created: parsed.urlCreated, revoked: parsed.urlRevoked, live: parsed.liveUrlCount })
      recorder.measure(record, 'URL wrapper active', parsed.urlWrapperActive, 'boolean')
      recorder.measure(record, 'heap growth', mib(parsed.heapGrowthBytes), 'MiB', { renders: parsed.renders, window: parsed.windowSize, monitoringLimitMiB: expected.predeclaredMonitoringLimits.soak.observedHeapGrowthMiB })
      recorder.measure(record, 'RSS growth', mib(parsed.rssGrowthBytes), 'MiB', { monitoringLimitMiB: expected.predeclaredMonitoringLimits.soak.observedRssGrowthMiB })
      recorder.measure(record, 'peak heap used', mib(parsed.peakHeapUsedBytes), 'MiB')
      recorder.measure(record, 'peak RSS', mib(parsed.peakRssBytes), 'MiB')
      soakSummary[nodeTag] = parsed
    }
    recorder.finish(record)
  }

  // Consumer Worker cancellation and retry.
  const cancelResult = runNode({
    label: 'cancel-worker',
    node: process.execPath,
    args: [path.join(config.repo, 'scripts/testing/perf-s9-cancel.mjs'), '--module', consumerIndex, '--golden', goldenPath, '--terminateMaxMs', String(expected.predeclaredMonitoringLimits.resilience.workerTerminateMaxMs)],
    cwd: config.repo,
    timeoutMs: 90000,
  })
  logCommand(cancelResult)
  const cancelCase = recorder.case('library-cancel-worker', 'S9-07', 'Consumer Worker termination and retry')
  recorder.check(cancelCase, 'cancellation probe exit code', commandOk(cancelResult), 0, cancelResult.exitCode)
  let cancelParsed = null
  try { cancelParsed = JSON.parse(cancelResult.stdout.trim()) } catch {}
  recorder.check(cancelCase, 'cancellation probe emits JSON', cancelParsed !== null, true, cancelResult.stdout.slice(-200))
  if (cancelParsed) {
    recorder.check(cancelCase, 'main-thread golden output after cancellation', cancelParsed.mainMatchesGolden === true, true, cancelParsed.mainSha256)
    recorder.check(cancelCase, 'unbounded worker had already imported and rendered golden', cancelParsed.longWorkerReadyMatchesGolden === true, true, cancelParsed.longWorkerReadySha256)
    recorder.check(cancelCase, 'worker terminated within predeclared limit', cancelParsed.terminateWithinLimit === true, `<=${expected.predeclaredMonitoringLimits.resilience.workerTerminateMaxMs}ms`, `${cancelParsed.terminateMs}ms`)
    recorder.check(cancelCase, 'fresh worker retry matches golden', cancelParsed.shortWorkerMatchesGolden === true, true, cancelParsed.shortWorkerSha256)
    recorder.check(cancelCase, 'retry completed within predeclared limit', cancelParsed.retryWithinLimit === true, '<=5000ms', `${cancelParsed.shortRetryMs}ms`)
    recorder.measure(cancelCase, 'worker termination time', cancelParsed.terminateMs, 'ms', { limitMs: expected.predeclaredMonitoringLimits.resilience.workerTerminateMaxMs })
    recorder.measure(cancelCase, 'retry time', cancelParsed.shortRetryMs, 'ms', { limitMs: expected.predeclaredMonitoringLimits.resilience.retrySuccessMaxMs })
  }
  recorder.finish(cancelCase)

  // Fatal OOM limitation probe.
  const oomResult = runNode({
    label: 'oom-probe',
    node: process.execPath,
    args: ['--max-old-space-size=32', path.join(config.repo, 'scripts/testing/perf-s9-oom.mjs')],
    cwd: config.repo,
    timeoutMs: 30000,
  })
  logCommand(oomResult)
  const oomCase = recorder.case('library-fatal-oom-probe', 'S9-07', 'Fatal V8 OOM limitation probe')
  const oomText = `${oomResult.stdout}\n${oomResult.stderr}`
  const oomFatal = oomResult.exitCode !== 0 && /heap out of memory|JavaScript heap out of memory|Reached heap limit/i.test(oomText)
  recorder.check(oomCase, 'fatal low-heap probe exits non-zero', oomResult.exitCode !== 0 || oomResult.signal !== null, 'non-zero/signal', { exitCode: oomResult.exitCode, signal: oomResult.signal })
  recorder.check(oomCase, 'V8 fatal OOM diagnostic observed', oomFatal, 'heap limit diagnostic', oomText.slice(-500))
  recorder.measure(oomCase, 'fatal OOM probe', 'not caught by library', 'observation', { exitCode: oomResult.exitCode, signal: oomResult.signal })
  recorder.finish(oomCase)

  // Negative controls.
  const altered = await readJson(path.join(config.fixtures, 'fixtures', 'altered-golden.json'))
  const controlCase = recorder.case('library-negative-controls', 'NEGATIVE', 'Altered golden, slow-cap and clean positive controls')
  const cleanComparison = compareGolden(golden, actualStyles)
  const alteredComparison = compareGolden(altered, actualStyles)
  recorder.check(controlCase, 'clean golden positive accepted', cleanComparison.ok === true, true, cleanComparison.ok)
  recorder.check(controlCase, 'altered golden rejected', alteredComparison.ok === false, false, alteredComparison.ok)
  recorder.check(controlCase, 'altered golden reports pixel-sprite mismatch', alteredComparison.mismatches.some((entry) => entry.style === 'pixel-sprite'), 'pixel-sprite', alteredComparison.mismatches)
  const { slowWork } = await import(pathToFileURL(path.join(config.fixtures, 'fixtures', 'slow-work.mjs')).href)
  const slowCap = runWithCap(() => slowWork(expected.predeclaredMonitoringLimits.negativeControlSlowWork.workMs), expected.predeclaredMonitoringLimits.negativeControlSlowWork.capMs)
  const fastCap = runWithCap(() => slowWork(expected.predeclaredMonitoringLimits.negativeControlSlowWork.cleanWorkMs), expected.predeclaredMonitoringLimits.negativeControlSlowWork.capMs)
  recorder.check(controlCase, 'known slow work rejected by same cap detector', slowCap.ok === false, false, { elapsedMs: slowCap.elapsedMs, capMs: slowCap.capMs })
  recorder.check(controlCase, 'fast work accepted by same cap detector', fastCap.ok === true, true, { elapsedMs: fastCap.elapsedMs, capMs: fastCap.capMs })
  recorder.measure(controlCase, 'slow fixture elapsed', slowCap.elapsedMs, 'ms', { capMs: slowCap.capMs })
  recorder.measure(controlCase, 'fast fixture elapsed', fastCap.elapsedMs, 'ms', { capMs: fastCap.capMs })
  recorder.finish(controlCase)

  const library = {
    golden: actualStyles,
    goldenComparison,
    sourceParityMismatches: parityMismatches,
    exports: actualExports,
    importSummary,
    sizeSummary,
    soak: soakSummary,
    cancellation: cancelParsed,
    oom: { exitCode: oomResult.exitCode, signal: oomResult.signal, fatal: oomFatal, text: oomText.slice(-1000) },
    negativeControls: {
      alteredGoldenRejected: alteredComparison.ok === false,
      slowCapRejected: slowCap.ok === false,
      fastCapAccepted: fastCap.ok === true,
      slowCapElapsedMs: slowCap.elapsedMs,
      fastCapElapsedMs: fastCap.elapsedMs,
    },
    completedAt: new Date().toISOString(),
  }
  await writeJson(path.join(outRoot, 'library', 'library.json'), library)
  await writePhase(recorder, 'library', { library })
  return library
}

async function benchPhase(nodeFilter) {
  const recorder = new Recorder({ stage: 'S9', track: 'library-performance', phase: `bench-${nodeFilter}` })
  const prepare = await readJson(path.join(outRoot, 'prepare', 'prepare.json'))
  const node = nodeFilter === 'node22' ? node22 : process.execPath
  if (nodeFilter === 'node22' && !prepare.node22Available) {
    const record = recorder.case('bench-node22-unavailable', 'S9-01', 'Node 22 benchmark matrix')
    recorder.check(record, 'Node 22 available', false, true, false)
    recorder.finish(record, 'blocked')
    await writePhase(recorder, `bench-${nodeFilter}`, { cells: [] })
    return
  }
  const matrices = [
    { packageTag: 'tarball', modulePath: consumerIndex },
    { packageTag: 'source', modulePath: sourceIndex },
  ]
  const reps = { 1: 10, 100: 5, 1000: 2 }
  const cells = []
  const rawDir = path.join(outRoot, `bench-${nodeFilter}`, 'raw')
  await ensureDir(rawDir)
  for (const matrix of matrices) {
    for (const style of styles) {
      for (const batch of [1, 100, 1000]) {
        const id = `bench-${nodeFilter}-${matrix.packageTag}-${style}-b${batch}`
        const record = recorder.case(id, batch === 1 ? 'S9-01' : batch === 100 ? 'S9-02' : 'S9-03', `${style} batch ${batch} (${nodeFilter}/${matrix.packageTag})`, { node: nodeFilter, package: matrix.packageTag, style, batch })
        const result = runNode({
          label: id,
          node,
          args: [
            '--expose-gc',
            path.join(config.repo, 'scripts/testing/perf-s9-bench.mjs'),
            '--module', matrix.modulePath,
            '--style', style,
            '--batch', String(batch),
            '--warmup', '30',
            '--reps', String(reps[batch]),
            '--px', '80',
            '--name', 'Ada',
            '--seedPrefix', 's9-bench',
          ],
          cwd: config.repo,
          timeoutMs: 300000,
        })
        logCommand(result)
        const rawFile = path.join(rawDir, `${matrix.packageTag}-${style}-b${batch}.json`)
        await fsp.writeFile(rawFile, `${result.stdout}\n--- stderr ---\n${result.stderr}\n`)
        recorder.check(record, 'benchmark child exit code', commandOk(result), 0, result.exitCode)
        let parsed = null
        try { parsed = JSON.parse(result.stdout.trim()) } catch {}
        recorder.check(record, 'benchmark child emits JSON', parsed !== null, true, result.stdout.slice(-200))
        if (parsed) {
          const expectedMajor = nodeFilter === 'node22' ? 'v22.' : 'v24.'
          recorder.check(record, 'runtime major version', parsed.node.startsWith(expectedMajor), expectedMajor, parsed.node)
          recorder.check(record, 'fixed input matches golden', parsed.fixedGoldenSha256 === golden.styles.find((entry) => entry.slug === style).sha256, golden.styles.find((entry) => entry.slug === style).sha256, parsed.fixedGoldenSha256)
          recorder.check(record, 'sample count', parsed.samples.length === reps[batch], reps[batch], parsed.samples.length)
          recorder.check(record, 'no invalid SVG output', parsed.samples.every((sample) => sample.invalidCount === 0), 0, parsed.samples.map((sample) => sample.invalidCount))
          recorder.check(record, 'all SVG output non-empty', parsed.samples.every((sample) => sample.svgBytesMin > 0 && sample.svgBytesTotal > 0), '>0', parsed.samples.map((sample) => sample.svgBytesPerRender))
          recorder.check(record, 'wall and CPU times finite and positive', parsed.samples.every((sample) => Number.isFinite(sample.wallMs) && sample.wallMs > 0 && Number.isFinite(sample.cpuTotalMs) && sample.cpuTotalMs >= 0), 'finite positive', parsed.samples.map((sample) => ({ wallMs: sample.wallMs, cpuTotalMs: sample.cpuTotalMs })))
          recorder.check(record, 'repeated samples are deterministic', new Set(parsed.samples.map((sample) => sample.aggregateSha256)).size === 1, 1, new Set(parsed.samples.map((sample) => sample.aggregateSha256)).size)
          const medians = {
            wallMs: median(parsed.samples.map((sample) => sample.wallMs)),
            perRenderMs: median(parsed.samples.map((sample) => sample.perRenderMs)),
            cpuTotalMs: median(parsed.samples.map((sample) => sample.cpuTotalMs)),
            cpuPerRenderMs: median(parsed.samples.map((sample) => sample.cpuPerRenderMs)),
            svgBytesPerRender: median(parsed.samples.map((sample) => sample.svgBytesPerRender)),
            rssDeltaBytes: median(parsed.samples.map((sample) => sample.rssDeltaBytes)),
            heapUsedDeltaBytes: median(parsed.samples.map((sample) => sample.heapUsedDeltaBytes)),
            rssAfterBytes: median(parsed.samples.map((sample) => sample.rssAfterBytes)),
            heapUsedAfterBytes: median(parsed.samples.map((sample) => sample.heapUsedAfterBytes)),
          }
          recorder.measure(record, 'wall ms median', medians.wallMs, 'ms', { batch, samples: parsed.samples.length })
          recorder.measure(record, 'per-render ms median', medians.perRenderMs, 'ms')
          recorder.measure(record, 'CPU ms median', medians.cpuTotalMs, 'ms')
          recorder.measure(record, 'CPU per render ms median', medians.cpuPerRenderMs, 'ms')
          recorder.measure(record, 'SVG bytes per render median', medians.svgBytesPerRender, 'bytes')
          recorder.measure(record, 'RSS after median', mib(medians.rssAfterBytes), 'MiB')
          recorder.measure(record, 'heap used after median', mib(medians.heapUsedAfterBytes), 'MiB')
          recorder.measure(record, 'RSS delta median', mib(medians.rssDeltaBytes), 'MiB')
          recorder.measure(record, 'heap delta median', mib(medians.heapUsedDeltaBytes), 'MiB')
          cells.push({
            id,
            node: nodeFilter,
            package: matrix.packageTag,
            style,
            batch,
            warmup: parsed.warmupRenders,
            repetitions: parsed.repetitions,
            importMs: parsed.importMs,
            fixedGoldenSha256: parsed.fixedGoldenSha256,
            medians,
            samples: parsed.samples.map(({ aggregateSha256, wallMs, perRenderMs, cpuTotalMs, cpuPerRenderMs, svgBytesPerRender, rssDeltaBytes, heapUsedDeltaBytes, rssAfterBytes, heapUsedAfterBytes }) => ({ aggregateSha256, wallMs, perRenderMs, cpuTotalMs, cpuPerRenderMs, svgBytesPerRender, rssDeltaBytes, heapUsedDeltaBytes, rssAfterBytes, heapUsedAfterBytes })),
          })
        }
        recorder.finish(record)
      }
    }
  }
  const bench = { nodeFilter, cells, completedAt: new Date().toISOString() }
  await writeJson(path.join(outRoot, `bench-${nodeFilter}`, 'bench.json'), bench)
  await writePhase(recorder, `bench-${nodeFilter}`, { bench })
  return bench
}

async function playgroundPhase() {
  const recorder = new Recorder({ stage: 'S9', track: 'library-performance', phase: 'playground' })
  await ensureDir(path.join(outRoot, 'playground'))
  const prepare = await readJson(path.join(outRoot, 'prepare', 'prepare.json'))
  const tarballModule = await import(pathToFileURL(consumerIndex).href)
  process.env.PLAYWRIGHT_BROWSERS_PATH = config.pwBrowsers
  const tools = requireTools()
  const playground = await runPlayground({
    config,
    expected,
    golden,
    prepare,
    recorder,
    module: tarballModule,
    tools,
  })
  await writeJson(path.join(outRoot, 'playground', 'playground.json'), playground)
  await writePhase(recorder, 'playground', { playground })
  return playground
}

async function finalizePhase() {
  const recorder = new Recorder({ stage: 'S9', track: 'library-performance', phase: 'finalize' })
  const prepare = await readJson(path.join(outRoot, 'prepare', 'prepare.json'))
  const library = await readJson(path.join(outRoot, 'library', 'library.json'))
  const benchDirs = ['bench-node24', 'bench-node22'].filter((name) => fs.existsSync(path.join(outRoot, name, 'bench.json')))
  const benches = benchDirs.map((name) => JSON.parse(fs.readFileSync(path.join(outRoot, name, 'bench.json'), 'utf8')))
  const playground = fs.existsSync(path.join(outRoot, 'playground', 'playground.json')) ? await readJson(path.join(outRoot, 'playground', 'playground.json')) : null

  const cells = benches.flatMap((bench) => bench.cells)
  const parity = []
  for (const style of styles) {
    for (const batch of [1, 100, 1000]) {
      const selection = cells.filter((cell) => cell.style === style && cell.batch === batch)
      const hashes = new Set(selection.map((cell) => cell.samples[0]?.aggregateSha256))
      const record = recorder.case(`finalize-parity-${style}-b${batch}`, batch === 1 ? 'S9-01' : batch === 100 ? 'S9-02' : 'S9-03', `Cross-runtime/package digest parity ${style} batch ${batch}`, { style, batch })
      recorder.check(record, 'one distinct aggregate digest across every matrix cell', hashes.size === 1, 1, hashes.size)
      recorder.check(record, 'all four matrix cells present', selection.length === 4, 4, selection.length)
      recorder.finish(record)
      parity.push({ style, batch, cells: selection.length, distinctHashes: hashes.size })
    }
  }

  const benchSummary = cells.map((cell) => ({
    node: cell.node,
    package: cell.package,
    style: cell.style,
    batch: cell.batch,
    repetitions: cell.repetitions,
    wallMsMedian: cell.medians.wallMs,
    perRenderMsMedian: cell.medians.perRenderMs,
    cpuTotalMsMedian: cell.medians.cpuTotalMs,
    cpuPerRenderMsMedian: cell.medians.cpuPerRenderMs,
    svgBytesPerRender: cell.medians.svgBytesPerRender,
    rssAfterMiB: mib(cell.medians.rssAfterBytes),
    heapUsedAfterMiB: mib(cell.medians.heapUsedAfterBytes),
    rssDeltaMiB: mib(cell.medians.rssDeltaBytes),
    heapDeltaMiB: mib(cell.medians.heapUsedDeltaBytes),
  }))

  const groupSummary = []
  for (const node of ['node24', 'node22']) {
    for (const packageTag of ['tarball', 'source']) {
      for (const batch of [1, 100, 1000]) {
        const selection = benchSummary.filter((entry) => entry.node === node && entry.package === packageTag && entry.batch === batch)
        if (selection.length !== 8) continue
        groupSummary.push({
          node,
          package: packageTag,
          batch,
          styles: selection.length,
          perRenderMsMedianAcrossStyles: median(selection.map((entry) => entry.perRenderMsMedian)),
          perRenderMsMin: Math.min(...selection.map((entry) => entry.perRenderMsMedian)),
          perRenderMsMax: Math.max(...selection.map((entry) => entry.perRenderMsMedian)),
          cpuPerRenderMsMedianAcrossStyles: median(selection.map((entry) => entry.cpuPerRenderMsMedian)),
          svgBytesPerRenderMin: Math.min(...selection.map((entry) => entry.svgBytesPerRender)),
          svgBytesPerRenderMax: Math.max(...selection.map((entry) => entry.svgBytesPerRender)),
          rssAfterMiBMax: Math.max(...selection.map((entry) => entry.rssAfterMiB)),
          heapUsedAfterMiBMax: Math.max(...selection.map((entry) => entry.heapUsedAfterMiB)),
        })
      }
    }
  }

  const processCheck = runCommand({
    label: 'final-process-check',
    command: "ps -eo pid,comm,args | grep -E 'chrome|chromium|playwright|serve-site|http.server' | grep -v grep || true; (ss -ltnp 2>/dev/null || true); node -e \"fetch('http://127.0.0.1:4173/').then(()=>{console.log('port4173=open');process.exit(2)}).catch(()=>console.log('port4173=closed'))\"",
    cwd: config.repo,
    timeoutMs: 60000,
  })
  logCommand(processCheck)
  const finalize = {
    commit: config.runCommit,
    baseProductCommit: config.baseCommit,
    sandbox: config.sandbox,
    image: config.image,
    region: config.region,
    memory: config.memory,
    tarball: prepare.tarball,
    versions: prepare.versions,
    parity,
    benchSummary,
    groupSummary,
    processCheck: { exitCode: processCheck.exitCode, stdout: processCheck.stdout, stderr: processCheck.stderr },
    completedAt: new Date().toISOString(),
  }
  await writeJson(path.join(outRoot, 'finalize', 'finalize.json'), finalize)

  // Aggregate counts from all phase results, plus the parity cases in this phase.
  const phaseFiles = ['prepare', 'library', 'bench-node24', 'bench-node22', 'playground'].map((name) => path.join(outRoot, name, 'results.json')).filter((file) => fs.existsSync(file))
  const phases = phaseFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
  const finalSummary = recorder.summary()
  const aggregate = {
    stage: 'S9',
    track: 'library-performance',
    commit: config.runCommit,
    baseProductCommit: config.baseCommit,
    tarballSha256: prepare.tarball.sha256,
    sourceManifestSha256: config.sourceManifestSha,
    expectedSha256: config.expectedSha,
    sandbox: config.sandbox,
    phases: phases.map((entry) => ({ phase: entry.phase, cases: entry.cases, assertions: entry.assertions, failedAssertions: entry.failedAssertions, byScenario: entry.byScenario })),
    finalize: { cases: finalSummary.cases, assertions: finalSummary.assertions, failedAssertions: finalSummary.failedAssertions, byScenario: finalSummary.byScenario },
    totals: {
      cases: phases.reduce((sum, entry) => sum + entry.cases, 0) + finalSummary.cases,
      assertions: phases.reduce((sum, entry) => sum + entry.assertions, 0) + finalSummary.assertions,
      failedAssertions: phases.reduce((sum, entry) => sum + entry.failedAssertions, 0) + finalSummary.failedAssertions,
    },
    statuses: {
      'S9-01': 'BASELINE — measured, no agreed budget; parent decision needed',
      'S9-02': 'BASELINE — measured, no agreed budget; parent decision needed',
      'S9-03': 'BASELINE — measured, no agreed budget; parent decision needed',
      'S9-04': 'PASS — functional size/tree-shaking assertions only; no size budget claimed',
      'S9-05': 'PASS+BASELINE — revocation/cleanup PASS; growth baseline pending parent decision',
      'S9-06': 'BASELINE — correctness PASS under throttle; no agreed responsiveness budget',
      'S9-07': 'PASS — functional resilience only; no fatal-OOM claim',
      NEGATIVE: 'PASS — all controls detected',
    },
    limitations: [
      'No parent-agreed numeric performance budget exists; S9-01/02/03 and S9-06 responsiveness are baseline measurements, not PASS against an invented threshold.',
      'Single sandbox CPU/memory class; absolute times are not portable to other hosts.',
      'Throttled interaction used one pinned Linux Chromium only, not other browsers or physical devices.',
      'Node coverage is Node 24.22.2 and Node 22.23.4 only.',
      'Fatal V8 OOM is not caught by the library; the low-heap probe records a process-level fatal failure, not graceful recovery.',
      'Object-URL and heap observations are bounded application-level samples; they do not prove absence of all leaks or engine-level resource exhaustion.',
      'No native Safari/macOS, no screen reader, no real network and no publication/deployment were exercised in this track.',
    ],
    completedAt: new Date().toISOString(),
  }
  await writeJson(path.join(outRoot, 'summary.json'), aggregate)
  await writeJson(path.join(outRoot, 'bench-summary.json'), { groupSummary, benchSummary, parity })

  const manifestFiles = (await walkFiles(outRoot)).filter((entry) => entry.type === 'file' && entry.path !== 'manifest.json')
  const manifest = {
    generatedAt: new Date().toISOString(),
    runId: config.runId,
    sandbox: config.sandbox,
    commit: config.runCommit,
    baseProductCommit: config.baseCommit,
    fileCount: manifestFiles.length,
    totalBytes: manifestFiles.reduce((sum, entry) => sum + entry.size, 0),
    files: manifestFiles.map((entry) => ({ path: entry.path, size: entry.size, sha256: entry.sha256 })).sort((a, b) => a.path.localeCompare(b.path)),
  }
  manifest.sha256 = sha256(manifest.files.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n'))
  await writeJson(path.join(outRoot, 'manifest.json'), manifest)
  return aggregate
}

switch (phase) {
  case 'prepare':
    await preparePhase()
    break
  case 'library':
    await libraryPhase()
    break
  case 'bench':
    if (!args['node-filter']) throw new Error('bench phase requires --node-filter')
    await benchPhase(args['node-filter'])
    break
  case 'playground':
    await playgroundPhase()
    break
  case 'finalize':
    await finalizePhase()
    break
  default:
    throw new Error(`Unknown phase: ${phase}`)
}
