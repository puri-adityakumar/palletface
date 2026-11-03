#!/usr/bin/env node
/**
 * Stage 1 qualification harness (matrix S1-01..S1-08).
 *
 * Runs only in the dedicated sandbox. It consumes the tracked repository at the
 * recorded commit, installs from the lockfile, performs the real npm pack
 * lifecycle, installs the produced tarball into a fresh consumer, and then
 * executes the API/direct-render/Unicode/initials/TypeScript/XML scenarios.
 *
 * Every assertion is counted. There are no skips. Evidence is written to
 * results.json plus one JSON file per scenario and command logs.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const IDS = ['S1-01', 'S1-02', 'S1-03', 'S1-04', 'S1-05', 'S1-06', 'S1-07', 'S1-08']
const SEVERITY = { 'S1-01': 'S1', 'S1-02': 'S1', 'S1-03': 'S1', 'S1-04': 'S1', 'S1-05': 'S1', 'S1-06': 'S1', 'S1-07': 'S1', 'S1-08': 'S0' }
const TITLES = {
  'S1-01': 'ESM entry import',
  'S1-02': 'All eight renderers direct render',
  'S1-03': 'Default option equivalence',
  'S1-04': 'Invalid options',
  'S1-05': 'Unicode and normalization',
  'S1-06': 'Initials extraction',
  'S1-07': 'Strict TypeScript declarations',
  'S1-08': 'SVG validity and safe markup',
}
const SVG_NS = 'http://www.w3.org/2000/svg'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key?.startsWith('--') || i + 1 >= argv.length) throw new Error(`bad argument: ${key}`)
    out[key.slice(2)] = argv[i + 1]
  }
  for (const required of ['consumer', 'fixtures', 'out', 'repo', 'source-manifest', 'expected', 'commit', 'sandbox', 'image']) {
    if (!out[required]) throw new Error(`missing --${required}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const consumerDir = path.resolve(args.consumer)
const fixturesDir = path.resolve(args.fixtures)
const outDir = path.resolve(args.out)
const repoDir = path.resolve(args.repo)
const logsDir = path.join(outDir, 'logs')
const perIdDir = path.join(outDir, 'results')
const tarballName = args['tarball-name'] || 'dither-face-0.1.0.tgz'
const startedAt = new Date().toISOString()
const requireFromConsumer = createRequire(path.join(consumerDir, 'package.json'))
let DOMParser = null

const results = {
  stage: 'S1',
  harness: 'scripts/testing/s1-api.mjs',
  harnessSha256: null,
  commit: args.commit,
  sandbox: args.sandbox,
  image: args.image,
  startedAt,
  finishedAt: null,
  expectedStatuses: {},
  expectedSha256: null,
  environment: {},
  sourceManifest: { ok: false, fileCount: 0, sha256: null, failures: [] },
  tarball: { name: tarballName, sha256: null, size: 0, files: [], packageJson: null, declarations: null },
  install: {},
  commands: [],
  integrityFailures: [],
  scenarios: {},
  totals: { scenarios: 0, pass: 0, fail: 0, notRun: 0, cases: 0, assertions: 0, failures: 0 },
}
for (const id of IDS) {
  results.scenarios[id] = {
    id,
    title: TITLES[id],
    severity: SEVERITY[id],
    expectedStatus: null,
    expected: null,
    status: 'NOT RUN',
    cases: 0,
    assertions: 0,
    failures: [],
    notes: [],
    durationMs: 0,
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
function json(value) {
  return JSON.stringify(value, null, 2) + '\n'
}
async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, json(value))
}
function scenario(id) {
  const value = results.scenarios[id]
  if (!value) throw new Error(`unknown scenario ${id}`)
  return value
}
function assert(id, condition, message, detail) {
  const entry = scenario(id)
  entry.assertions += 1
  if (!condition) {
    entry.status = 'FAIL'
    entry.failures.push({ message, detail: normaliseDetail(detail) })
  }
  return Boolean(condition)
}
function normaliseDetail(detail) {
  if (detail === undefined) return undefined
  if (detail instanceof Error) return { name: detail.name, message: detail.message, stack: detail.stack }
  try {
    return JSON.parse(JSON.stringify(detail))
  } catch {
    return String(detail)
  }
}
function addCase(id, count = 1) {
  scenario(id).cases += count
}
function note(id, message) {
  scenario(id).notes.push(message)
}
function expectThrow(id, label, fn, expectedName) {
  let error = null
  try {
    fn()
  } catch (caught) {
    error = caught
  }
  assert(id, error !== null, `${label}: expected a throw`, { error: error ? error.name : null })
  if (error && expectedName) {
    assert(id, error.name === expectedName, `${label}: expected ${expectedName}`, { actual: error.name, message: error.message })
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

async function runCommand(name, command, cwd, timeout = 600000) {
  const start = Date.now()
  const child = spawnSync('/bin/sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: '1', npm_config_audit: 'false', npm_config_fund: 'false' },
  })
  const durationMs = Date.now() - start
  const record = {
    name,
    command,
    cwd,
    exitCode: child.status,
    signal: child.signal,
    timedOut: child.error?.code === 'ETIMEDOUT',
    durationMs,
    logPath: `logs/${name}.log`,
    stdoutBytes: Buffer.byteLength(child.stdout || ''),
    stderrBytes: Buffer.byteLength(child.stderr || ''),
  }
  results.commands.push(record)
  await fsp.mkdir(logsDir, { recursive: true })
  await fsp.writeFile(
    path.join(logsDir, `${name}.log`),
    `$ ${command}\n# cwd=${cwd}\n# exit=${record.exitCode} signal=${record.signal ?? ''} timedOut=${record.timedOut} durationMs=${durationMs}\n\n--- stdout ---\n${child.stdout || ''}\n--- stderr ---\n${child.stderr || ''}\n`,
  )
  return { ...record, stdout: child.stdout || '', stderr: child.stderr || '', error: child.error }
}

function walkFiles(root, relative = '') {
  const entries = []
  const full = path.join(root, relative)
  for (const name of fs.readdirSync(full).sort()) {
    const rel = relative ? path.join(relative, name) : name
    const stat = fs.statSync(path.join(root, rel))
    if (stat.isDirectory()) entries.push(...walkFiles(root, rel))
    else entries.push({ path: rel.split(path.sep).join('/'), size: stat.size, mtimeMs: stat.mtimeMs })
  }
  return entries
}

function serialiseAttrs(element) {
  const attrs = []
  const list = element.attributes
  if (!list) return ''
  for (let i = 0; i < list.length; i++) {
    const attr = list.item(i)
    attrs.push(`${attr.name}=${JSON.stringify(attr.value ?? '')}`)
  }
  return attrs.sort().join(' ')
}

function elementsByName(doc, name) {
  const wanted = name.toLowerCase()
  return [doc.documentElement, ...Array.from(doc.getElementsByTagName('*'))].filter(
    (element) => (element.localName || element.nodeName || '').toLowerCase() === wanted,
  )
}

function structuralErrors(svg) {
  const errors = []
  const stack = []
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z][^>]*>/g
  let match
  while ((match = tagRe.exec(svg))) {
    const tag = match[0]
    if (tag.startsWith('<!--') || tag.startsWith('<![CDATA[') || tag.startsWith('<?')) continue
    const closing = tag.startsWith('</')
    const nameMatch = tag.match(/^<\/?([A-Za-z][A-Za-z0-9._:-]*)/)
    if (!nameMatch) continue
    const name = nameMatch[1].toLowerCase()
    if (closing) {
      const top = stack.pop()
      if (top !== name) errors.push(`mismatched closing tag </${name}>; expected </${top ?? 'none'}>`)
    } else if (!tag.endsWith('/>')) {
      stack.push(name)
    }
  }
  if (stack.length) errors.push(`unclosed tags: ${stack.join(',')}`)
  return errors
}

function inspectSvg(svg, expectedPx) {
  const violations = []
  const parseErrors = []
  const parseMessages = []
  if (typeof svg !== 'string' || svg.length === 0) {
    return { parseErrors: ['not a non-empty string'], violations, parseMessages, root: null, doc: null }
  }
  if (/<!DOCTYPE/i.test(svg)) violations.push('doctype')
  if (/<!ENTITY/i.test(svg)) violations.push('entity')
  parseErrors.push(...structuralErrors(svg))

  let doc = null
  const onError = (level, message) => {
    const text = `${level}: ${message}`
    parseMessages.push(text)
    if (level === 'error' || level === 'fatalError') parseErrors.push(text)
  }
  try {
    doc = new DOMParser({
      onError,
      errorHandler: {
        warning: (message) => onError('warning', message),
        error: (message) => onError('error', message),
        fatalError: (message) => onError('fatalError', message),
      },
    }).parseFromString(svg, 'image/svg+xml')
  } catch (error) {
    parseErrors.push(`parser threw: ${error.message}`)
  }
  const root = doc?.documentElement ?? null
  if (!root) {
    parseErrors.push('no documentElement')
    return { parseErrors, violations, parseMessages, root, doc }
  }
  if ((root.localName || root.nodeName || '').toLowerCase() === 'parsererror') {
    parseErrors.push('parsererror document')
  }
  if ((root.localName || root.nodeName || '').toLowerCase() !== 'svg') {
    violations.push(`root-not-svg:${root.nodeName}`)
  }
  if (root.namespaceURI !== SVG_NS) {
    violations.push(`namespace:${root.namespaceURI ?? 'none'}`)
  }

  const width = root.getAttribute?.('width') ?? ''
  const height = root.getAttribute?.('height') ?? ''
  const viewBox = root.getAttribute?.('viewBox') ?? ''
  if (!width || !height || !Number.isFinite(Number(width)) || !Number.isFinite(Number(height))) {
    violations.push(`dimensions-invalid:${width}:${height}`)
  } else if (expectedPx !== undefined && (Number(width) !== expectedPx || Number(height) !== expectedPx)) {
    violations.push(`dimensions-mismatch:${width}x${height}:expected:${expectedPx}`)
  }
  const box = viewBox.trim().split(/[ ,]+/).map(Number)
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
    violations.push(`viewBox-invalid:${viewBox}`)
  }

  for (const element of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    const local = (element.localName || element.nodeName || '').toLowerCase()
    if (local === 'script') violations.push('script')
    if (local === 'foreignobject') violations.push('foreign-object')
    if (local === 'iframe' || local === 'object' || local === 'embed') violations.push(`active-element:${local}`)
    if (element.namespaceURI && element.namespaceURI !== SVG_NS) {
      violations.push(`foreign-namespace:${local}:${element.namespaceURI}`)
    }
    const attrs = element.attributes
    if (attrs) {
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs.item(i)
        const name = (attr.name || attr.nodeName || '').toLowerCase()
        const value = attr.value ?? ''
        if (/^on/.test(name)) violations.push(`event-handler:${local}@${name}`)
        if (name === 'href' || name === 'xlink:href' || name === 'src') {
          const trimmed = value.trim()
          if (!trimmed.startsWith('#')) violations.push(`external-reference:${local}@${name}:${trimmed.slice(0, 80)}`)
        }
        if (/javascript:/i.test(value)) violations.push(`javascript-uri:${local}@${name}`)
        if (/@import/i.test(value)) violations.push(`external-reference:${local}@${name}:@import`)
        for (const urlMatch of value.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi)) {
          const target = (urlMatch[2] || '').trim()
          if (!target.startsWith('#')) violations.push(`external-reference:${local}@${name}:url(${target.slice(0, 80)})`)
        }
      }
    }
    if (local === 'style') {
      const text = element.textContent || ''
      if (/@import/i.test(text)) violations.push('external-reference:style:@import')
      for (const urlMatch of text.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi)) {
        const target = (urlMatch[2] || '').trim()
        if (!target.startsWith('#')) violations.push(`external-reference:style:url(${target.slice(0, 80)})`)
      }
    }
  }
  return { parseErrors, violations, parseMessages, root, doc }
}

function assertValidSvg(id, label, svg, expectedPx) {
  const info = inspectSvg(svg, expectedPx)
  assert(id, info.root !== null, `${label}: parsed document element exists`)
  assert(id, info.parseErrors.length === 0, `${label}: well-formed XML`, { parseErrors: info.parseErrors, parseMessages: info.parseMessages.slice(0, 5) })
  assert(id, info.violations.length === 0, `${label}: safe markup and dimensions`, { violations: info.violations })
  return info
}

async function main() {
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.mkdir(logsDir, { recursive: true })
  await fsp.mkdir(perIdDir, { recursive: true })

  results.harnessSha256 = sha256(await fsp.readFile(SCRIPT_PATH))
  const expectedRaw = await fsp.readFile(path.resolve(args.expected), 'utf8')
  results.expectedSha256 = sha256(expectedRaw)
  const expected = JSON.parse(expectedRaw)
  for (const id of IDS) {
    const entry = expected.expectations?.[id]
    if (!entry) throw new Error(`expected-results missing ${id}`)
    results.expectedStatuses[id] = entry.expectedStatus
    results.scenarios[id].expectedStatus = entry.expectedStatus
    results.scenarios[id].expected = entry.expected
  }

  // Environment and source-integrity preflight.
  const osRelease = await fsp.readFile('/etc/os-release', 'utf8').catch(() => '')
  const versionCommands = [
    ['node-version', 'node --version'],
    ['npm-version', 'npm --version'],
    ['npx-node-version', "npx -y -p node@24 -c 'node --version'"],
    ['getconf', 'getconf GNU_LIBC_VERSION 2>/dev/null || true'],
    ['uname', 'uname -a'],
  ]
  const versions = {}
  for (const [name, command] of versionCommands) {
    const result = await runCommand(`preflight-${name}`, command, repoDir, 300000)
    versions[name] = (result.stdout || result.stderr || '').trim().split('\n').slice(-1)[0]
  }
  results.environment = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: osRelease.trim(),
    uname: versions.uname,
    npm: versions['npm-version'],
    npxNode24: versions['npx-node-version'],
    sandbox: args.sandbox,
    image: args.image,
    commit: args.commit,
    parser: null,
    typescript: null,
  }

  const manifestRaw = await fsp.readFile(path.resolve(args['source-manifest']), 'utf8')
  const manifest = JSON.parse(manifestRaw)
  const manifestFailures = []
  for (const entry of manifest.files || []) {
    const file = path.join(repoDir, entry.path)
    const bytes = await fsp.readFile(file).catch(() => null)
    if (!bytes) manifestFailures.push(`missing:${entry.path}`)
    else if (sha256(bytes) !== entry.sha256) manifestFailures.push(`hash:${entry.path}`)
  }
  results.sourceManifest = {
    ok: manifestFailures.length === 0,
    fileCount: manifest.files?.length ?? 0,
    sha256: manifest.sha256 ?? null,
    failures: manifestFailures,
  }
  if (manifestFailures.length) {
    results.integrityFailures.push('uploaded source does not match the local source manifest')
  }

  // Actual lifecycle: repository lockfile install, then npm pack.
  const npmCi = await runCommand('01-repo-npm-ci', 'npm ci --no-audit --no-fund', repoDir, 600000)
  if (npmCi.exitCode !== 0) results.integrityFailures.push('repository npm ci failed')

  await fsp.mkdir(consumerDir, { recursive: true })
  await fsp.copyFile(path.join(fixturesDir, 'consumer', 'package.json'), path.join(consumerDir, 'package.json'))
  const pack = await runCommand('02-npm-pack', `npm pack --json --pack-destination ${shellQuote(consumerDir)}`, repoDir, 600000)
  if (pack.exitCode !== 0) results.integrityFailures.push('npm pack lifecycle failed')

  const tarballPath = path.join(consumerDir, tarballName)
  const tarballBytes = await fsp.readFile(tarballPath).catch(() => null)
  if (!tarballBytes) {
    results.integrityFailures.push(`expected tarball not produced: ${tarballName}`)
    throw new Error(`tarball missing: ${tarballName}`)
  }
  results.tarball.sha256 = sha256(tarballBytes)
  results.tarball.size = tarballBytes.length
  const tarList = await runCommand('03-tar-list', `tar -tzf ${shellQuote(tarballPath)}`, consumerDir, 120000)
  results.tarball.files = tarList.stdout.trim().split('\n').filter(Boolean)
  const tarPackage = await runCommand('04-tar-package-json', `tar -xOf ${shellQuote(tarballPath)} package/package.json`, consumerDir, 120000)
  try {
    results.tarball.packageJson = JSON.parse(tarPackage.stdout)
  } catch {
    results.tarball.packageJson = null
  }
  const tarTypes = await runCommand('05-tar-declarations', `tar -xOf ${shellQuote(tarballPath)} package/dist/index.d.ts`, consumerDir, 120000)
  results.tarball.declarations = tarTypes.exitCode === 0 ? tarTypes.stdout : null
  const tarManifest = [
    `name: ${tarballName}`,
    `sha256: ${results.tarball.sha256}`,
    `bytes: ${results.tarball.size}`,
    'files:',
    ...results.tarball.files.map((file) => `  ${file}`),
    '',
  ].join('\n')
  await fsp.writeFile(path.join(outDir, 'tarball-manifest.txt'), tarManifest)
  await fsp.copyFile(tarballPath, path.join(outDir, tarballName)).catch(() => {})

  // Fresh consumer: pinned lockfile first, then npm ci with the lockfile preserved.
  const lockInstall = await runCommand('06-consumer-lockfile', 'npm install --package-lock-only --ignore-scripts --no-audit --no-fund', consumerDir, 600000)
  if (lockInstall.exitCode !== 0) results.integrityFailures.push('consumer package-lock generation failed')
  const lockPath = path.join(consumerDir, 'package-lock.json')
  const lockBefore = await fsp.readFile(lockPath).catch(() => null)
  const consumerCi = await runCommand('07-consumer-npm-ci', 'npm ci --ignore-scripts --no-audit --no-fund', consumerDir, 600000)
  if (consumerCi.exitCode !== 0) results.integrityFailures.push('consumer npm ci failed')
  const lockAfter = await fsp.readFile(lockPath).catch(() => null)
  if (lockBefore && lockAfter) await fsp.copyFile(lockPath, path.join(outDir, 'consumer-package-lock.json'))
  const installedDir = path.join(consumerDir, 'node_modules', 'dither-face')
  const installedStat = await fsp.lstat(installedDir).catch(() => null)
  const installedReal = installedStat ? await fsp.realpath(installedDir) : null
  const installedPkg = installedStat
    ? JSON.parse(await fsp.readFile(path.join(installedDir, 'package.json'), 'utf8'))
    : null
  results.install = {
    lockfilePresent: Boolean(lockBefore),
    lockfilePreservedByNpmCi: Boolean(lockBefore && lockAfter && sha256(lockBefore) === sha256(lockAfter)),
    lockfileSha256: lockBefore ? sha256(lockBefore) : null,
    installedIsSymlink: installedStat ? installedStat.isSymbolicLink() : null,
    installedRealpath: installedReal,
    installedOutsideConsumer: installedReal ? !installedReal.startsWith(await fsp.realpath(consumerDir) + path.sep) : null,
    installedVersion: installedPkg?.version ?? null,
    tarballInstalled: installedPkg?.version === '0.1.0',
  }
  if (!results.install.lockfilePreservedByNpmCi) results.integrityFailures.push('consumer lockfile changed during npm ci')
  if (results.install.installedIsSymlink) results.integrityFailures.push('installed package is a symlink')
  if (results.install.installedOutsideConsumer) results.integrityFailures.push('installed package resolves outside consumer')

  const tscVersion = await runCommand('08-tsc-version', './node_modules/.bin/tsc --version', consumerDir, 120000)
  results.environment.typescript = (tscVersion.stdout || tscVersion.stderr || '').trim()
  DOMParser = requireFromConsumer('@xmldom/xmldom').DOMParser
  results.environment.parser = JSON.parse(await fsp.readFile(path.join(consumerDir, 'node_modules/@xmldom/xmldom/package.json'), 'utf8')).version

  await runS101(consumerDir, installedDir)
  await runS102()
  await runS103()
  await runS104()
  await runS105()
  await runS106()
  await runS107(consumerDir, fixturesDir, tarballPath)
  await runS108()

  for (const id of IDS) {
    const entry = results.scenarios[id]
    if (entry.cases === 0) entry.status = 'NOT RUN'
    else if (entry.assertions === 0) entry.status = 'NOT RUN'
    else if (entry.failures.length > 0) entry.status = 'FAIL'
    else entry.status = 'PASS'
  }
  results.finishedAt = new Date().toISOString()
  results.totals = {
    scenarios: IDS.length,
    pass: IDS.filter((id) => results.scenarios[id].status === 'PASS').length,
    fail: IDS.filter((id) => results.scenarios[id].status === 'FAIL').length,
    notRun: IDS.filter((id) => results.scenarios[id].status === 'NOT RUN').length,
    cases: IDS.reduce((sum, id) => sum + results.scenarios[id].cases, 0),
    assertions: IDS.reduce((sum, id) => sum + results.scenarios[id].assertions, 0),
    failures: IDS.reduce((sum, id) => sum + results.scenarios[id].failures.length, 0),
  }
  for (const id of IDS) await writeJson(path.join(perIdDir, `${id}.json`), results.scenarios[id])
  await writeJson(path.join(outDir, 'environment.json'), results.environment)
  await writeJson(path.join(outDir, 'results.json'), results)
  const failed = results.integrityFailures.length > 0 || results.totals.fail > 0 || results.totals.notRun > 0
  if (failed) process.exitCode = 1
  console.log(JSON.stringify({ totals: results.totals, integrityFailures: results.integrityFailures, tarballSha256: results.tarball.sha256 }, null, 2))
}

function loadPackage() {
  const packagePath = requireFromConsumer.resolve('dither-face')
  return import(pathToFileURL(packagePath).href)
}

function runS101(consumer, installedDir) {
  const id = 'S1-01'
  const start = Date.now()
  const beforeGlobals = new Set(Object.keys(globalThis))
  const beforeTree = walkFiles(installedDir)
  const networkAttempts = []
  const originalFetch = globalThis.fetch
  const originalHttpRequest = http.request
  const originalHttpGet = http.get
  const originalHttpsRequest = https.request
  const originalHttpsGet = https.get
  const originalConnect = net.connect
  const block = (label) => () => {
    networkAttempts.push(label)
    throw new Error(`network blocked by S1-01 guard: ${label}`)
  }
  globalThis.fetch = block('fetch')
  http.request = block('http.request')
  http.get = block('http.get')
  https.request = block('https.request')
  https.get = block('https.get')
  net.connect = block('net.connect')
  let module = null
  let importError = null
  const importStart = Date.now()
  try {
    module = loadPackage()
    // loadPackage returns a promise from dynamic import; the guard must stay active until it settles.
    return module
      .then((loaded) => finish(loaded))
      .catch((error) => finish(null, error))
  } catch (error) {
    importError = error
    return finish(null, error)
  }
  function finish(loaded, error) {
    const importMs = Date.now() - importStart
    globalThis.fetch = originalFetch
    http.request = originalHttpRequest
    http.get = originalHttpGet
    https.request = originalHttpsRequest
    https.get = originalHttpsGet
    net.connect = originalConnect
    addCase(id)
    assert(id, !error && !importError, 'package root imports from the installed tarball', { error: (error || importError)?.message })
    module = loaded || module
    if (!module) {
      scenario(id).durationMs = Date.now() - start
      scenario(id).status = 'FAIL'
      return Promise.resolve()
    }
    const documented = [
      'ditherFace', 'STYLES', 'pixelSprite', 'pixelLetter', 'ditherOrb', 'pixelLandscape',
      'asciiLetter', 'asciiField', 'asciiFace', 'pixelifyLetter', 'fnv1a', 'mulberry32',
      'FONT', 'glyph', 'initialOf', 'BAYER', 'rect', 'MONO', 'esc', 'disc', 'asciiGrid',
      'PASTEL', 'DEEP', 'INK', 'PAPER',
    ]
    for (const name of documented) {
      assert(id, name in module, `documented export ${name} exists`, { exports: Object.keys(module).sort() })
    }
    assert(id, module.STYLES?.length === 8, 'STYLES has eight entries', { length: module.STYLES?.length })
    const expectedSlugs = ['pixel-sprite', 'pixel-letter', 'dither-orb', 'pixel-landscape', 'ascii-letter', 'ascii-field', 'ascii-face', 'pixelify-letter']
    assert(id, JSON.stringify(module.STYLES?.map((entry) => entry.slug)) === JSON.stringify(expectedSlugs), 'STYLES is sheet-ordered', { slugs: module.STYLES?.map((entry) => entry.slug) })
    for (const name of ['ditherFace', 'pixelSprite', 'pixelLetter', 'ditherOrb', 'pixelLandscape', 'asciiLetter', 'asciiField', 'asciiFace', 'pixelifyLetter']) {
      assert(id, typeof module[name] === 'function', `${name} is callable`, { actual: typeof module[name] })
    }
    assert(id, networkAttempts.length === 0, 'import makes no network attempt', { networkAttempts })
    const afterGlobals = new Set(Object.keys(globalThis))
    const addedGlobals = [...afterGlobals].filter((key) => !beforeGlobals.has(key))
    assert(id, addedGlobals.length === 0, 'import adds no global properties', { addedGlobals })
    const afterTree = walkFiles(installedDir)
    assert(id, JSON.stringify(beforeTree) === JSON.stringify(afterTree), 'import does not mutate the installed package tree', { beforeCount: beforeTree.length, afterCount: afterTree.length })
    assert(id, requireFromConsumer.resolve('dither-face').startsWith(consumer + path.sep + 'node_modules' + path.sep), 'package resolves from the consumer node_modules', { resolved: requireFromConsumer.resolve('dither-face') })
    assert(id, importMs < 10000, 'import completes in bounded time', { importMs })
    note(id, `importMs=${importMs}; package=${requireFromConsumer.resolve('dither-face')}`)
    scenario(id).durationMs = Date.now() - start
    return Promise.resolve()
  }
}

function runS102() {
  const id = 'S1-02'
  const start = Date.now()
  return loadPackage().then((module) => {
    const renderers = [
      ['pixelSprite', module.pixelSprite, false],
      ['pixelLetter', module.pixelLetter, true],
      ['ditherOrb', module.ditherOrb, false],
      ['pixelLandscape', module.pixelLandscape, false],
      ['asciiLetter', module.asciiLetter, true],
      ['asciiField', module.asciiField, false],
      ['asciiFace', module.asciiFace, false],
      ['pixelifyLetter', module.pixelifyLetter, true],
    ]
    const seeds = [['alice', 'alice'], ['bob', 'bob'], ['cjk', '用户'], ['empty', '']]
    const px = 64
    for (const [label, fn, letter] of renderers) {
      for (const [seedLabel, seed] of seeds) {
        addCase(id)
        let svg = null
        let error = null
        try {
          svg = fn(seed, px)
        } catch (caught) {
          error = caught
        }
        assert(id, error === null, `${label}/${seedLabel}: does not throw`, { error: error?.message })
        if (svg === null) continue
        assert(id, typeof svg === 'string' && svg.length > 0, `${label}/${seedLabel}: non-empty string`)
        assert(id, svg.startsWith('<svg ') && svg.endsWith('</svg>'), `${label}/${seedLabel}: standalone svg envelope`)
        assertValidSvg(id, `${label}/${seedLabel}`, svg, px)
        if (letter) assert(id, /<text|<rect/.test(svg), `${label}/${seedLabel}: has rendered glyph content`)
      }
    }
    for (const [label, fn, letter] of renderers.filter((entry) => !entry[2])) {
      addCase(id)
      assert(id, fn('alice', 64, 'Zed') === fn('alice', 64), `${label}: ignores a third name argument`, {})
    }
    scenario(id).durationMs = Date.now() - start
  })
}

function runS103() {
  const id = 'S1-03'
  const start = Date.now()
  return loadPackage().then((module) => {
    const seeds = [['alice', 'alice'], ['cjk', '用户'], ['empty', '']]
    for (const [label, seed] of seeds) {
      addCase(id)
      const defaulted = module.ditherFace(seed)
      const emptyOptions = module.ditherFace(seed, {})
      const explicit = module.ditherFace(seed, { style: 'pixel-sprite', px: 80 })
      const direct = module.pixelSprite(seed, 80)
      const explicitPx = module.ditherFace(seed, { px: 80 })
      assert(id, defaulted === emptyOptions, `${label}: empty options equal defaults`)
      assert(id, defaulted === explicit, `${label}: explicit pixel-sprite/80 equals defaults`)
      assert(id, defaulted === direct, `${label}: pixelSprite(seed,80) equals ditherFace defaults`)
      assert(id, defaulted === explicitPx, `${label}: explicit px only equals defaults`)
    }
    const directRenderers = [
      ['pixelSprite', module.pixelSprite], ['pixelLetter', module.pixelLetter], ['ditherOrb', module.ditherOrb],
      ['pixelLandscape', module.pixelLandscape], ['asciiLetter', module.asciiLetter], ['asciiField', module.asciiField],
      ['asciiFace', module.asciiFace], ['pixelifyLetter', module.pixelifyLetter],
    ]
    for (const [label, fn] of directRenderers) {
      addCase(id)
      expectThrow(id, `${label}: missing px`, () => fn('alice'), 'RangeError')
      assert(id, typeof fn('alice', 80) === 'string', `${label}: explicit px succeeds`)
    }
    scenario(id).durationMs = Date.now() - start
  })
}

function runS104() {
  const id = 'S1-04'
  const start = Date.now()
  return loadPackage().then((module) => {
    const invalidSeeds = [null, undefined, 42, true, {}, [], NaN, () => {}]
    for (const value of invalidSeeds) {
      addCase(id)
      const label = `seed=${String(value)}`
      expectThrow(id, `${label} on ditherFace`, () => module.ditherFace(value), 'TypeError')
      for (const [fnLabel, fn] of [['pixelSprite', module.pixelSprite], ['pixelLetter', module.pixelLetter], ['asciiFace', module.asciiFace]]) {
        expectThrow(id, `${label} on ${fnLabel}`, () => fn(value, 80), 'TypeError')
      }
    }
    const invalidNames = [null, 42, true, {}, [], NaN, () => {}]
    for (const value of invalidNames) {
      addCase(id)
      const label = `name=${String(value)}`
      expectThrow(id, `${label} on ditherFace`, () => module.ditherFace('alice', { name: value }), 'TypeError')
      for (const [fnLabel, fn] of [['pixelLetter', module.pixelLetter], ['asciiLetter', module.asciiLetter], ['pixelifyLetter', module.pixelifyLetter]]) {
        expectThrow(id, `${label} on ${fnLabel}`, () => fn('alice', 80, value), 'TypeError')
      }
    }
    const invalidPx = [0, -0, -1, -0.5, NaN, Infinity, -Infinity, '80', null, true, {}, []]
    for (const value of invalidPx) {
      addCase(id)
      const label = `px=${String(value)}`
      expectThrow(id, `${label} on ditherFace`, () => module.ditherFace('alice', { px: value }), 'RangeError')
      expectThrow(id, `${label} on pixelSprite`, () => module.pixelSprite('alice', value), 'RangeError')
    }
    const invalidStyles = ['nope', '', 'Pixel-Sprite', 'pixel sprite', null, 42, true, {}, []]
    for (const value of invalidStyles) {
      addCase(id)
      const stringStyle = typeof value === 'string'
      expectThrow(id, `style=${String(value)}`, () => module.ditherFace('alice', { style: value }), stringStyle ? 'Error' : 'TypeError')
    }
    const invalidOptions = [null, [], 'x', 5, true, () => {}]
    for (const value of invalidOptions) {
      addCase(id)
      expectThrow(id, `options=${String(value)}`, () => module.ditherFace('alice', value), 'TypeError')
    }
    addCase(id)
    assert(id, module.ditherFace('alice', { extraKey: 'ignored', another: 1 }) === module.ditherFace('alice'), 'unknown extra option keys are ignored')
    assert(id, module.ditherFace('alice', { style: undefined, px: undefined, name: undefined }) === module.ditherFace('alice'), 'explicit undefined option values use defaults')
    const acceptedPx = [Number.MIN_VALUE, 1e-9, 0.1, 0.5, 1, 80.5, 1e6, 1e9, 1e12]
    const baseViewBox = new Map()
    for (const px of acceptedPx) {
      addCase(id)
      let svg = null
      let error = null
      try {
        svg = module.ditherFace('alice', { px })
      } catch (caught) {
        error = caught
      }
      assert(id, error === null, `positive finite px ${px}: accepted`, { error: error?.message })
      if (svg === null) continue
      const info = assertValidSvg(id, `px=${px}`, svg, px)
      const viewBox = info.root?.getAttribute?.('viewBox') ?? ''
      if (!baseViewBox.has('alice')) baseViewBox.set('alice', viewBox)
      assert(id, viewBox === baseViewBox.get('alice'), `px=${px}: viewBox independent of size`, { viewBox, expected: baseViewBox.get('alice') })
      const stripped = svg.replace(/ width="[^"]*" height="[^"]*"/, '')
      assert(id, stripped === module.ditherFace('alice').replace(/ width="[^"]*" height="[^"]*"/, ''), `px=${px}: seeded design independent of size`)
      assert(id, module.pixelSprite('alice', px).includes(`width="${px}"`), `px=${px}: direct renderer preserves size`)
    }
    scenario(id).durationMs = Date.now() - start
  })
}

function runS105() {
  const id = 'S1-05'
  const start = Date.now()
  return loadPackage().then((module) => {
    const seeds = [
      ['empty', ''],
      ['space', ' '],
      ['whitespace', ' \t\n\r\u00a0'],
      ['ascii', 'dither-face-42'],
      ['emoji', '😀🎉👩🏽‍💻'],
      ['combining', 'E\u0301e\u0301a\u0308'],
      ['cjk', '用户头像'],
      ['rtl', 'مرحبا שלום'],
      ['punctuation', '!@#$%^&*()<>"\'/\\`~'],
      ['control', '\u0001\u0008\u000b\u000c'],
      ['long10k', 'a'.repeat(10000)],
      ['astral-long', '😀'.repeat(1000)],
    ]
    const renderers = [
      ['pixelSprite', module.pixelSprite], ['pixelLetter', module.pixelLetter], ['ditherOrb', module.ditherOrb],
      ['pixelLandscape', module.pixelLandscape], ['asciiLetter', module.asciiLetter], ['asciiField', module.asciiField],
      ['asciiFace', module.asciiFace], ['pixelifyLetter', module.pixelifyLetter],
    ]
    let slowest = { seed: null, renderer: null, ms: 0 }
    for (const [rendererLabel, fn] of renderers) {
      for (const [seedLabel, seed] of seeds) {
        addCase(id)
        const t0 = Date.now()
        let first = null
        let second = null
        let error = null
        try {
          first = fn(seed, 48)
          second = fn(seed, 48)
        } catch (caught) {
          error = caught
        }
        const ms = Date.now() - t0
        if (ms > slowest.ms) slowest = { seed: seedLabel, renderer: rendererLabel, ms }
        assert(id, error === null, `${rendererLabel}/${seedLabel}: renders without throwing`, { error: error?.message })
        if (first === null) continue
        assert(id, first === second, `${rendererLabel}/${seedLabel}: repeat is deterministic`)
        assert(id, first.length > 0, `${rendererLabel}/${seedLabel}: non-empty output`)
        assertValidSvg(id, `${rendererLabel}/${seedLabel}`, first, 48)
        assert(id, ms < 5000, `${rendererLabel}/${seedLabel}: no crash/hang`, { ms })
      }
    }
    note(id, `slowest double render: ${slowest.renderer}/${slowest.seed} ${slowest.ms}ms`)
    addCase(id)
    const composed = module.ditherFace('é', { style: 'pixel-letter', name: 'é' })
    const decomposed = module.ditherFace('e\u0301', { style: 'pixel-letter', name: 'e\u0301' })
    assert(id, composed.length > 0 && decomposed.length > 0, 'precomposed and decomposed seeds both render (seed normalization is not documented)')
    assert(id, module.ditherFace('e\u0301', { style: 'pixel-letter', name: 'e\u0301' }) === module.ditherFace('e\u0301', { style: 'pixel-letter', name: 'É' }), 'name normalization follows the documented NFD behavior')
    scenario(id).durationMs = Date.now() - start
  })
}

function expectedInitial(name) {
  const stripped = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const match = stripped.match(/[a-z0-9]/i)
  return match ? match[0].toUpperCase() : '?'
}

function rootBackgroundSignature(info) {
  return [
    `root:${info.root.getAttribute('width')}:${info.root.getAttribute('height')}:${info.root.getAttribute('viewBox')}`,
    `clip:${info.root.getElementsByTagName('clipPath')[0]?.getAttribute('id') ?? ''}`,
  ].join('\n')
}

function pixelBackgroundSignature(slug, svg) {
  const info = inspectSvg(svg)
  if (!info.root) return null
  const backgroundRectCount = slug === 'pixel-letter' ? 13 * 13 : 16 * 16
  const parts = [rootBackgroundSignature(info)]
  const rects = elementsByName(info.doc, 'rect').slice(0, backgroundRectCount)
  for (const rect of rects) parts.push(`rect:${serialiseAttrs(rect)}`)
  return parts.join('\n')
}

function asciiBackgroundParts(svg, module) {
  const info = inspectSvg(svg)
  if (!info.root) return null
  const rects = elementsByName(info.doc, 'rect')
  const glyphs = new Set()
  const dots = new Map()
  for (const text of elementsByName(info.doc, 'text')) {
    const key = `${text.getAttribute('x')},${text.getAttribute('y')}`
    if (text.getAttribute('fill') === module.INK) glyphs.add(key)
    else dots.set(key, `${text.getAttribute('fill')}|${text.textContent}`)
  }
  return {
    base: `${rootBackgroundSignature(info)}\nbg:${rects[0] ? serialiseAttrs(rects[0]) : ''}`,
    glyphs,
    dots,
  }
}

function asciiBackgroundComparison(svgA, svgB, module) {
  const a = asciiBackgroundParts(svgA, module)
  const b = asciiBackgroundParts(svgB, module)
  if (!a || !b) return { baseEqual: false, diffs: ['unparsed'] }
  const glyphs = new Set([...a.glyphs, ...b.glyphs])
  const keys = new Set([...a.dots.keys(), ...b.dots.keys()])
  const diffs = []
  for (const key of keys) {
    if (glyphs.has(key)) continue
    if (a.dots.get(key) !== b.dots.get(key)) {
      diffs.push({ cell: key, a: a.dots.get(key) ?? null, b: b.dots.get(key) ?? null })
    }
  }
  return { baseEqual: a.base === b.base, diffs }
}

function runS106() {
  const id = 'S1-06'
  const start = Date.now()
  return loadPackage().then((module) => {
    const cases = [
      ['latin-accent', 'Élodie', 'E'],
      ['combining-accent', 'E\u0301lodie', 'E'],
      ['cjk', '用户', '?'],
      ['arabic', 'محمد', '?'],
      ['emoji-prefix', '😀Alice', 'A'],
      ['punctuation', '!!!', '?'],
      ['single-lower', 'x', 'X'],
      ['extra-spaces', '   bob', 'B'],
      ['digit', '9lives', '9'],
      ['empty', '', '?'],
      ['unsupported', '中文', '?'],
      ['mixed', 'Ω9', '9'],
      ['ring-accent', 'Ångström', 'A'],
      ['markup-prefix', 'A<script>alert(1)</script>', 'A'],
      ['quote-prefix', '"& Zed', 'Z'],
    ]
    const styles = [
      ['pixel-letter', module.pixelLetter],
      ['ascii-letter', module.asciiLetter],
      ['pixelify-letter', module.pixelifyLetter],
    ]
    for (const [styleLabel, fn] of styles) {
      for (const [label, name, expected] of cases) {
        addCase(id)
        assert(id, expectedInitial(name) === expected, `${styleLabel}/${label}: fixture expectation is ${expected}`, { computed: expectedInitial(name) })
        let actual = null
        let reference = null
        let error = null
        try {
          actual = fn('user-7', 80, name)
          reference = fn('user-7', 80, expected)
        } catch (caught) {
          error = caught
        }
        assert(id, error === null, `${styleLabel}/${label}: renders without throwing`, { error: error?.message })
        if (actual === null) continue
        assert(id, actual === reference, `${styleLabel}/${label}: uses documented initial ${expected}`)
        assertValidSvg(id, `${styleLabel}/${label}`, actual, 80)
        if (name.includes('<script')) {
          assert(id, !actual.includes('<script') && !actual.includes('alert(1)'), `${styleLabel}/${label}: name markup is not injected`)
        }
      }
      for (const seed of ['alice', '9user', '用户', '!!!']) {
        addCase(id)
        assert(id, fn(seed, 80) === fn(seed, 80, seed), `${styleLabel}/omitted-name: defaults to seed`)
      }
      addCase(id)
      assert(id, fn('user-7', 80, '') === fn('user-7', 80, '?'), `${styleLabel}/empty-name: falls back to ?`)
      for (const [nameA, nameB] of [['Alice', 'Bob'], ['Zoe', '9lives'], ['Élodie', '用户']]) {
        addCase(id)
        const svgA = fn('seed-background-check', 80, nameA)
        const svgB = fn('seed-background-check', 80, nameB)
        assert(id, svgA !== svgB, `${styleLabel}/${nameA} vs ${nameB}: glyph changes`)
        if (styleLabel === 'ascii-letter') {
          const comparison = asciiBackgroundComparison(svgA, svgB, module)
          assert(id, comparison.baseEqual, `${styleLabel}/${nameA} vs ${nameB}: size, viewBox, clip and background colour unchanged`)
          assert(id, comparison.diffs.length === 0, `${styleLabel}/${nameA} vs ${nameB}: seeded dot field outside both glyphs unchanged`, { diffs: comparison.diffs.slice(0, 20), diffCount: comparison.diffs.length })
        } else {
          const signatureA = pixelBackgroundSignature(styleLabel, svgA)
          const signatureB = pixelBackgroundSignature(styleLabel, svgB)
          assert(id, signatureA !== null, `${styleLabel}/${nameA}: background signature parsed`)
          assert(id, signatureA === signatureB, `${styleLabel}/${nameA} vs ${nameB}: seeded background cells and clip unchanged`)
        }
      }
    }
    scenario(id).durationMs = Date.now() - start
  })
}

async function runS107(consumer, fixtures, tarballPath) {
  const id = 'S1-07'
  const start = Date.now()
  const tsDir = path.join(consumer, 'ts')
  await fsp.mkdir(tsDir, { recursive: true })
  for (const entry of await fsp.readdir(path.join(fixtures, 'ts'))) {
    await fsp.copyFile(path.join(fixtures, 'ts', entry), path.join(tsDir, entry))
  }
  const tarList = results.tarball.files
  addCase(id)
  assert(id, tarList.includes('package/dist/index.d.ts'), 'tarball contains dist/index.d.ts', { files: tarList })
  addCase(id)
  assert(id, tarList.includes('package/dist/index.js'), 'tarball contains dist/index.js', { files: tarList })
  addCase(id)
  assert(id, results.tarball.packageJson?.types === './dist/index.d.ts', 'package.json types points at dist/index.d.ts', { types: results.tarball.packageJson?.types })
  addCase(id)
  const declarations = results.tarball.declarations || ''
  assert(id, /ditherFace/.test(declarations), 'declarations mention ditherFace')
  assert(id, /StyleSlug/.test(declarations), 'declarations export StyleSlug')
  assert(id, /DitherFaceOptions/.test(declarations), 'declarations export DitherFaceOptions')
  assert(id, /STYLES/.test(declarations), 'declarations export STYLES')
  addCase(id)
  assert(id, /\b7\.0\.2\b/.test(results.environment.typescript || ''), 'pinned TypeScript 7.0.2 is active', { version: results.environment.typescript })
  addCase(id)
  assert(id, JSON.parse(await fsp.readFile(path.join(consumer, 'node_modules/@xmldom/xmldom/package.json'), 'utf8')).version === '0.8.11', 'pinned XML parser 0.8.11 is active')

  const valid = await runCommand('10-tsc-valid', './node_modules/.bin/tsc -p ts/tsconfig.valid.json', consumer, 600000)
  addCase(id)
  assert(id, valid.exitCode === 0, 'strict NodeNext valid consumer compiles', { exitCode: valid.exitCode, log: valid.logPath })
  if (valid.exitCode !== 0) note(id, `valid tsc stderr: ${valid.stderr.slice(-2000)}`)

  const invalidCases = [
    ['invalid-style', ['TS2322', 'TS2820']],
    ['invalid-options', ['TS2322', 'TS2353']],
    ['invalid-seed', ['TS2345']],
    ['invalid-readonly', ['TS2540', 'TS2542', 'TS2339']],
  ]
  for (const [name, expectedCodes] of invalidCases) {
    addCase(id)
    const command = `./node_modules/.bin/tsc --noEmit --strict --target ES2022 --lib ES2022 --module NodeNext --moduleResolution NodeNext ts/${name}.ts`
    const result = await runCommand(`11-tsc-${name}`, command, consumer, 600000)
    const output = `${result.stdout}\n${result.stderr}`
    assert(id, result.exitCode !== 0, `${name}: invalid fixture is rejected`, { exitCode: result.exitCode, log: result.logPath })
    assert(id, expectedCodes.some((code) => output.includes(code)), `${name}: rejected with expected TypeScript code`, { expectedCodes, tail: output.slice(-2000) })
    assert(id, !output.includes('TS2307'), `${name}: failure is a typing assertion, not a missing module`, { tail: output.slice(-2000) })
  }
  scenario(id).durationMs = Date.now() - start
}

function runS108() {
  const id = 'S1-08'
  const start = Date.now()
  return loadPackage().then((module) => {
    const seeds = [
      ['alice', 'alice'], ['cjk', '用户'], ['empty', ''], ['emoji-combining', '😀e\u0301'],
      ['rtl', 'مرحبا'], ['script-seed', '<script>alert(1)</script>'],
      ['handler-seed', '"><svg onload=alert(1)>'], ['quote-seed', "' onload='x"],
      ['long10k', 'a'.repeat(10000)],
    ]
    const names = ['Alice', '<script>alert(1)</script>', '"><image href=https://evil.example/x>', 'Élodie', 'A&B']
    const renderers = [
      ['pixelSprite', module.pixelSprite, false], ['pixelLetter', module.pixelLetter, true],
      ['ditherOrb', module.ditherOrb, false], ['pixelLandscape', module.pixelLandscape, false],
      ['asciiLetter', module.asciiLetter, true], ['asciiField', module.asciiField, false],
      ['asciiFace', module.asciiFace, false], ['pixelifyLetter', module.pixelifyLetter, true],
    ]
    let rendered = 0
    for (const [label, fn, letter] of renderers) {
      for (const [seedLabel, seed] of seeds) {
        const nameCases = letter ? names : [undefined]
        for (const name of nameCases) {
          addCase(id)
          rendered += 1
          let svg = null
          let error = null
          try {
            svg = name === undefined ? fn(seed, 64) : fn(seed, 64, name)
          } catch (caught) {
            error = caught
          }
          assert(id, error === null, `${label}/${seedLabel}/${name ?? 'no-name'}: renders`, { error: error?.message })
          if (svg === null) continue
          const info = assertValidSvg(id, `${label}/${seedLabel}/${name ?? 'no-name'}`, svg, 64)
          assert(id, info.root?.namespaceURI === SVG_NS, `${label}/${seedLabel}/${name ?? 'no-name'}: SVG namespace`)
          assert(id, info.root?.getAttribute('viewBox'), `${label}/${seedLabel}/${name ?? 'no-name'}: viewBox present`)
          assert(id, !/<script/i.test(svg) && !/<foreignObject/i.test(svg), `${label}/${seedLabel}/${name ?? 'no-name'}: no raw executable elements`)
          assert(id, !/\son[a-z]+\s*=/i.test(svg), `${label}/${seedLabel}/${name ?? 'no-name'}: no raw event-handler attributes`)
        }
      }
    }
    note(id, `rendered ${rendered} adversarial SVGs`)

    const negatives = [
      ['malformed', '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>', ['malformed']],
      ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', ['script']],
      ['event-handler', '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>', ['event-handler']],
      ['foreign-object', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>', ['foreign-object']],
      ['external-href', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>', ['external-reference']],
      ['data-href', '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml,PHN2Zy8+"/></svg>', ['external-reference']],
      ['javascript-href', '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>', ['javascript-uri']],
      ['external-style', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/x.css);</style></svg>', ['external-reference']],
      ['external-fill', '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://evil.example/p.svg#x)"/></svg>', ['external-reference']],
      ['doctype', '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>', ['doctype', 'entity']],
    ]
    for (const [label, svg, expectedCategories] of negatives) {
      addCase(id)
      const info = inspectSvg(svg)
      const observed = [...info.parseErrors.map(() => 'malformed'), ...info.violations]
      assert(id, expectedCategories.some((category) => observed.some((entry) => entry === category || entry.startsWith(`${category}:`))), `negative control ${label}: checker detects known-bad input`, { expectedCategories, parseErrors: info.parseErrors, violations: info.violations })
    }
    addCase(id)
    const clean = inspectSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>', 10)
    assert(id, clean.parseErrors.length === 0 && clean.violations.length === 0, 'negative control clean SVG is accepted', { parseErrors: clean.parseErrors, violations: clean.violations })
    scenario(id).durationMs = Date.now() - start
  })
}

main().catch(async (error) => {
  results.integrityFailures.push(`harness failure: ${error.stack || error.message}`)
  results.finishedAt = new Date().toISOString()
  await writeJson(path.join(outDir, 'results.json'), results).catch(() => {})
  console.error(error)
  process.exitCode = 1
})
