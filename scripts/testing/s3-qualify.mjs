#!/usr/bin/env node
/**
 * Stage 3 release-qualification harness: packaging, prepack, exports, types,
 * zero runtime dependencies and npm/pnpm/Yarn consumers (matrix S3-01..S3-08).
 *
 * Runs only in the dedicated Blaxel sandbox against the uploaded tracked source
 * and the real packed tarball. Every assertion is counted; failures and
 * limitations are written to results JSON and command logs. No scenario is
 * skipped silently and no source/package fix is performed here.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  checkCjsObservation,
  checkExportProbe,
  checkPackageMetadata,
  checkTarballManifest,
  checkTypeScriptRun,
  deepEqual,
  ensureEmptyDirectory,
  hashTree,
  inspectTarball,
  parsePackJson,
  runCommand,
  sha256,
  walkFiles,
} from './s3-lib.mjs'

const IDS = ['S3-01', 'S3-02', 'S3-03', 'S3-04', 'S3-05', 'S3-06', 'S3-07', 'S3-08']
const TITLES = {
  'S3-01': 'Tarball manifest',
  'S3-02': 'Prepack lifecycle and reproducibility',
  'S3-03': 'Actual tarball install and render',
  'S3-04': 'Zero runtime dependencies',
  'S3-05': 'Exports and type resolution',
  'S3-06': 'Strict declarations and TypeScript versions',
  'S3-07': 'npm/pnpm/Yarn consumers',
  'S3-08': 'Manifest truth',
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key?.startsWith('--') || i + 1 >= argv.length) throw new Error(`bad argument: ${key}`)
    out[key.slice(2)] = argv[i + 1]
  }
  for (const required of [
    'repo', 'out', 'fixtures', 'expected', 'source-manifest', 'commit', 'sandbox',
    'image', 'work', 'tarball-name', 'npm-version', 'pnpm-version', 'yarn-version',
    'ts-current', 'ts-prior', 'node22', 'node24',
  ]) {
    if (!out[required]) throw new Error(`missing --${required}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const repoDir = path.resolve(args.repo)
const outDir = path.resolve(args.out)
const fixturesDir = path.resolve(args.fixtures)
const workDir = path.resolve(args.work)
const sourceManifestPath = path.resolve(args['source-manifest'])
const expected = JSON.parse(fs.readFileSync(path.resolve(args.expected), 'utf8'))
const allowlist = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'tarball-allowlist.json'), 'utf8'))
const golden = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'fixtures', 'golden.json'), 'utf8'))
const expectedExports = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'expected-exports.json'), 'utf8'))
const tarballName = args['tarball-name']
const logsDir = path.join(outDir, 'logs')
const perScenarioDir = path.join(outDir, 'results')
const archive1Dir = path.join(workDir, 'archive-pack1')
const archive2Dir = path.join(workDir, 'archive-pack2')
const startedAt = new Date().toISOString()
const commands = []
const negativeControls = []
let currentScenario = null

await fsp.mkdir(logsDir, { recursive: true })
await fsp.mkdir(perScenarioDir, { recursive: true })
await fsp.mkdir(workDir, { recursive: true })

const results = {
  stage: 'S3',
  title: 'Packaging and consumers',
  startedAt,
  commit: args.commit,
  sandbox: args.sandbox,
  image: args.image,
  productBaseline: 'a9685b7',
  expectedTarball: expected.expectedTarball,
  scenarios: Object.fromEntries(IDS.map((id) => [id, {
    id,
    title: TITLES[id],
    expectedStatus: expected.expectations[id]?.expectedStatus ?? 'PASS',
    actualStatus: null,
    cases: 0,
    assertions: 0,
    failures: 0,
    checks: [],
    notes: [],
    severityIfFailed: null,
  }])),
  totals: { scenarios: 0, pass: 0, fail: 0, blocked: 0, cases: 0, assertions: 0, failures: 0 },
  negativeControls: [],
  commands: [],
  probes: {},
  artifacts: {},
  limitations: [],
}

function scenario(id) {
  if (!results.scenarios[id]) throw new Error(`unknown scenario ${id}`)
  currentScenario = id
  return results.scenarios[id]
}

function assert(id, condition, message, detail = null) {
  const entry = results.scenarios[id]
  if (!entry) throw new Error(`unknown scenario ${id}`)
  entry.assertions += 1
  const check = { name: message, ok: Boolean(condition), detail }
  entry.checks.push(check)
  if (!condition) {
    entry.failures += 1
    entry.severityIfFailed = expected.expectations[id]?.severity ?? 'S1'
  }
  return check
}

function addCase(id, count = 1) {
  results.scenarios[id].cases += count
}

function note(id, message) {
  results.scenarios[id].notes.push(message)
}

function recordNegativeControl(name, detail) {
  negativeControls.push({ name, ...detail })
  results.negativeControls = negativeControls
}

function finalize(id) {
  const entry = results.scenarios[id]
  entry.actualStatus = entry.failures === 0 ? 'PASS' : 'FAIL'
  entry.completedAt = new Date().toISOString()
  currentScenario = null
  return entry
}

function recordCommand(id, result, extra = {}) {
  const record = {
    scenario: id,
    label: result.label,
    command: result.command,
    cwd: result.cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    log: result.logPath ? path.relative(outDir, result.logPath) : null,
    ...extra,
  }
  commands.push(record)
  results.commands = commands
  return record
}

async function run(id, label, command, cwd, env = {}, timeout = 600000) {
  const result = await runCommand({ label, command, cwd, env, timeout, logDir: logsDir })
  recordCommand(id, result)
  return result
}

function parseJsonText(raw) {
  for (let i = raw.lastIndexOf('{'); i >= 0; i = raw.lastIndexOf('{', i - 1)) {
    try {
      return JSON.parse(raw.slice(i))
    } catch {
      // Keep looking for the final JSON object.
    }
  }
  return null
}

function sh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function addChecks(id, result) {
  for (const check of result.checks) assert(id, check.ok, check.name, check.detail)
  return result
}

function relativeRepo(file) {
  return path.relative(repoDir, file).split(path.sep).join('/')
}

function outsideRepo(target) {
  const relative = path.relative(repoDir, path.resolve(target))
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
}

const versions = {}
let sourceManifest = null
let packageJson = null
let packageLock = null
let pack1 = null
let pack2 = null
let inspection1 = null
let inspection2 = null
let dryRunManifest = null
let canonical = null
let render24 = null
let render22 = null
let importProbe24 = null
let importProbe22 = null
let tsResults = {}
let pmResults = {}

async function verifyPrelude() {
  const pre = await run('S3-02', 'preflight', 'node --version && npm --version && uname -a && cat /etc/os-release && tar --version', repoDir, {}, 120)
  assert('S3-02', pre.exitCode === 0, 'sandbox preflight exits 0', { exitCode: pre.exitCode })
  const npmVersion = await run('S3-02', 'npm-version-pinned', `npx -y npm@${args['npm-version']} --version`, repoDir, {}, 300)
  const pnpmVersion = await run('S3-02', 'pnpm-version-pinned', `npx -y pnpm@${args['pnpm-version']} --version`, repoDir, {}, 300)
  const yarnVersion = await run('S3-02', 'yarn-version-pinned', `npx -y -p @yarnpkg/cli-dist@${args['yarn-version']} yarn --version`, repoDir, {}, 300)
  const node24Version = await run('S3-02', 'node24-version-pinned', `npx -y node@${args.node24} --version`, repoDir, {}, 300)
  const node22Version = await run('S3-02', 'node22-version-pinned', `npx -y node@${args.node22} --version`, repoDir, {}, 300)
  versions.npm = npmVersion.stdout.trim().split('\n').filter(Boolean).at(-1)
  versions.pnpm = pnpmVersion.stdout.trim().split('\n').filter(Boolean).at(-1)
  versions.yarn = yarnVersion.stdout.trim().split('\n').filter(Boolean).at(-1)
  versions.node24 = node24Version.stdout.trim().split('\n').filter(Boolean).at(-1)
  versions.node22 = node22Version.stdout.trim().split('\n').filter(Boolean).at(-1)
  versions.systemNode = (await run('S3-02', 'system-node', 'node --version', repoDir, {}, 120)).stdout.trim()
  assert('S3-02', versions.npm === args['npm-version'], 'pinned npm version is available', { actual: versions.npm, expected: args['npm-version'] })
  assert('S3-02', versions.pnpm === args['pnpm-version'], 'pinned pnpm version is available', { actual: versions.pnpm, expected: args['pnpm-version'] })
  assert('S3-02', versions.yarn === args['yarn-version'], 'pinned Yarn version is available', { actual: versions.yarn, expected: args['yarn-version'] })
  assert('S3-02', versions.node24.endsWith(args.node24), 'pinned Node 24 runtime is available', { actual: versions.node24, expected: args.node24 })
  assert('S3-02', versions.node22.endsWith(args.node22), 'pinned Node 22 runtime is available', { actual: versions.node22, expected: args.node22 })

  sourceManifest = readJson(sourceManifestPath)
  assert('S3-02', sourceManifest.commit === args.commit, 'uploaded source manifest commit equals harness commit', { manifest: sourceManifest.commit, harness: args.commit })
  const manifestFailures = []
  for (const file of sourceManifest.files ?? []) {
    const absolute = path.join(repoDir, file.path)
    try {
      const bytes = await fsp.readFile(absolute)
      if (sha256(bytes) !== file.sha256 || bytes.length !== file.size) {
        manifestFailures.push({ path: file.path, expected: file.sha256, actual: sha256(bytes) })
      }
    } catch (error) {
      manifestFailures.push({ path: file.path, error: error.message })
    }
  }
  assert('S3-02', manifestFailures.length === 0, 'every uploaded tracked file matches the source manifest', manifestFailures.slice(0, 10))
  assert('S3-02', sourceManifest.files?.length === (sourceManifest.fileCount ?? -1), 'source manifest file count agrees', { count: sourceManifest.files?.length, declared: sourceManifest.fileCount })

  const goldenSha = sha256(await fsp.readFile(path.join(fixturesDir, 'fixtures', 'golden.json')))
  const allowlistSha = sha256(await fsp.readFile(path.join(fixturesDir, 'tarball-allowlist.json')))
  assert('S3-02', goldenSha === expected.fixedArtifacts.golden.sha256AtCreation, 'golden fixture file hash equals expected-before-run record', { actual: goldenSha, expected: expected.fixedArtifacts.golden.sha256AtCreation })
  assert('S3-02', allowlistSha === expected.fixedArtifacts.allowlist.sha256AtCreation, 'allowlist file hash equals expected-before-run record', { actual: allowlistSha, expected: expected.fixedArtifacts.allowlist.sha256AtCreation })
  assert('S3-02', golden.styles.length === 8 && new Set(golden.styles.map((entry) => entry.slug)).size === 8, 'golden fixture contains eight distinct styles', golden.styles.map((entry) => entry.slug))
  assert('S3-02', golden.styles.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)), 'every golden fixture hash is SHA-256 shaped', golden.styles)

  packageJson = readJson(path.join(repoDir, 'package.json'))
  packageLock = readJson(path.join(repoDir, 'package-lock.json'))
  assert('S3-02', packageJson.name === allowlist.package && packageJson.version === allowlist.version, 'reviewed package name/version equal allowlist', { name: packageJson.name, version: packageJson.version })
  assert('S3-02', packageLock.packages?.['']?.version === packageJson.version, 'repository lock version equals package version', { lock: packageLock.packages?.['']?.version, pkg: packageJson.version })
  assert('S3-02', packageJson.repository?.url?.includes('dither-face'), 'repository metadata identifies this package', packageJson.repository)
}

async function runPackScenario() {
  const id = 'S3-02'
  const entry = scenario(id)
  addCase(id, 5)
  const distDir = path.join(repoDir, 'dist')
  const poisonFiles = [
    path.join(distDir, 'STAGE3_STALE_POISON.js'),
    path.join(distDir, 'stale-dir', 'STAGE3_STALE_POISON.js.map'),
  ]
  for (const poison of poisonFiles) {
    await fsp.mkdir(path.dirname(poison), { recursive: true })
    await fsp.writeFile(poison, '// stale disposable Stage 3 poison; clean:dist must remove this\n')
  }
  const preDist = await hashTree(distDir)
  assert(id, (await fsp.stat(poisonFiles[0])).isFile(), 'planted stale dist poison exists before pack #1', { poisonFiles: poisonFiles.map(relativeRepo) })

  const pack1Dir = path.join(workDir, 'pack1')
  await ensureEmptyDirectory(pack1Dir)
  const p1 = await run(id, 'pack1', `npx -y npm@${args['npm-version']} pack --json --pack-destination ${sh(pack1Dir)}`, repoDir, {}, 600000)
  const manifest1 = parsePackJson(p1.raw)
  assert(id, p1.exitCode === 0, 'real npm pack #1 exits 0', { exitCode: p1.exitCode, stderr: p1.stderr.slice(-2000) })
  assert(id, Array.isArray(manifest1) && manifest1.length === 1, 'npm pack #1 emits one JSON manifest entry', manifest1?.[0] ?? null)
  pack1 = {
    dir: pack1Dir,
    file: path.join(pack1Dir, manifest1?.[0]?.filename ?? tarballName),
    manifest: manifest1?.[0] ?? null,
    result: p1,
  }
  assert(id, fs.existsSync(pack1.file), 'pack #1 tarball exists', pack1.file)
  const distAfter1 = await hashTree(distDir)
  assert(id, !fs.existsSync(poisonFiles[0]) && !fs.existsSync(poisonFiles[1]), 'clean:dist removed planted stale files before packing', { poisonFiles })
  assert(id, distAfter1.files.length === 29, 'build produced the expected 29 dist files', { count: distAfter1.files.length })
  assert(id, !distAfter1.files.some((file) => /STAGE3_STALE_POISON/.test(file.path)), 'rebuilt dist contains no poison file', distAfter1.files.map((file) => file.path))

  const lifecycle = [
    ['prepack lifecycle invoked', '> dither-face@0.1.0 prepack'],
    ['clean:dist script invoked', '> dither-face@0.1.0 clean:dist'],
    ['check script invoked', '> dither-face@0.1.0 check'],
    ['typecheck script invoked', '> dither-face@0.1.0 typecheck'],
    ['unit test script invoked', '> dither-face@0.1.0 test'],
    ['build script invoked', '> dither-face@0.1.0 build'],
    ['build:web script invoked', '> dither-face@0.1.0 build:web'],
  ]
  for (const [name, marker] of lifecycle) assert(id, p1.raw.includes(marker), name, { marker })
  const testsPassed = p1.raw.match(/Tests\s+(\d+)\s+passed/)
  const testsFailed = p1.raw.match(/Tests\s+(\d+)\s+failed/)
  assert(id, Boolean(testsPassed) && Number(testsPassed[1]) > 0, 'prepack unit suite reports passing tests', testsPassed?.[1] ?? null)
  assert(id, !testsFailed || Number(testsFailed[1]) === 0, 'prepack unit suite reports zero failed tests', testsFailed?.[1] ?? null)
  assert(id, /Test Files\s+\d+\s+passed/.test(p1.raw), 'prepack unit suite reports passed test files', p1.raw.match(/Test Files\s+\d+\s+passed/)?.[0] ?? null)
  assert(id, p1.raw.includes('dist/dither-face.js') || fs.existsSync(path.join(repoDir, 'dist/dither-face.js')), 'build:web produced the IIFE bundle', null)

  inspection1 = await inspectTarball(pack1.file, archive1Dir)
  assert(id, inspection1.rawSha256 === expected.expectedTarball.sha256, 'pack #1 tarball SHA-256 equals expected unchanged product tarball', { actual: inspection1.rawSha256, expected: expected.expectedTarball.sha256 })
  assert(id, inspection1.gzipBytes === expected.expectedTarball.gzipBytes, 'pack #1 gzip byte size equals expected', { actual: inspection1.gzipBytes, expected: expected.expectedTarball.gzipBytes })
  assert(id, inspection1.files.length === expected.expectedTarball.fileCount, 'pack #1 file count equals expected', { actual: inspection1.files.length, expected: expected.expectedTarball.fileCount })
  assert(id, !inspection1.names.some((name) => /STAGE3_STALE_POISON/.test(name)), 'pack #1 archive contains no planted poison', inspection1.names)

  for (const poison of poisonFiles) {
    await fsp.mkdir(path.dirname(poison), { recursive: true })
    await fsp.writeFile(poison, '// second stale disposable Stage 3 poison; clean:dist must remove this\n')
  }
  const pack2Dir = path.join(workDir, 'pack2')
  await ensureEmptyDirectory(pack2Dir)
  const p2 = await run(id, 'pack2', `npx -y npm@${args['npm-version']} pack --json --pack-destination ${sh(pack2Dir)}`, repoDir, {}, 600000)
  const manifest2 = parsePackJson(p2.raw)
  assert(id, p2.exitCode === 0, 'real npm pack #2 exits 0', { exitCode: p2.exitCode })
  assert(id, Array.isArray(manifest2) && manifest2.length === 1, 'npm pack #2 emits one JSON manifest entry', manifest2?.[0] ?? null)
  pack2 = {
    dir: pack2Dir,
    file: path.join(pack2Dir, manifest2?.[0]?.filename ?? tarballName),
    manifest: manifest2?.[0] ?? null,
    result: p2,
  }
  assert(id, fs.existsSync(pack2.file), 'pack #2 tarball exists', pack2.file)
  const distAfter2 = await hashTree(distDir)
  assert(id, !fs.existsSync(poisonFiles[0]) && !fs.existsSync(poisonFiles[1]), 'clean:dist removed poisoned files before pack #2', { poisonFiles })
  assert(id, deepEqual(distAfter1.files, distAfter2.files), 'dist content is byte-identical after pack #2 rebuild', { first: distAfter1.sha256, second: distAfter2.sha256 })
  inspection2 = await inspectTarball(pack2.file, archive2Dir)

  assert(id, inspection2.rawSha256 === inspection1.rawSha256, 'pack #2 raw tarball SHA-256 equals pack #1', { pack1: inspection1.rawSha256, pack2: inspection2.rawSha256 })
  assert(id, inspection2.tarStreamSha256 === inspection1.tarStreamSha256, 'pack #2 uncompressed tar stream hash equals pack #1', { pack1: inspection1.tarStreamSha256, pack2: inspection2.tarStreamSha256 })
  const files1 = inspection1.files.map(({ path: file, size, sha256: hash }) => ({ path: file, size, sha256: hash })).sort((a, b) => a.path.localeCompare(b.path))
  const files2 = inspection2.files.map(({ path: file, size, sha256: hash }) => ({ path: file, size, sha256: hash })).sort((a, b) => a.path.localeCompare(b.path))
  assert(id, deepEqual(files1, files2), 'pack #2 per-file bytes and sizes equal pack #1', { first: files1, second: files2 })
  assert(id, deepEqual(inspection1.names, inspection2.names), 'pack #2 archive order equals pack #1', { first: inspection1.names, second: inspection2.names })
  assert(id, inspection2.gzipBytes === inspection1.gzipBytes, 'pack #2 gzip size equals pack #1', { pack1: inspection1.gzipBytes, pack2: inspection2.gzipBytes })

  results.artifacts.tarballs = {
    pack1: {
      file: pack1.file,
      filename: path.basename(pack1.file),
      sha256: inspection1.rawSha256,
      tarStreamSha256: inspection1.tarStreamSha256,
      bytes: inspection1.gzipBytes,
      fileCount: inspection1.files.length,
      manifest: pack1.manifest,
    },
    pack2: {
      file: pack2.file,
      filename: path.basename(pack2.file),
      sha256: inspection2.rawSha256,
      tarStreamSha256: inspection2.tarStreamSha256,
      bytes: inspection2.gzipBytes,
      fileCount: inspection2.files.length,
      manifest: pack2.manifest,
    },
    rawReproducible: inspection1.rawSha256 === inspection2.rawSha256,
    contentReproducible: deepEqual(files1, files2),
    dist: { sha256: distAfter1.sha256, fileCount: distAfter1.files.length },
    poisonRemoved: !fs.existsSync(poisonFiles[0]) && !fs.existsSync(poisonFiles[1]),
    lifecycleEvidence: lifecycle.map(([name, marker]) => ({ name, marker, present: p1.raw.includes(marker) })),
    testSummary: testsPassed?.[0] ?? null,
  }
  note(id, `pack #1 ${inspection1.rawSha256} (${inspection1.gzipBytes} bytes, ${inspection1.files.length} files); pack #2 ${inspection2.rawSha256}; raw equal=${inspection1.rawSha256 === inspection2.rawSha256}`)
  finalize(id)
}

async function runManifestScenario() {
  const id = 'S3-01'
  scenario(id)
  addCase(id, 5)
  const dry = await run(id, 'pack-dry-run', `npx -y npm@${args['npm-version']} pack --dry-run --json`, repoDir, {}, 600000)
  const parsed = parsePackJson(dry.raw)
  dryRunManifest = Array.isArray(parsed) ? parsed[0] : null
  assert(id, dry.exitCode === 0, 'npm pack --dry-run --json exits 0', { exitCode: dry.exitCode })
  assert(id, Boolean(dryRunManifest), 'dry-run JSON manifest is parseable', dryRunManifest)
  assert(id, dryRunManifest?.name === packageJson.name && dryRunManifest?.version === packageJson.version, 'dry-run manifest name/version equal reviewed package', { name: dryRunManifest?.name, version: dryRunManifest?.version })
  assert(id, dryRunManifest?.filename === tarballName, 'dry-run filename equals expected tarball name', dryRunManifest?.filename)
  assert(id, dryRunManifest?.files?.length === expected.expectedTarball.fileCount, 'dry-run manifest file count equals expected', { actual: dryRunManifest?.files?.length, expected: expected.expectedTarball.fileCount })

  const check = await checkTarballManifest({ inspection: inspection1, allowlist, dryRun: dryRunManifest })
  addChecks(id, check)
  assert(id, check.failures.length === 0, 'positive archive passes every manifest/allowlist/structure/content check', check.failures)
  results.artifacts.manifest = {
    archive: check.summary,
    dryRun: dryRunManifest,
    checks: check.checks,
  }

  const ncRoot = path.join(workDir, 'nc-extra-entry')
  await ensureEmptyDirectory(ncRoot)
  execFileSync('tar', ['-xzf', pack1.file, '-C', ncRoot, '--no-same-owner'], { stdio: 'pipe' })
  await fsp.mkdir(path.join(ncRoot, 'package', 'src'), { recursive: true })
  await fsp.writeFile(path.join(ncRoot, 'package', 'src', 'internal.ts'), 'export const leaked = true\n')
  await fsp.writeFile(path.join(ncRoot, 'package', 'dist', 'leak.js.map'), '{"version":3,"sources":["../../src/index.ts"]}\n//# sourceMappingURL=leak.js.map\n')
  const ncTarball = path.join(workDir, 'nc-extra-entry.tgz')
  execFileSync('tar', ['-czf', ncTarball, '-C', ncRoot, 'package'], { stdio: 'pipe' })
  const ncInspection = await inspectTarball(ncTarball, path.join(workDir, 'archive-nc-extra'))
  const ncCheck = await checkTarballManifest({ inspection: ncInspection, allowlist, dryRun: dryRunManifest })
  const detectedPaths = ncCheck.failures.flatMap((failure) => Array.isArray(failure.detail) ? failure.detail : [])
  const detected = ncCheck.failures.length > 0 && ['package/src/internal.ts', 'package/dist/leak.js.map'].every((entry) => detectedPaths.includes(entry) || JSON.stringify(ncCheck.failures).includes(entry))
  assert(id, detected, 'negative control: same checker rejects forbidden extra archive entries', ncCheck.failures)
  recordNegativeControl('S3-NC1-forbidden-extra-entry', { detected, failures: ncCheck.failures, injected: ['package/src/internal.ts', 'package/dist/leak.js.map'] })
  note(id, `actual archive ${inspection1.files.length} files; dry-run ${dryRunManifest?.files?.length} files; negative control rejected=${detected}`)
  finalize(id)
}

async function runMetadataScenario() {
  const id = 'S3-08'
  scenario(id)
  addCase(id, 7)
  const packaged = JSON.parse(fs.readFileSync(inspection1.fileMap['package/package.json'].absolute, 'utf8'))
  const check = checkPackageMetadata({ packaged, repo: packageJson, allowlist, inspection: inspection1, repoRoot: repoDir, lock: packageLock })
  addChecks(id, check)
  assert(id, check.failures.length === 0, 'positive package metadata passes every truth/declaration/content check', check.failures)
  assert(id, inspection1.fileMap['package/package.json'].sha256 === sha256(await fsp.readFile(path.join(repoDir, 'package.json'))), 'packed package.json bytes equal reviewed package.json', { packed: inspection1.fileMap['package/package.json'].sha256 })
  assert(id, deepEqual(Object.keys(packaged.exports ?? {}), ['.']), 'packed exports declares only the root subpath', Object.keys(packaged.exports ?? {}))
  assert(id, packaged.files?.length === 1 && packaged.files[0] === 'dist', 'packed files list contains only dist', packaged.files)
  results.artifacts.metadata = { packaged, checks: check.checks, packedPackageJsonSha256: inspection1.fileMap['package/package.json'].sha256 }

  const ncRoot = path.join(workDir, 'nc-dependency-injection')
  await ensureEmptyDirectory(ncRoot)
  execFileSync('tar', ['-xzf', pack1.file, '-C', ncRoot, '--no-same-owner'], { stdio: 'pipe' })
  const mutatedPath = path.join(ncRoot, 'package', 'package.json')
  const mutated = JSON.parse(await fsp.readFile(mutatedPath, 'utf8'))
  mutated.dependencies = { react: '19.3.1', 'left-pad': '1.3.0' }
  await fsp.writeFile(mutatedPath, `${JSON.stringify(mutated, null, 2)}\n`)
  const ncTarball = path.join(workDir, 'nc-dependency-injection.tgz')
  execFileSync('tar', ['-czf', ncTarball, '-C', ncRoot, 'package'], { stdio: 'pipe' })
  const ncInspection = await inspectTarball(ncTarball, path.join(workDir, 'archive-nc-dependency'))
  const ncPackaged = JSON.parse(fs.readFileSync(ncInspection.fileMap['package/package.json'].absolute, 'utf8'))
  const ncCheck = checkPackageMetadata({ packaged: ncPackaged, repo: packageJson, allowlist, inspection: ncInspection, repoRoot: repoDir, lock: packageLock })
  const detected = ncCheck.failures.some((failure) => /dependency|deep-equals/.test(failure.name))
  assert(id, detected, 'negative control: same metadata checker rejects injected runtime dependencies', ncCheck.failures)
  recordNegativeControl('S3-NC2-dependency-injection', { detected, failures: ncCheck.failures, injected: ['react', 'left-pad'] })
  note(id, `packed package.json ${inspection1.fileMap['package/package.json'].sha256}; README/LICENSE hashes match; declaration coverage checked`)
  finalize(id)
}

async function prepareConsumer(name) {
  const target = path.join(workDir, 'consumers', name)
  await ensureEmptyDirectory(target)
  for (const file of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.npmrc', '.yarnrc.yml']) {
    const source = path.join(fixturesDir, 'consumers', name.replace(/-(?:prod|offline)$/, ''), file)
    if (fs.existsSync(source) && (file === 'package.json' || fs.existsSync(path.join(fixturesDir, 'consumers', name.replace(/-(?:prod|offline)$/, ''), file)))) {
      await fsp.copyFile(source, path.join(target, file))
    }
  }
  await fsp.copyFile(pack1.file, path.join(target, tarballName))
  for (const file of ['s3-render.mjs', 's3-imports.mjs', 's3-pnp.cjs']) {
    await fsp.copyFile(path.join(repoDir, 'scripts', 'testing', file), path.join(target, `.${file}`))
  }
  return target
}

async function installCanonical() {
  const id = 'S3-03'
  scenario(id)
  addCase(id, 7)
  const target = await prepareConsumer('npm')
  canonical = { dir: target, lockBefore: sha256(await fsp.readFile(path.join(target, 'package-lock.json'))) }
  const install = await run(id, 'canonical-npm-ci', `npx -y npm@${args['npm-version']} ci --ignore-scripts --no-audit --no-fund`, target, {}, 600000)
  assert(id, install.exitCode === 0, 'fresh canonical npm ci exits 0', { exitCode: install.exitCode, stderr: install.stderr.slice(-3000) })
  canonical.lockAfter = sha256(await fsp.readFile(path.join(target, 'package-lock.json')))
  assert(id, canonical.lockAfter === canonical.lockBefore, 'canonical npm ci preserves the committed lockfile byte-for-byte', { before: canonical.lockBefore, after: canonical.lockAfter })
  const installed = path.join(target, 'node_modules', 'dither-face')
  assert(id, fs.existsSync(installed), 'installed dither-face directory exists', installed)
  const lstat = await fsp.lstat(installed)
  const realpath = await fsp.realpath(installed)
  const installedPkg = readJson(path.join(realpath, 'package.json'))
  canonical.installed = {
    path: installed,
    realpath,
    isSymlink: lstat.isSymbolicLink(),
    version: installedPkg.version,
    outsideRepo: outsideRepo(realpath),
    dependencySpec: readJson(path.join(target, 'package.json')).dependencies['dither-face'],
    lockEntry: readJson(path.join(target, 'package-lock.json')).packages?.['node_modules/dither-face'],
  }
  assert(id, canonical.installed.isSymlink === false, 'npm installed package is a real copy, not a symlink', canonical.installed)
  assert(id, canonical.installed.outsideRepo, 'installed package real path is outside the repository', canonical.installed)
  assert(id, canonical.installed.version === '0.1.0', 'installed package version is 0.1.0', canonical.installed.version)
  assert(id, canonical.installed.dependencySpec === `file:./${tarballName}`, 'consumer declares the copied tarball, not a repo alias', canonical.installed.dependencySpec)
  const installedTree = await hashTree(realpath)
  const archiveTree = inspection1.files
    .filter((entry) => entry.path.startsWith('package/'))
    .map(({ path: file, size, sha256: hash }) => ({ path: file.replace(/^package\//, ''), size, sha256: hash }))
    .sort((a, b) => a.path.localeCompare(b.path))
  canonical.installed.treeSha256 = installedTree.sha256
  canonical.installed.archiveTreeSha256 = sha256(archiveTree.map((entry) => `${entry.path}\0${entry.sha256}`).sort().join('\n'))
  assert(id, deepEqual(installedTree.files, archiveTree), 'installed package tree bytes equal the packed archive tree', { installed: installedTree.sha256, archive: canonical.installed.archiveTreeSha256 })
  const ls = await run(id, 'canonical-npm-ls-prod', `npx -y npm@${args['npm-version']} ls --omit=dev --all --json`, target, {}, 120000)
  canonical.prodTree = parseJsonText(ls.stdout)
  assert(id, ls.exitCode === 0 && Boolean(canonical.prodTree), 'npm production tree command exits 0 with JSON', { exitCode: ls.exitCode })
  results.probes.canonical = canonical
}

async function runRenderers() {
  const id = 'S3-03'
  scenario(id)
  const goldenPath = path.join(fixturesDir, 'fixtures', 'golden.json')
  async function render(label, nodeSpec, expectedNode) {
    const command = `npx -y node@${nodeSpec} .s3-render.mjs --golden ${sh(goldenPath)} --label ${label}`
    const result = await run(id, label, command, canonical.dir, {}, 600000)
    const probe = parseJsonText(result.raw)
    assert(id, result.exitCode === 0, `${label}: renderer exits 0`, { exitCode: result.exitCode, tail: result.raw.slice(-3000) })
    assert(id, Boolean(probe), `${label}: renderer emits JSON`, null)
    if (!probe) return null
    assert(id, probe.node === expectedNode || probe.node.endsWith(expectedNode), `${label}: runs expected Node ${expectedNode}`, probe.node)
    assert(id, probe.failures === 0, `${label}: all eight fixture hashes match golden`, probe.cases.filter((entry) => !entry.equal))
    assert(id, probe.cases.length === 8 && probe.cases.every((entry) => entry.equal && entry.startsWithSvg && entry.bytes > 100), `${label}: eight non-empty SVG outputs match exact golden SHA-256`, probe.cases)
    assert(id, probe.styleOrderMatchesGolden === true, `${label}: STYLES order matches documented sheet order`, probe.styleOrder)
    assert(id, probe.networkAttempts.length === 0, `${label}: zero network attempts during import/render`, probe.networkAttempts)
    assert(id, !probe.activeResources.some((resource) => /TCP|UDP|TLS|HTTP/i.test(resource)), `${label}: no active network resource remains`, probe.activeResources)
    assert(id, outsideRepo(probe.packageRoot), `${label}: actual package root is outside the repository`, probe.packageRoot)
    assert(id, probe.packageRootReadable === true, `${label}: installed package.json is readable`, { root: probe.packageRoot, readable: probe.packageRootReadable })
    assert(id, probe.packageVersion === '0.1.0', `${label}: installed package version is 0.1.0`, probe.packageVersion)
    assert(id, probe.goldenSha256 === expected.fixedArtifacts.golden.sha256AtCreation, `${label}: golden file hash matches expected-before-run`, { actual: probe.goldenSha256, expected: expected.fixedArtifacts.golden.sha256AtCreation })
    return probe
  }
  render24 = await render('canonical-node24', args.node24, `v${args.node24}`)
  render22 = await render('canonical-node22', args.node22, `v${args.node22}`)
  if (render24 && render22) {
    assert(id, deepEqual(render24.cases.map((entry) => entry.actualSha256), render22.cases.map((entry) => entry.actualSha256)), 'Node 22 and Node 24 produce identical eight-style hashes', { node22: render22.cases.map((entry) => entry.actualSha256), node24: render24.cases.map((entry) => entry.actualSha256) })
  }
  results.probes.render24 = render24
  results.probes.render22 = render22
  note(id, `Node 22 ${versions.node22} and Node 24 ${versions.node24}: 8/8 golden hashes each; network attempts 0`)
  finalize(id)
}

async function runExportsScenario() {
  const id = 'S3-05'
  scenario(id)
  addCase(id, 7)
  const expectedPath = path.join(fixturesDir, 'expected-exports.json')
  async function probe(label, nodeSpec, expectedNode, major) {
    const command = `npx -y node@${nodeSpec} .s3-imports.mjs --expected ${sh(expectedPath)}`
    const result = await run(id, label, command, canonical.dir, {}, 600000)
    const parsed = parseJsonText(result.raw)
    assert(id, result.exitCode === 0, `${label}: export probe exits 0`, { exitCode: result.exitCode, tail: result.raw.slice(-3000) })
    assert(id, Boolean(parsed), `${label}: export probe emits JSON`, null)
    if (!parsed) return null
    assert(id, parsed.node === `v${expectedNode}` || parsed.node.endsWith(expectedNode), `${label}: runs expected Node`, parsed.node)
    addChecks(id, checkExportProbe(parsed, expectedExports))
    addChecks(id, checkCjsObservation(parsed, major))
    assert(id, outsideRepo(parsed.packageRoot), `${label}: package root from export probe is outside repo`, parsed.packageRoot)
    assert(id, parsed.packageVersion === '0.1.0', `${label}: package version is 0.1.0`, parsed.packageVersion)
    assert(id, parsed.importMetaResolve.includes('node_modules/dither-face/dist/index.js'), `${label}: import.meta.resolve points at packed dist/index.js`, parsed.importMetaResolve)
    return parsed
  }
  importProbe24 = await probe('exports-node24', args.node24, args.node24, 24)
  importProbe22 = await probe('exports-node22', args.node22, args.node22, 22)
  results.probes.imports24 = importProbe24
  results.probes.imports22 = importProbe22

  const ncRoot = path.join(workDir, 'nc-export-typo')
  await ensureEmptyDirectory(ncRoot)
  execFileSync('tar', ['-xzf', pack1.file, '-C', ncRoot, '--no-same-owner'], { stdio: 'pipe' })
  const mutatedPath = path.join(ncRoot, 'package', 'package.json')
  const mutated = JSON.parse(await fsp.readFile(mutatedPath, 'utf8'))
  mutated.exports['.'].default = './dist/indx.js'
  await fsp.writeFile(mutatedPath, `${JSON.stringify(mutated, null, 2)}\n`)
  const ncTarball = path.join(workDir, 'nc-export-typo.tgz')
  execFileSync('tar', ['-czf', ncTarball, '-C', ncRoot, 'package'], { stdio: 'pipe' })
  const ncInspection = await inspectTarball(ncTarball, path.join(workDir, 'archive-nc-export'))
  const ncPackaged = JSON.parse(fs.readFileSync(ncInspection.fileMap['package/package.json'].absolute, 'utf8'))
  const ncMetadata = checkPackageMetadata({ packaged: ncPackaged, repo: packageJson, allowlist, inspection: ncInspection, repoRoot: repoDir, lock: packageLock })
  const ncDir = path.join(workDir, 'consumers', 'nc-export-typo')
  await ensureEmptyDirectory(ncDir)
  await fsp.writeFile(path.join(ncDir, 'package.json'), `${JSON.stringify({ name: 'nc-export-typo', private: true, type: 'module' }, null, 2)}\n`)
  const ncInstall = await run(id, 'nc3-install', `npx -y npm@${args['npm-version']} install --ignore-scripts --no-audit --no-fund ${sh(ncTarball)}`, ncDir, {}, 600000)
  const ncImport = await run(id, 'nc3-import', `node -e "import('dither-face').then(()=>{console.log(JSON.stringify({resolved:true}));process.exit(0)}).catch((error)=>{console.log(JSON.stringify({resolved:false,code:error.code||null,message:String(error.message)}));process.exit(1)})"`, ncDir, {}, 120000)
  const importFailure = parseJsonText(ncImport.raw)
  const metadataDetected = ncMetadata.failures.some((failure) => failure.name.includes('declared path exists'))
  const detected = ncInstall.exitCode === 0 && ncImport.exitCode !== 0 && importFailure?.resolved === false && metadataDetected
  assert(id, detected, 'negative control: export-path typo makes root import fail and is caught by the metadata checker', { install: ncInstall.exitCode, import: ncImport.exitCode, importFailure, metadataFailures: ncMetadata.failures })
  recordNegativeControl('S3-NC3-export-path-typo', { detected, installExit: ncInstall.exitCode, importExit: ncImport.exitCode, importFailure, metadataFailures: ncMetadata.failures })
  note(id, 'root ESM/CJS export probe on both Node lines; unsupported deep imports rejected; CJS require(esm) recorded as observed compatibility')
  finalize(id)
}

async function installTypeScriptTool(version, directory) {
  await ensureEmptyDirectory(directory)
  await fsp.writeFile(path.join(directory, 'package.json'), `${JSON.stringify({ name: `ts-tool-${version}`, private: true, version: '0.0.0' }, null, 2)}\n`)
  const result = await runCommand({
    label: `typescript-install-${version}`,
    command: `npx -y npm@${args['npm-version']} install --ignore-scripts --no-audit --no-fund typescript@${version}`,
    cwd: directory,
    logDir: logsDir,
    timeout: 600000,
  })
  recordCommand('S3-06', result)
  if (result.exitCode !== 0) throw new Error(`TypeScript ${version} install failed`)
  const tsc = path.join(directory, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!fs.existsSync(tsc)) throw new Error(`TypeScript ${version} tsc missing`)
  const v = await runCommand({ label: `typescript-version-${version}`, command: `node ${sh(tsc)} --version`, cwd: directory, logDir: logsDir, timeout: 120000 })
  recordCommand('S3-06', v)
  return { version, tsc, reported: v.raw.trim().split('\n').filter(Boolean).at(-1) }
}

async function runTypesScenario() {
  const id = 'S3-06'
  scenario(id)
  addCase(id, 7)
  const target = path.join(workDir, 'consumers', 'ts')
  await ensureEmptyDirectory(target)
  await fsp.writeFile(path.join(target, 'package.json'), `${JSON.stringify({
    name: 'dither-face-s3-ts-consumer',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: { 'dither-face': `file:./${tarballName}` },
  }, null, 2)}\n`)
  await fsp.copyFile(pack1.file, path.join(target, tarballName))
  const install = await run(id, 'ts-consumer-install', `npx -y npm@${args['npm-version']} install --ignore-scripts --no-audit --no-fund`, target, {}, 600000)
  assert(id, install.exitCode === 0, 'fresh TypeScript consumer installs actual tarball', { exitCode: install.exitCode })
  const installed = path.join(target, 'node_modules', 'dither-face')
  assert(id, fs.existsSync(installed) && outsideRepo(await fsp.realpath(installed)), 'TypeScript consumer package root is installed outside the repository', installed)
  const tsDir = path.join(fixturesDir, 'ts')
  for (const file of fs.readdirSync(tsDir)) {
    await fsp.copyFile(path.join(tsDir, file), path.join(target, file))
  }
  const tools = {}
  tools[args['ts-current']] = await installTypeScriptTool(args['ts-current'], path.join(workDir, 'tools', `typescript-${args['ts-current']}`))
  tools[args['ts-prior']] = await installTypeScriptTool(args['ts-prior'], path.join(workDir, 'tools', `typescript-${args['ts-prior']}`))
  assert(id, tools[args['ts-current']].reported.includes(args['ts-current']), `TypeScript ${args['ts-current']} reports pinned version`, tools[args['ts-current']].reported)
  assert(id, tools[args['ts-prior']].reported.includes(args['ts-prior']), `TypeScript ${args['ts-prior']} reports pinned version`, tools[args['ts-prior']].reported)

  const modes = {
    NodeNext: { tsconfig: 'tsconfig.nodenext.json', module: 'nodenext', moduleResolution: 'nodenext' },
    Node16: { tsconfig: 'tsconfig.node16.json', module: 'node16', moduleResolution: 'node16' },
    Bundler: { tsconfig: 'tsconfig.bundler.json', module: 'esnext', moduleResolution: 'bundler' },
  }
  const invalidFiles = ['invalid-style.ts', 'invalid-seed.ts', 'invalid-options.ts', 'invalid-readonly.ts', 'invalid-deep-import.ts']
  for (const [version, tool] of Object.entries(tools)) {
    const versionEntry = { version, tsc: tool.tsc, reported: tool.reported, modes: {} }
    for (const [mode, modeConfig] of Object.entries(modes)) {
      const trace = await run(id, `ts-${version}-${mode}-valid`, `node ${sh(tool.tsc)} -p ${sh(modeConfig.tsconfig)} --traceResolution`, target, {}, 300000)
      const validChecks = checkTypeScriptRun({ mode, version, valid: trace, invalidRuns: [] })
      addChecks(id, validChecks)
      assert(id, trace.raw.includes('node_modules/dither-face/dist/index.d.ts'), `TS ${version} ${mode}: trace resolves packed dist/index.d.ts`, null)
      assert(id, !trace.raw.includes(`${repoDir}/src/`), `TS ${version} ${mode}: trace does not resolve repository source`, null)
      const invalidRuns = []
      for (const file of invalidFiles) {
        const result = await run(id, `ts-${version}-${mode}-${file.replace(/\.ts$/, '')}`, `node ${sh(tool.tsc)} --noEmit --strict --target ES2022 --lib ES2022 --noUncheckedIndexedAccess --skipLibCheck false --pretty false --module ${modeConfig.module} --moduleResolution ${modeConfig.moduleResolution} ${sh(file)}`, target, {}, 300000)
        invalidRuns.push({ name: file, exitCode: result.exitCode, raw: result.raw })
      }
      const invalidChecks = checkTypeScriptRun({ mode, version, valid: trace, invalidRuns })
      for (const check of invalidChecks.checks.slice(2)) assert(id, check.ok, check.name, check.detail)
      versionEntry.modes[mode] = {
        validExit: trace.exitCode,
        traceResolvedDeclaration: trace.raw.includes('node_modules/dither-face/dist/index.d.ts'),
        invalid: invalidRuns.map((runResult) => ({
          name: runResult.name,
          exitCode: runResult.exitCode,
          diagnostics: runResult.raw.split('\n').filter((line) => /error TS\d+/.test(line)).slice(0, 8),
        })),
      }
    }
    tsResults[version] = versionEntry
  }
  const invalidStyle = tsResults[args['ts-current']].modes.NodeNext.invalid.find((entry) => entry.name === 'invalid-style.ts')
  assert(id, invalidStyle?.exitCode !== 0 && invalidStyle.diagnostics.length > 0, 'negative control: strict checker rejects invalid style with a concrete TS diagnostic', invalidStyle)
  recordNegativeControl('S3-NC4-invalid-typescript', { detected: invalidStyle?.exitCode !== 0 && invalidStyle.diagnostics.length > 0, run: invalidStyle })
  results.probes.typescript = tsResults
  note(id, `TS ${args['ts-current']} and ${args['ts-prior']} x NodeNext/Node16/Bundler valid+5 invalid fixtures; trace resolves packed declarations`)
  finalize(id)
}

function npmTreeOnlyDitherFace(tree) {
  const dependencyKeys = Object.keys(tree?.dependencies ?? {}).sort()
  const nested = Object.values(tree?.dependencies ?? {}).flatMap((entry) => Object.keys(entry?.dependencies ?? {}))
  return { dependencyKeys, nested, only: dependencyKeys.length === 1 && dependencyKeys[0] === 'dither-face' && nested.length === 0 }
}

async function runNpmConsumers() {
  const id = 'S3-07'
  scenario(id)
  addCase(id, 8)
  const target = await prepareConsumer('npm')
  const lockBefore = sha256(await fsp.readFile(path.join(target, 'package-lock.json')))
  const online = await run(id, 'npm-online-ci', `npx -y npm@${args['npm-version']} ci --ignore-scripts --no-audit --no-fund`, target, {}, 600000)
  assert(id, online.exitCode === 0, 'npm consumer online lockfile install exits 0', { exitCode: online.exitCode, stderr: online.stderr.slice(-3000) })
  const lockAfterOnline = sha256(await fsp.readFile(path.join(target, 'package-lock.json')))
  assert(id, lockAfterOnline === lockBefore, 'npm lockfile is unchanged by online install', { before: lockBefore, after: lockAfterOnline })
  const firstTree = parseJsonText((await run(id, 'npm-ls-prod-online', `npx -y npm@${args['npm-version']} ls --omit=dev --all --json`, target, {}, 120000)).stdout)
  const npmTree = npmTreeOnlyDitherFace(firstTree)
  assert(id, npmTree.only, 'npm production tree contains only dither-face', npmTree)
  const installed = await fsp.realpath(path.join(target, 'node_modules', 'dither-face'))
  assert(id, outsideRepo(installed), 'npm package real path is outside repository', installed)
  const renderOnline = parseJsonText((await run(id, 'npm-render-online', `npx -y node@${args.node24} .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label npm-online`, target, {}, 600000)).raw)
  assert(id, renderOnline?.failures === 0 && renderOnline?.cases?.length === 8, 'npm consumer renders all eight styles to tarball golden', renderOnline?.cases)
  await fsp.rm(path.join(target, 'node_modules'), { recursive: true, force: true })
  const offline = await run(id, 'npm-offline-ci', `npx -y npm@${args['npm-version']} ci --offline --ignore-scripts --no-audit --no-fund`, target, {}, 600000)
  assert(id, offline.exitCode === 0, 'npm offline lockfile reinstall after cache population exits 0', { exitCode: offline.exitCode, stderr: offline.stderr.slice(-3000) })
  const lockAfterOffline = sha256(await fsp.readFile(path.join(target, 'package-lock.json')))
  assert(id, lockAfterOffline === lockBefore, 'npm lockfile is unchanged by offline reinstall', { before: lockBefore, after: lockAfterOffline })
  const renderOffline = parseJsonText((await run(id, 'npm-render-offline', `npx -y node@${args.node24} .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label npm-offline`, target, {}, 600000)).raw)
  assert(id, renderOffline?.failures === 0 && deepEqual(renderOffline?.cases?.map((entry) => entry.actualSha256), renderOnline?.cases?.map((entry) => entry.actualSha256)), 'npm offline reinstall renders the same eight hashes', renderOffline?.cases)

  const prod = path.join(workDir, 'consumers', 'npm-prod')
  await ensureEmptyDirectory(prod)
  for (const file of ['package.json', 'package-lock.json']) await fsp.copyFile(path.join(fixturesDir, 'consumers', 'npm', file), path.join(prod, file))
  await fsp.copyFile(pack1.file, path.join(prod, tarballName))
  await fsp.copyFile(path.join(repoDir, 'scripts', 'testing', 's3-render.mjs'), path.join(prod, '.s3-render.mjs'))
  const prodInstall = await run(id, 'npm-prod-ci', `npx -y npm@${args['npm-version']} ci --omit=dev --offline --ignore-scripts --no-audit --no-fund`, prod, {}, 600000)
  assert(id, prodInstall.exitCode === 0, 'npm production-only offline install exits 0', { exitCode: prodInstall.exitCode, stderr: prodInstall.stderr.slice(-3000) })
  const prodEntries = fs.readdirSync(path.join(prod, 'node_modules')).sort()
  assert(id, deepEqual(prodEntries, ['.package-lock.json', 'dither-face']), 'npm production node_modules excludes TypeScript/React/test tools', prodEntries)
  const prodTree = parseJsonText((await run(id, 'npm-ls-prod-final', `npx -y npm@${args['npm-version']} ls --omit=dev --all --json`, prod, {}, 120000)).stdout)
  assert(id, npmTreeOnlyDitherFace(prodTree).only, 'npm production-only tree contains only dither-face', npmTreeOnlyDitherFace(prodTree))
  const renderProd = parseJsonText((await run(id, 'npm-render-prod', `npx -y node@${args.node24} .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label npm-prod`, prod, {}, 600000)).raw)
  assert(id, renderProd?.failures === 0 && deepEqual(renderProd?.cases?.map((entry) => entry.actualSha256), renderOnline?.cases?.map((entry) => entry.actualSha256)), 'npm production-only install renders the same eight hashes', renderProd?.cases)
  pmResults.npm = { lockBefore, lockAfterOnline, lockAfterOffline, tree: npmTree, prodEntries, hashes: renderOnline?.cases, prodHashes: renderProd?.cases, installed, prodTree: npmTreeOnlyDitherFace(prodTree) }
}

async function runPnpmConsumers() {
  const id = 'S3-07'
  scenario(id)
  addCase(id, 8)
  const target = await prepareConsumer('pnpm')
  const lockBefore = sha256(await fsp.readFile(path.join(target, 'pnpm-lock.yaml')))
  const online = await run(id, 'pnpm-online-install', `npx -y pnpm@${args['pnpm-version']} install --frozen-lockfile --ignore-scripts`, target, {}, 600000)
  assert(id, online.exitCode === 0, 'pnpm consumer frozen-lockfile install exits 0', { exitCode: online.exitCode, stderr: online.stderr.slice(-3000) })
  const lockAfterOnline = sha256(await fsp.readFile(path.join(target, 'pnpm-lock.yaml')))
  assert(id, lockAfterOnline === lockBefore, 'pnpm lockfile is unchanged by install', { before: lockBefore, after: lockAfterOnline })
  const installed = await fsp.realpath(path.join(target, 'node_modules', 'dither-face'))
  assert(id, outsideRepo(installed) && !installed.startsWith(`${repoDir}${path.sep}`), 'pnpm package real path is outside repository', installed)
  const treeRaw = await run(id, 'pnpm-list-prod-online', `npx -y pnpm@${args['pnpm-version']} list --prod --depth=10 --json`, target, {}, 120000)
  const tree = parseJsonText(treeRaw.stdout)
  const treeRoot = Array.isArray(tree) ? tree[0] : tree
  const treeDeps = Object.keys(treeRoot?.dependencies ?? {}).sort()
  assert(id, treeRaw.exitCode === 0 && deepEqual(treeDeps, ['dither-face']), 'pnpm production tree contains only dither-face', { treeDeps, tree: treeRoot })
  const renderOnline = parseJsonText((await run(id, 'pnpm-render-online', `npx -y node@${args.node24} .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label pnpm-online`, target, {}, 600000)).raw)
  assert(id, renderOnline?.failures === 0 && renderOnline?.cases?.length === 8, 'pnpm consumer renders all eight styles to tarball golden', renderOnline?.cases)
  await fsp.rm(path.join(target, 'node_modules'), { recursive: true, force: true })
  const offline = await run(id, 'pnpm-offline-install', `npx -y pnpm@${args['pnpm-version']} install --offline --frozen-lockfile --ignore-scripts`, target, {}, 600000)
  assert(id, offline.exitCode === 0, 'pnpm offline frozen-lockfile reinstall exits 0', { exitCode: offline.exitCode, stderr: offline.stderr.slice(-3000) })
  const lockAfterOffline = sha256(await fsp.readFile(path.join(target, 'pnpm-lock.yaml')))
  assert(id, lockAfterOffline === lockBefore, 'pnpm lockfile is unchanged by offline reinstall', { before: lockBefore, after: lockAfterOffline })
  const renderOffline = parseJsonText((await run(id, 'pnpm-render-offline', `npx -y node@${args.node24} .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label pnpm-offline`, target, {}, 600000)).raw)
  assert(id, renderOffline?.failures === 0 && deepEqual(renderOffline?.cases?.map((entry) => entry.actualSha256), renderOnline?.cases?.map((entry) => entry.actualSha256)), 'pnpm offline reinstall renders the same eight hashes', renderOffline?.cases)

  const prod = path.join(workDir, 'consumers', 'pnpm-prod')
  await ensureEmptyDirectory(prod)
  for (const file of ['package.json', 'pnpm-lock.yaml', '.npmrc']) await fsp.copyFile(path.join(fixturesDir, 'consumers', 'pnpm', file), path.join(prod, file))
  await fsp.copyFile(pack1.file, path.join(prod, tarballName))
  await fsp.copyFile(path.join(repoDir, 'scripts', 'testing', 's3-render.mjs'), path.join(prod, '.s3-render.mjs'))
  const prodInstall = await run(id, 'pnpm-prod-install', `npx -y pnpm@${args['pnpm-version']} install --prod --offline --frozen-lockfile --ignore-scripts`, prod, {}, 600000)
  assert(id, prodInstall.exitCode === 0, 'pnpm production-only offline install exits 0', { exitCode: prodInstall.exitCode, stderr: prodInstall.stderr.slice(-3000) })
  assert(id, !fs.existsSync(path.join(prod, 'node_modules', 'typescript')) && !fs.existsSync(path.join(prod, 'node_modules', 'react')), 'pnpm production node_modules excludes TypeScript and React', fs.readdirSync(path.join(prod, 'node_modules')).sort())
  const prodTreeRaw = await run(id, 'pnpm-list-prod-final', `npx -y pnpm@${args['pnpm-version']} list --prod --depth=10 --json`, prod, {}, 120000)
  const prodTree = parseJsonText(prodTreeRaw.stdout)
  const prodRoot = Array.isArray(prodTree) ? prodTree[0] : prodTree
  assert(id, deepEqual(Object.keys(prodRoot?.dependencies ?? {}).sort(), ['dither-face']), 'pnpm production-only tree contains only dither-face', prodRoot)
  const renderProd = parseJsonText((await run(id, 'pnpm-render-prod', `npx -y node@${args.node24} .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label pnpm-prod`, prod, {}, 600000)).raw)
  assert(id, renderProd?.failures === 0 && deepEqual(renderProd?.cases?.map((entry) => entry.actualSha256), renderOnline?.cases?.map((entry) => entry.actualSha256)), 'pnpm production-only install renders the same eight hashes', renderProd?.cases)
  pmResults.pnpm = { lockBefore, lockAfterOnline, lockAfterOffline, treeDeps, prodTree: prodRoot, hashes: renderOnline?.cases, prodHashes: renderProd?.cases, installed }
}

async function runYarnConsumers() {
  const id = 'S3-07'
  scenario(id)
  addCase(id, 8)
  const target = await prepareConsumer('yarn')
  const lockBefore = sha256(await fsp.readFile(path.join(target, 'yarn.lock')))
  const yarnCommand = `npx -y -p @yarnpkg/cli-dist@${args['yarn-version']} yarn`
  const online = await run(id, 'yarn-online-install', `${yarnCommand} install --immutable`, target, { YARN_ENABLE_TELEMETRY: '0' }, 600000)
  assert(id, online.exitCode === 0, 'Yarn PnP immutable install exits 0', { exitCode: online.exitCode, stderr: online.stderr.slice(-3000) })
  const lockAfterOnline = sha256(await fsp.readFile(path.join(target, 'yarn.lock')))
  assert(id, lockAfterOnline === lockBefore, 'Yarn lockfile is unchanged by install', { before: lockBefore, after: lockAfterOnline })
  assert(id, fs.existsSync(path.join(target, '.pnp.cjs')), 'Yarn PnP runtime .pnp.cjs exists', null)
  assert(id, !fs.existsSync(path.join(target, 'node_modules')), 'Yarn PnP install creates no node_modules tree', fs.existsSync(path.join(target, 'node_modules')))
  const pnp = await run(id, 'yarn-pnp-probe', `${yarnCommand} node .s3-pnp.cjs`, target, { YARN_ENABLE_TELEMETRY: '0' }, 300000)
  const pnpProbe = parseJsonText(pnp.stdout)
  assert(id, pnp.exitCode === 0 && Boolean(pnpProbe), 'Yarn PnP dependency probe exits 0 with JSON', { exitCode: pnp.exitCode, tail: pnp.raw.slice(-2000) })
  assert(id, pnpProbe?.packageDependencies?.length === 0, 'dither-face PnP runtime dependency closure is empty', pnpProbe?.packageDependencies)
  assert(id, pnpProbe?.react?.resolved === false && pnpProbe?.reactDom?.resolved === false, 'React/React DOM do not resolve in the PnP consumer', pnpProbe)
  assert(id, pnpProbe?.typescript?.resolved === true, 'TypeScript is present as a development-only tool', pnpProbe?.typescript)
  const renderOnline = parseJsonText((await run(id, 'yarn-render-online', `${yarnCommand} node .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label yarn-online`, target, { YARN_ENABLE_TELEMETRY: '0' }, 600000)).raw)
  assert(id, renderOnline?.failures === 0 && renderOnline?.cases?.length === 8, 'Yarn PnP consumer renders all eight styles to tarball golden', renderOnline?.cases)
  assert(id, outsideRepo(renderOnline?.packageRoot ?? repoDir), 'Yarn PnP package root is outside the repository', renderOnline?.packageRoot)
  await fsp.rm(path.join(target, '.pnp.cjs'), { force: true })
  await fsp.rm(path.join(target, '.pnp.loader.mjs'), { force: true })
  await fsp.rm(path.join(target, '.yarn', 'install-state.gz'), { force: true })
  await fsp.rm(path.join(target, 'node_modules'), { recursive: true, force: true })
  const offline = await run(id, 'yarn-offline-install', `${yarnCommand} install --immutable`, target, { YARN_ENABLE_TELEMETRY: '0', YARN_ENABLE_NETWORK: '0' }, 600000)
  assert(id, offline.exitCode === 0, 'Yarn offline PnP lockfile reinstall after cache population exits 0', { exitCode: offline.exitCode, stderr: offline.stderr.slice(-3000) })
  const lockAfterOffline = sha256(await fsp.readFile(path.join(target, 'yarn.lock')))
  assert(id, lockAfterOffline === lockBefore, 'Yarn lockfile is unchanged by offline reinstall', { before: lockBefore, after: lockAfterOffline })
  const renderOffline = parseJsonText((await run(id, 'yarn-render-offline', `${yarnCommand} node .s3-render.mjs --golden ${sh(path.join(fixturesDir, 'fixtures', 'golden.json'))} --label yarn-offline`, target, { YARN_ENABLE_TELEMETRY: '0' }, 600000)).raw)
  assert(id, renderOffline?.failures === 0 && deepEqual(renderOffline?.cases?.map((entry) => entry.actualSha256), renderOnline?.cases?.map((entry) => entry.actualSha256)), 'Yarn offline reinstall renders the same eight hashes', renderOffline?.cases)
  pmResults.yarn = { lockBefore, lockAfterOnline, lockAfterOffline, pnpProbe, hashes: renderOnline?.cases, offlineHashes: renderOffline?.cases }
}

async function runPackageManagers() {
  await runNpmConsumers()
  await runPnpmConsumers()
  await runYarnConsumers()
  finalize('S3-07')
}

async function fillZeroDependencyScenario() {
  const id = 'S3-04'
  scenario(id)
  addCase(id, 6)
  const packaged = JSON.parse(fs.readFileSync(inspection1.fileMap['package/package.json'].absolute, 'utf8'))
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
    assert(id, !(field in packaged), `packed manifest has no ${field}`, packaged[field] ?? null)
  }
  assert(id, deepEqual(Object.keys(packaged.dependencies ?? {}), []), 'packed manifest dependencies object is empty', packaged.dependencies)
  assert(id, String(packaged.devDependencies?.typescript ?? '').includes(args['ts-current']), 'TypeScript is metadata-only development tooling, not a runtime dependency', packaged.devDependencies?.typescript)
  assert(id, Boolean(packaged.devDependencies?.react) && !packaged.dependencies?.react, 'React appears only as a development dependency', { dev: packaged.devDependencies?.react ?? null, runtime: packaged.dependencies?.react ?? null })

  const npmTree = npmTreeOnlyDitherFace(canonical?.prodTree)
  assert(id, npmTree.only, 'canonical npm --omit=dev tree contains only dither-face', npmTree)
  const npmProdEntries = pmResults.npm?.prodEntries ?? []
  assert(id, deepEqual(npmProdEntries, ['.package-lock.json', 'dither-face']), 'npm production-only install excludes consumer test tools and React', npmProdEntries)
  const pnpmProdDeps = Object.keys((pmResults.pnpm?.prodTree ?? {}).dependencies ?? {}).sort()
  assert(id, deepEqual(pnpmProdDeps, ['dither-face']), 'pnpm production tree contains only dither-face', pnpmProdDeps)
  assert(id, pmResults.yarn?.pnpProbe?.packageDependencies?.length === 0, 'Yarn PnP runtime closure of dither-face is empty', pmResults.yarn?.pnpProbe?.packageDependencies)
  assert(id, pmResults.yarn?.pnpProbe?.react?.resolved === false && pmResults.yarn?.pnpProbe?.reactDom?.resolved === false, 'React and React DOM are absent from the Yarn consumer', pmResults.yarn?.pnpProbe)
  assert(id, pmResults.npm?.hashes?.length === 8 && pmResults.pnpm?.hashes?.length === 8 && pmResults.yarn?.hashes?.length === 8, 'all three package-manager consumers rendered eight fixtures', { npm: pmResults.npm?.hashes?.length, pnpm: pmResults.pnpm?.hashes?.length, yarn: pmResults.yarn?.hashes?.length })
  note(id, `npm production tree: dither-face only; pnpm production tree: dither-face only; Yarn PnP closure: []; React/ReactDOM absent; TypeScript dev-only`)
  finalize(id)
}

function writeScenario(id) {
  return fsp.writeFile(path.join(perScenarioDir, `${id}.json`), `${JSON.stringify(results.scenarios[id], null, 2)}\n`)
}

const scenarioRunner = async (id, fn) => {
  try {
    await fn()
    if (!results.scenarios[id].actualStatus) finalize(id)
  } catch (error) {
    if (!results.scenarios[id].actualStatus) {
      assert(id, false, `${id} harness step failed`, { error: error.stack || String(error) })
      finalize(id)
    }
    throw error
  } finally {
    await writeScenario(id)
  }
}

try {
  await verifyPrelude()
  await scenarioRunner('S3-02', runPackScenario)
  await scenarioRunner('S3-01', runManifestScenario)
  await scenarioRunner('S3-08', runMetadataScenario)
  await installCanonical()
  await scenarioRunner('S3-03', runRenderers)
  await scenarioRunner('S3-05', runExportsScenario)
  await scenarioRunner('S3-06', runTypesScenario)
  await scenarioRunner('S3-07', runPackageManagers)
  await scenarioRunner('S3-04', fillZeroDependencyScenario)
} catch (error) {
  results.fatal = {
    message: error.message,
    stack: error.stack,
    currentScenario,
    at: new Date().toISOString(),
  }
  console.error(error)
} finally {
  for (const id of IDS) {
    if (!results.scenarios[id].actualStatus) {
      assert(id, false, `${id} did not complete`, { completed: false })
      finalize(id)
    }
    await writeScenario(id)
  }
  results.completedAt = new Date().toISOString()
  results.versions = versions
  results.totals = {
    scenarios: IDS.length,
    pass: IDS.filter((id) => results.scenarios[id].actualStatus === 'PASS').length,
    fail: IDS.filter((id) => results.scenarios[id].actualStatus === 'FAIL').length,
    blocked: IDS.filter((id) => results.scenarios[id].actualStatus === 'BLOCKED').length,
    cases: IDS.reduce((sum, id) => sum + results.scenarios[id].cases, 0),
    assertions: IDS.reduce((sum, id) => sum + results.scenarios[id].assertions, 0),
    failures: IDS.reduce((sum, id) => sum + results.scenarios[id].failures, 0),
  }
  results.tarball = results.artifacts.tarballs?.pack1 ?? null
  results.negativeControls = negativeControls
  if (pack1) {
    await fsp.mkdir(path.join(outDir, 'artifacts'), { recursive: true })
    await fsp.copyFile(pack1.file, path.join(outDir, 'artifacts', tarballName))
  }
  await fsp.writeFile(path.join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
  await fsp.writeFile(path.join(outDir, 'environment.json'), `${JSON.stringify({
    sandbox: args.sandbox,
    image: args.image,
    commit: args.commit,
    startedAt,
    completedAt: results.completedAt,
    versions,
    expectedTarball: expected.expectedTarball,
  }, null, 2)}\n`)
  if (inspection1) {
    await fsp.writeFile(path.join(outDir, 'tarball-manifest.json'), `${JSON.stringify({
      file: pack1.file,
      filename: path.basename(pack1.file),
      sha256: inspection1.rawSha256,
      tarStreamSha256: inspection1.tarStreamSha256,
      bytes: inspection1.gzipBytes,
      fileCount: inspection1.files.length,
      names: inspection1.names,
      files: inspection1.files.map(({ path: file, size, sha256: hash }) => ({ path: file, size, sha256: hash })),
    }, null, 2)}\n`)
    await fsp.writeFile(path.join(outDir, 'tarball-manifest.txt'), [
      `name: ${path.basename(pack1.file)}`,
      `sha256: ${inspection1.rawSha256}`,
      `bytes: ${inspection1.gzipBytes}`,
      'files:',
      ...inspection1.names.map((name) => `  ${name}`),
      '',
    ].join('\n'))
  }
  await fsp.writeFile(path.join(outDir, 'negative-controls.json'), `${JSON.stringify({ controls: negativeControls }, null, 2)}\n`)
  if (results.totals.fail > 0 || results.fatal) process.exitCode = 1
}
