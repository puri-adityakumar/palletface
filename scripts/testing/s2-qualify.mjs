#!/usr/bin/env node
/**
 * Stage 2 qualification harness (matrix S2-01..S2-08).
 *
 * Runs only in the dedicated sandbox. Consumes the actual packed tarball in a
 * fresh consumer with exact-pinned XML parser, esbuild and Playwright; builds
 * the browser bundle from the installed package; then executes determinism,
 * fresh-process, cross-engine, XML/Unicode, mixed-ID, embedding and pairwise
 * invariance checks. Every assertion is counted; there are no skips.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  buildCrossEngineCases,
  buildEmbeddingCases,
  buildFreshCases,
  buildMixedInstances,
  buildNameCases,
  buildPairwiseCases,
  buildRepeatCombos,
  buildSizeCases,
  buildTransportCases,
  buildUnicodeCases,
  caseKey,
  interleaveCases,
  LETTER_STYLES,
  optionsFor,
  STYLE_ORDER,
} from './s2-cases.mjs'
import {
  canonicalElement,
  corruptSingleByte,
  definitionAnalysis,
  definitionRecords,
  elementsByName,
  invalidXmlChars,
  markupViolations,
  parseSvg,
  pngMetrics,
  rawCompare,
  referenceErrors,
  removeDefs,
  rootInfo,
  serialiseAttrs,
  sha256,
  stripOuterDimensions,
  structuralErrors,
} from './s2-svg.mjs'
import { runBrowserScenarios } from './s2-browser.mjs'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const IDS = ['S2-01', 'S2-02', 'S2-03', 'S2-04', 'S2-05', 'S2-06', 'S2-07', 'S2-08']
const SEVERITY = { 'S2-01': 'S0', 'S2-02': 'S0', 'S2-03': 'S1', 'S2-04': 'S1', 'S2-05': 'S1', 'S2-06': 'S1', 'S2-07': 'S1', 'S2-08': 'S1' }
const TITLES = {
  'S2-01': 'In-process determinism',
  'S2-02': 'Fresh-process determinism',
  'S2-03': 'Cross-engine output',
  'S2-04': 'XML and Unicode embedding',
  'S2-05': 'Mixed repeated IDs',
  'S2-06': 'Inline data URL',
  'S2-07': 'File and HTTP embedding',
  'S2-08': 'Pairwise options and invariance',
}

function parseArgs(argv) {
  const out = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!key?.startsWith('--') || index + 1 >= argv.length) throw new Error(`bad argument: ${key}`)
    out[key.slice(2)] = argv[index + 1]
  }
  for (const required of ['consumer', 'fixtures', 'corpus', 'repo', 'out', 'source-manifest', 'expected', 'commit', 'sandbox', 'image', 'setup']) {
    if (!out[required]) throw new Error(`missing --${required}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const consumerDir = path.resolve(args.consumer)
const fixturesDir = path.resolve(args.fixtures)
const repoDir = path.resolve(args.repo)
const outDir = path.resolve(args.out)
const logsDir = path.join(outDir, 'logs')
const perIdDir = path.join(outDir, 'results')
const tarballName = args['tarball-name'] || 'dither-face-0.1.0.tgz'
const requireFromConsumer = createRequire(path.join(consumerDir, 'package.json'))
const startedAt = new Date().toISOString()
const corpusRaw = await fsp.readFile(path.resolve(args.corpus), 'utf8')
const corpus = JSON.parse(corpusRaw)
const setup = JSON.parse(await fsp.readFile(path.resolve(args.setup), 'utf8'))
const DOMParser = requireFromConsumer('@xmldom/xmldom').DOMParser
const { PNG } = requireFromConsumer('pngjs')

const results = {
  stage: 'S2',
  harness: 'scripts/testing/s2-qualify.mjs',
  harnessSha256: null,
  helperSha256: {},
  commit: args.commit,
  sandbox: args.sandbox,
  image: args.image,
  startedAt,
  finishedAt: null,
  expectedStatuses: {},
  expectedSha256: null,
  corpusSha256: sha256(corpusRaw),
  setup,
  environment: {},
  sourceManifest: { ok: false, fileCount: 0, sha256: null, failures: [] },
  tarball: { name: tarballName, sha256: null, size: 0, files: [], packageJson: null, declarations: null },
  install: {},
  browserBundle: {},
  commands: [],
  integrityFailures: [],
  negativeControls: [],
  scenarios: {},
  browser: null,
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
    blocked: [],
    notes: [],
    durationMs: 0,
  }
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
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
function normaliseDetail(detail) {
  if (detail === undefined) return undefined
  if (detail instanceof Error) return { name: detail.name, message: detail.message, stack: detail.stack }
  try {
    return JSON.parse(JSON.stringify(detail))
  } catch {
    return String(detail)
  }
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
function addCase(id, count = 1) {
  scenario(id).cases += count
}
function blockScenario(id, message, detail) {
  const entry = scenario(id)
  entry.blocked.push({ message, detail: normaliseDetail(detail) })
}
function note(id, message) {
  scenario(id).notes.push(message)
}
function negativeControl(name, detail) {
  results.negativeControls.push({ name, detail: normaliseDetail(detail) })
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
    maxBuffer: 128 * 1024 * 1024,
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

function loadPackage() {
  const packagePath = requireFromConsumer.resolve('dither-face')
  return import(pathToFileURL(packagePath).href)
}

function auditDeterministicSource(installedDir) {
  const tokens = [/Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(/, /performance\.now\s*\(/, /process\.hrtime\s*\(/]
  const hits = []
  for (const file of fs.readdirSync(path.join(installedDir, 'dist')).filter((entry) => entry.endsWith('.js')).sort()) {
    const full = path.join(installedDir, 'dist', file)
    fs.readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
      if (/^\s*(?:\/\*|\*|\/\/|<!)/.test(line)) return
      for (const token of tokens) {
        if (token.test(line)) hits.push({ file: `dist/${file}`, line: index + 1, text: line.trim().slice(0, 160) })
      }
    })
  }
  return hits
}

function assertSvg(id, label, svg, expectedPx) {
  const info = parseSvg(DOMParser, svg)
  assert(id, info.root !== null, `${label}: parsed document element exists`, { parseErrors: info.errors })
  assert(id, info.errors.length === 0, `${label}: well-formed XML`, { parseErrors: info.errors, messages: info.messages.slice(0, 5) })
  assert(id, info.violations.length === 0, `${label}: safe SVG markup`, { violations: info.violations })
  if (info.root) {
    const root = rootInfo(info.root, expectedPx)
    assert(id, root.violations.length === 0, `${label}: root dimensions and viewBox valid`, { violations: root.violations })
    const missing = referenceErrors(info.doc)
    assert(id, missing.length === 0, `${label}: all fragment ID references resolve`, { missing })
  }
  const badChars = invalidXmlChars(svg)
  assert(id, badChars.length === 0, `${label}: no XML-invalid characters in emitted bytes`, { badChars: badChars.slice(0, 20) })
  return info
}

function render(module, testCase) {
  return module.ditherFace(testCase.seed, optionsFor(testCase))
}

async function runS201(module, installedDir) {
  const id = 'S2-01'
  const start = Date.now()
  const combos = buildRepeatCombos(corpus)
  const sourceHits = auditDeterministicSource(installedDir)
  addCase(id)
  assert(id, sourceHits.length === 0, 'installed dist has no executable clock/random API call', { sourceHits })
  const originalRandom = Math.random
  let randomCalls = 0
  Math.random = () => {
    randomCalls += 1
    throw new Error('Math.random called during render')
  }
  const rows = []
  try {
    for (const combo of combos) {
      let firstSha = null
      let unique = new Set()
      for (let call = 0; call < 100; call += 1) {
        addCase(id)
        let svg = null
        let error = null
        try {
          svg = render(module, combo)
        } catch (caught) {
          error = caught
        }
        assert(id, error === null, `${combo.style}/${combo.seed}/${combo.variant}: call ${call} does not throw`, { error: error?.message })
        if (svg === null) continue
        assert(id, svg.length > 0 && svg.startsWith('<svg ') && svg.endsWith('</svg>'), `${combo.style}/${combo.seed}/${combo.variant}: call ${call} standalone svg`)
        const hash = sha256(svg)
        if (firstSha === null) firstSha = hash
        unique.add(hash)
        assert(id, hash === firstSha, `${combo.style}/${combo.seed}/${combo.variant}: call ${call} byte hash equals call 0`, { hash, firstSha })
        if (call < 3) assertSvg(id, `${combo.style}/${combo.seed}/${combo.variant}/call${call}`, svg, combo.px)
      }
      rows.push({ ...combo, calls: 100, sha256: firstSha, uniqueHashes: unique.size })
    }
  } finally {
    Math.random = originalRandom
  }
  addCase(id)
  assert(id, randomCalls === 0, 'Math.random is never called during 3,200 renders', { randomCalls })
  note(id, `${combos.length} combinations × 100 calls = ${combos.length * 100} rendered SVGs; unique-hash set per combination must be 1`)
  await writeJson(path.join(outDir, 'S2-01-repeats.json'), { combos: rows, randomCalls, sourceHits })
  scenario(id).durationMs = Date.now() - start
}

async function runS202(module) {
  const id = 'S2-02'
  const start = Date.now()
  const cases = buildFreshCases(corpus)
  const mainHashes = new Map()
  for (const testCase of cases) {
    addCase(id)
    const svg = render(module, testCase)
    assert(id, typeof svg === 'string' && svg.length > 0, `harness process: ${testCase.style}/${testCase.seed} renders`, {})
    mainHashes.set(caseKey(testCase), sha256(svg))
  }
  const freshDir = path.join(outDir, 'fresh')
  await fsp.mkdir(freshDir, { recursive: true })
  const runs = [
    { label: 'node22-run1', major: 22 },
    { label: 'node22-run2', major: 22 },
    { label: 'node24-run1', major: 24 },
    { label: 'node24-run2', major: 24 },
  ]
  const runRows = []
  for (const run of runs) {
    const remoteOut = path.join(freshDir, `${run.label}.json`)
    const inner = `node scripts/testing/s2-fresh-process.mjs --consumer ${consumerDir} --corpus ${path.resolve(args.corpus)} --out ${remoteOut}`
    const command = `npx -y -p node@${run.major} -c ${shellQuote(inner)}`
    const result = await runCommand(`S2-02-${run.label}`, command, repoDir, 600000)
    addCase(id)
    assert(id, result.exitCode === 0, `${run.label}: fresh Node process exits 0`, { exitCode: result.exitCode, stderr: result.stderr.slice(-2000), log: result.logPath })
    let payload = null
    try {
      payload = JSON.parse(await fsp.readFile(remoteOut, 'utf8'))
    } catch (error) {
      assert(id, false, `${run.label}: fresh-process result JSON is readable`, { error: error.message })
    }
    if (!payload) {
      runRows.push({ ...run, ok: false })
      continue
    }
    addCase(id)
    assert(id, payload.process.major === run.major, `${run.label}: process is Node ${run.major}`, { version: payload.process.version })
    addCase(id)
    assert(id, payload.guard === 'pass', `${run.label}: no clock/random call during render`, { guard: payload.guard })
    addCase(id)
    assert(id, payload.cases.length === cases.length, `${run.label}: renders all ${cases.length} fixed cases`, { actual: payload.cases.length })
    addCase(id)
    assert(id, payload.corpusSha256 === results.corpusSha256, `${run.label}: corpus hash matches harness`, { actual: payload.corpusSha256, expected: results.corpusSha256 })
    const payloadMap = new Map(payload.cases.map((entry) => [entry.key, entry.sha256]))
    let differing = 0
    for (const testCase of cases) {
      addCase(id)
      const expected = mainHashes.get(caseKey(testCase))
      const actual = payloadMap.get(caseKey(testCase))
      if (expected !== actual) differing += 1
      assert(id, expected === actual, `${run.label}: hash equals harness for ${testCase.style}/${testCase.seed}`, { expected, actual })
    }
    runRows.push({
      ...run,
      version: payload.process.version,
      guard: payload.guard,
      cases: payload.cases.length,
      differing,
      sample: payload.cases.slice(0, 3),
    })
  }
  const union = new Set(runRows.filter((row) => row.version).map((row) => row.cases).concat([cases.length]))
  addCase(id)
  assert(id, new Set([...mainHashes.values()]).size > 1, 'fixed fresh corpus produces more than one distinct hash (not a constant-output oracle)', { distinct: new Set([...mainHashes.values()]).size })
  addCase(id)
  assert(id, runRows.every((row) => row.differing === 0), 'every fresh-process hash equals the harness process', { runRows })
  note(id, `fresh processes=${runRows.length}; cases/process=${cases.length}; versions=${runRows.map((row) => `${row.label}:${row.version ?? 'missing'}`).join(', ')}`)
  await writeJson(path.join(outDir, 'fresh-processes.json'), { cases: cases.length, mainDistinct: new Set([...mainHashes.values()]).size, runs: runRows, unionCaseCounts: [...union] })
  scenario(id).durationMs = Date.now() - start
}

async function runS204(module) {
  const id = 'S2-04'
  const start = Date.now()
  const cases = buildUnicodeCases(corpus)
  const rows = []
  for (const testCase of cases) {
    addCase(id)
    let svg = null
    let error = null
    try {
      svg = render(module, testCase)
    } catch (caught) {
      error = caught
    }
    assert(id, error === null, `${testCase.style}/${testCase.label}: renders adversarial seed/name without throwing`, { seed: testCase.seed, name: testCase.name, error: error?.message })
    if (svg === null) continue
    const info = assertSvg(id, `${testCase.style}/${testCase.label}`, svg, testCase.px)
    assert(id, !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(svg), `${testCase.style}/${testCase.label}: no C0 control survives into markup`, { sample: svg.slice(0, 120) })
    assert(id, !/<script/i.test(svg) && !/\son[a-z]+\s*=/i.test(svg), `${testCase.style}/${testCase.label}: no executable markup from adversarial input`, {})
    rows.push({
      style: testCase.style,
      label: testCase.label,
      seedSha: sha256(testCase.seed),
      nameSha: testCase.name === null ? null : sha256(testCase.name),
      px: testCase.px,
      sha256: sha256(svg),
      parseErrors: info.errors.length,
      invalidChars: invalidXmlChars(svg).length,
      missingReferences: info.doc ? referenceErrors(info.doc).length : null,
    })
  }

  const clean = module.ditherFace('control-clean', { style: 'pixel-sprite', px: 32 })
  const cleanInfo = parseSvg(DOMParser, clean)
  addCase(id)
  assert(id, cleanInfo.errors.length === 0 && cleanInfo.violations.length === 0 && referenceErrors(cleanInfo.doc).length === 0, 'negative control: clean generated SVG passes every XML check', {})

  const withNul = clean.replace('</svg>', '\u0000</svg>')
  const nulBad = invalidXmlChars(withNul)
  addCase(id)
  assert(id, nulBad.length > 0, 'negative control: NUL injection is rejected by the invalid-character scanner', { nulBad })
  negativeControl('S2-04-nul-injection', { detected: nulBad.length > 0, nulBad })

  const noDefs = removeDefs(clean)
  const noDefsInfo = parseSvg(DOMParser, noDefs)
  const noDefsMissing = referenceErrors(noDefsInfo.doc)
  addCase(id)
  assert(id, noDefsInfo.errors.length === 0, 'negative control: removing defs leaves well-formed XML (parser alone would miss it)', { parseErrors: noDefsInfo.errors })
  addCase(id)
  assert(id, noDefsMissing.length > 0, 'negative control: missing-definition reference checker rejects the removed <defs> block', { missing: noDefsMissing })
  negativeControl('S2-04-missing-defs', { parseErrors: noDefsInfo.errors.length, missing: noDefsMissing })

  const malformed = clean.slice(0, -6)
  addCase(id)
  assert(id, structuralErrors(malformed).length > 0, 'negative control: malformed XML is rejected by the tag-balance checker', { errors: structuralErrors(malformed) })
  negativeControl('S2-04-malformed', { errors: structuralErrors(malformed) })

  note(id, `adversarial rendering cases=${cases.length}; seed/name bytes hashed in evidence to avoid logging raw controls`)
  await writeJson(path.join(outDir, 'S2-04-xml-unicode.json'), { cases: rows, negativeControls: results.negativeControls })
  scenario(id).durationMs = Date.now() - start
}

async function runS205(module) {
  const id = 'S2-05'
  const start = Date.now()
  const instances = buildMixedInstances(corpus)
  const svgs = []
  const documents = []
  const rows = []
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]
    addCase(id)
    const svg = render(module, instance)
    svgs.push(svg)
    const info = assertSvg(id, `mixed/${index}/${instance.style}@${instance.px}`, svg, instance.px)
    documents.push({ label: `mixed-${index}`, doc: info.doc })
    const definitions = info.doc ? definitionRecords(info.doc) : []
    assert(id, definitions.length >= 1, `mixed/${index}: has at least one deterministic definition`, { definitions: definitions.map((entry) => entry.id) })
    rows.push({
      index,
      style: instance.style,
      seed: instance.seed,
      name: instance.name,
      px: instance.px,
      sha256: sha256(svg),
      ids: definitions.map((entry) => ({ id: entry.id, tag: entry.tag, signatureSha256: sha256(entry.signature) })),
      missingReferences: info.doc ? referenceErrors(info.doc).length : null,
    })
  }
  const analysis = definitionAnalysis(documents)
  addCase(id)
  assert(id, analysis.conflicts.length === 0, 'no conflicting definition exists for any repeated ID across the mixed corpus', { conflicts: analysis.conflicts })
  addCase(id)
  assert(id, analysis.withinDocumentConflicts.length === 0, 'no conflicting definition exists for any duplicate ID within one document', { conflicts: analysis.withinDocumentConflicts })
  addCase(id)
  assert(id, analysis.duplicateIds.length > 0, 'the mixed corpus actually contains repeated IDs (equivalence is tested, not vacuous)', { duplicateIds: analysis.duplicateIds.slice(0, 5) })
  note(id, `${instances.length} instances; ${analysis.definitionCount} definitions; ${analysis.idCount} distinct IDs; ${analysis.duplicateIds.length} repeated IDs; no uniqueness asserted`)
  await writeJson(path.join(outDir, 'S2-05-definitions.json'), {
    instances: rows,
    idCount: analysis.idCount,
    definitionCount: analysis.definitionCount,
    duplicateIds: analysis.duplicateIds,
    conflicts: analysis.conflicts,
    withinDocumentConflicts: analysis.withinDocumentConflicts,
  })
  scenario(id).durationMs = Date.now() - start
  return { instances, svgs, analysis }
}

function pixelBackgroundSignature(svg, backgroundRectCount) {
  const info = parseSvg(DOMParser, svg)
  if (!info.root) return null
  const parts = [
    `root:${info.root.getAttribute('width')}:${info.root.getAttribute('height')}:${info.root.getAttribute('viewBox')}`,
    `clip:${canonicalElement(elementsByName(info.doc, 'clipPath')[0] ?? info.root)}`,
  ]
  for (const rect of elementsByName(info.doc, 'rect').slice(0, backgroundRectCount)) parts.push(`rect:${serialiseAttrs(rect)}`)
  return parts.join('\n')
}

function asciiBackgroundComparison(svgA, svgB, ink) {
  const parts = (svg) => {
    const info = parseSvg(DOMParser, svg)
    if (!info.root) return null
    const rects = elementsByName(info.doc, 'rect')
    const glyphs = new Set()
    const dots = new Map()
    for (const text of elementsByName(info.doc, 'text')) {
      const key = `${text.getAttribute('x')},${text.getAttribute('y')}`
      if (text.getAttribute('fill') === ink) glyphs.add(key)
      else dots.set(key, `${text.getAttribute('fill')}|${text.textContent}`)
    }
    return {
      base: [
        `root:${info.root.getAttribute('width')}:${info.root.getAttribute('height')}:${info.root.getAttribute('viewBox')}`,
        `clip:${canonicalElement(elementsByName(info.doc, 'clipPath')[0] ?? info.root)}`,
        `bg:${rects[0] ? serialiseAttrs(rects[0]) : ''}`,
      ].join('\n'),
      glyphs,
      dots,
    }
  }
  const a = parts(svgA)
  const b = parts(svgB)
  if (!a || !b) return { baseEqual: false, diffs: ['unparsed'] }
  const glyphs = new Set([...a.glyphs, ...b.glyphs])
  const keys = new Set([...a.dots.keys(), ...b.dots.keys()])
  const diffs = []
  for (const key of keys) {
    if (glyphs.has(key)) continue
    if (a.dots.get(key) !== b.dots.get(key)) diffs.push({ cell: key, a: a.dots.get(key) ?? null, b: b.dots.get(key) ?? null })
  }
  return { baseEqual: a.base === b.base, diffs }
}

async function runS208(module) {
  const id = 'S2-08'
  const start = Date.now()
  const ink = module.INK

  // Pairwise table, schedule A and interleaved schedule B.
  const scheduleA = buildPairwiseCases(corpus)
  const scheduleB = interleaveCases(scheduleA, corpus)
  const hashesA = new Map()
  for (const testCase of scheduleA) {
    const svg = render(module, testCase)
    const hash = sha256(svg)
    hashesA.set(caseKey(testCase), hash)
  }
  const table = []
  const hashesB = new Map()
  const bIndexByKey = new Map()
  scheduleB.forEach((row, index) => {
    bIndexByKey.set(caseKey(row.testCase), index)
    const hash = sha256(render(module, row.testCase))
    hashesB.set(caseKey(row.testCase), hash)
  })
  scheduleA.forEach((testCase, index) => {
    addCase(id)
    const key = caseKey(testCase)
    const a = hashesA.get(key)
    const b = hashesB.get(key)
    assert(id, a === b, `pairwise interleaving: ${testCase.style}/${testCase.seed}/${testCase.name ?? '-'}@${testCase.px} repeat equal`, { scheduleA: index, scheduleB: bIndexByKey.get(key), a, b })
    table.push({
      scheduleAIndex: index,
      scheduleBIndex: bIndexByKey.get(key),
      style: testCase.style,
      seed: testCase.seed,
      name: testCase.name,
      px: testCase.px,
      scheduleASha256: a,
      scheduleBSha256: b,
      equal: a === b,
    })
  })
  addCase(id)
  assert(id, scheduleA.map(caseKey).join('\n') !== scheduleB.map((row) => caseKey(row.testCase)).join('\n'), 'schedule B is a genuinely different interleaved call order', {})
  note(id, `pairwise table ${table.length} rows; schedule A style-major, schedule B seed-major`)
  await writeJson(path.join(outDir, 'S2-08-pairwise-table.json'), { rows: table })

  // Size invariance: remove only root width/height.
  const sizeRows = []
  const sizeCases = buildSizeCases(corpus)
  for (const style of STYLE_ORDER) {
    for (const seed of corpus.s2_08.sizeSeeds) {
      let base = null
      const variants = []
      for (const px of corpus.s2_08.sizePx) {
        const testCase = sizeCases.find((entry) => entry.style === style && entry.seed === seed && entry.px === px)
        addCase(id)
        const svg = render(module, testCase)
        const stripped = stripOuterDimensions(svg)
        if (base === null) base = stripped
        assert(id, stripped === base, `size invariance: ${style}/${seed} at ${px}px equals design at ${corpus.s2_08.sizePx[0]}px after removing only root width/height`, { px, viewBox: parseSvg(DOMParser, svg).root?.getAttribute('viewBox') })
        const info = parseSvg(DOMParser, svg)
        assert(id, info.root?.getAttribute('viewBox') === parseSvg(DOMParser, render(module, { ...testCase, px: corpus.s2_08.sizePx[0] })).root?.getAttribute('viewBox'), `size invariance: ${style}/${seed} at ${px}px keeps the viewBox`, {})
        variants.push({ px, sha256: sha256(svg), strippedSha256: sha256(stripped), width: info.root?.getAttribute('width'), height: info.root?.getAttribute('height') })
      }
      sizeRows.push({ style, seed, variants })
    }
  }
  await writeJson(path.join(outDir, 'S2-08-size-invariance.json'), { rows: sizeRows })

  // Name invariance: pixel layers and ASCII dots outside the union of glyphs.
  const nameCases = buildNameCases(corpus)
  const nameRows = []
  for (const style of STYLE_ORDER) {
    const styleRows = nameCases.filter((entry) => entry.style === style)
    if (!LETTER_STYLES.has(style)) {
      for (const testCase of styleRows) {
        addCase(id)
        const withName = render(module, testCase)
        const withoutName = module.ditherFace(testCase.seed, { style, px: testCase.px })
        assert(id, withName === withoutName, `name invariance: non-letter ${style}/${testCase.seed} ignores name`, {})
      }
      nameRows.push({ style, mode: 'name-ignored', cases: styleRows.length })
      continue
    }
    const baseline = styleRows[0]
    const baselineSvg = render(module, baseline)
    const fullHashes = new Set()
    for (const testCase of styleRows) {
      addCase(id)
      const svg = render(module, testCase)
      fullHashes.add(sha256(svg))
      if (style === 'ascii-letter') {
        const comparison = asciiBackgroundComparison(baselineSvg, svg, ink)
        assert(id, comparison.baseEqual, `name invariance: ascii-letter base/clip/background unchanged for name ${JSON.stringify(testCase.name)}`, { comparison })
        assert(id, comparison.diffs.length === 0, `name invariance: ascii-letter seeded dots outside both glyphs unchanged for name ${JSON.stringify(testCase.name)}`, { diffs: comparison.diffs.slice(0, 20), diffCount: comparison.diffs.length })
      } else {
        const count = style === 'pixel-letter' ? 13 * 13 : 16 * 16
        const a = pixelBackgroundSignature(baselineSvg, count)
        const b = pixelBackgroundSignature(svg, count)
        assert(id, a !== null && b !== null, `name invariance: ${style} background parsed for name ${JSON.stringify(testCase.name)}`, {})
        assert(id, a === b, `name invariance: ${style} background rect layer unchanged for name ${JSON.stringify(testCase.name)}`, {})
      }
    }
    addCase(id)
    assert(id, fullHashes.size >= 2, `name invariance: ${style} name actually changes the glyph across the targeted set`, { fullHashes: [...fullHashes] })
    nameRows.push({ style, mode: style === 'ascii-letter' ? 'ascii-union' : 'pixel-layer', cases: styleRows.length, fullDistinctHashes: fullHashes.size })
  }

  // Q-001 exact migration fixture and all eight preview fixtures.
  const preview = JSON.parse(await fsp.readFile(path.join(repoDir, 'src/fixtures/preview.json'), 'utf8'))
  const fixedRows = []
  for (const record of preview.records) {
    addCase(id)
    const svg = module.ditherFace(record.seed, { style: record.style, px: 80, name: record.name })
    const hash = sha256(svg)
    assert(id, hash === record.sha256, `fixed fixture: ${record.style} exact SVG SHA-256`, { expected: record.sha256, actual: hash })
    fixedRows.push({ style: record.style, seed: record.seed, name: record.name, px: 80, expectedSha256: record.sha256, actualSha256: hash, equal: hash === record.sha256 })
  }
  const q001Svg = module.ditherFace(corpus.fixed.q001Seed, { style: corpus.fixed.q001Style, px: corpus.fixed.q001Px, name: corpus.fixed.q001Name })
  const q001Hash = sha256(q001Svg)
  addCase(id)
  assert(id, q001Hash === corpus.fixed.q001CurrentSha256, 'Q-001 migration: current ascii-letter exact fixture hash matches the tracked post-fix record', { expected: corpus.fixed.q001CurrentSha256, actual: q001Hash })
  addCase(id)
  assert(id, corpus.fixed.q001CurrentSha256 !== corpus.fixed.q001PreviousSha256, 'Q-001 migration: old and new fixture hashes are distinct', {})
  addCase(id)
  assert(id, q001Hash !== corpus.fixed.q001PreviousSha256, 'Q-001 migration: current output is not the superseded pre-fix bytes', { actual: q001Hash, previous: corpus.fixed.q001PreviousSha256 })
  note(id, `pairwise rows=${table.length}; size variants=${sizeCases.length}; name cases=${nameCases.length}; fixed fixtures=${fixedRows.length}; Q-001=${q001Hash}`)
  await writeJson(path.join(outDir, 'S2-08-name-invariance.json'), { rows: nameRows, q001: { current: q001Hash, previous: corpus.fixed.q001PreviousSha256, expectedCurrent: corpus.fixed.q001CurrentSha256 } })
  await writeJson(path.join(outDir, 'S2-08-fixed-fixtures.json'), { records: fixedRows, q001: { current: q001Hash, previous: corpus.fixed.q001PreviousSha256 } })
  scenario(id).durationMs = Date.now() - start
}

async function main() {
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.mkdir(logsDir, { recursive: true })
  await fsp.mkdir(perIdDir, { recursive: true })

  results.harnessSha256 = sha256(await fsp.readFile(SCRIPT_PATH))
  for (const helper of ['s2-cases.mjs', 's2-svg.mjs', 's2-browser.mjs', 's2-fresh-process.mjs']) {
    results.helperSha256[helper] = sha256(await fsp.readFile(path.join(path.dirname(SCRIPT_PATH), helper)))
  }
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

  // Environment preflight.
  const osRelease = await fsp.readFile('/etc/os-release', 'utf8').catch(() => '')
  const versions = {}
  for (const [name, command] of [
    ['node', 'node --version'],
    ['npm', 'npm --version'],
    ['npx22', "npx -y -p node@22 -c 'node --version'"],
    ['npx24', "npx -y -p node@24 -c 'node --version'"],
    ['uname', 'uname -a'],
    ['libc', 'getconf GNU_LIBC_VERSION 2>/dev/null || true'],
  ]) {
    const result = await runCommand(`preflight-${name}`, command, repoDir, 600000)
    versions[name] = (result.stdout || result.stderr || '').trim().split('\n').slice(-1)[0]
  }
  results.environment = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: osRelease.trim(),
    uname: versions.uname,
    libc: versions.libc,
    npm: versions.npm,
    npxNode22: versions.npx22,
    npxNode24: versions.npx24,
    sandbox: args.sandbox,
    image: args.image,
    commit: args.commit,
    parser: null,
    esbuild: null,
    playwright: null,
    pngjs: null,
    browsers: null,
  }

  // Uploaded-source integrity.
  const manifest = JSON.parse(await fsp.readFile(path.resolve(args['source-manifest']), 'utf8'))
  const manifestFailures = []
  for (const entry of manifest.files || []) {
    const bytes = await fsp.readFile(path.join(repoDir, entry.path)).catch(() => null)
    if (!bytes) manifestFailures.push(`missing:${entry.path}`)
    else if (sha256(bytes) !== entry.sha256) manifestFailures.push(`hash:${entry.path}`)
  }
  results.sourceManifest = {
    ok: manifestFailures.length === 0,
    fileCount: manifest.files?.length ?? 0,
    sha256: manifest.sha256 ?? null,
    failures: manifestFailures,
  }
  if (manifestFailures.length) results.integrityFailures.push('uploaded source does not match the local source manifest')
  addCase('S2-01')
  assert('S2-01', manifestFailures.length === 0, 'uploaded tracked source matches the recorded manifest', { failures: manifestFailures.slice(0, 10) })

  // Consumer fixture and tarball.
  const consumerFixturePath = path.join(fixturesDir, 'consumer', 'package.json')
  const consumerFixture = await fsp.readFile(consumerFixturePath)
  const consumerActual = await fsp.readFile(path.join(consumerDir, 'package.json'))
  addCase('S2-01')
  assert('S2-01', sha256(consumerFixture) === sha256(consumerActual), 'consumer package.json equals the tracked pinned fixture', {})
  addCase('S2-03')
  assert('S2-03', setup.tarball?.sha256 === sha256(await fsp.readFile(path.join(consumerDir, tarballName)).catch(() => Buffer.alloc(0))), 'tarball SHA-256 matches the setup/real pack record', { setup: setup.tarball?.sha256 })
  const tarballPath = path.join(consumerDir, tarballName)
  const tarballBytes = await fsp.readFile(tarballPath)
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
  await fsp.writeFile(path.join(outDir, 'tarball-manifest.txt'), [
    `name: ${tarballName}`,
    `sha256: ${results.tarball.sha256}`,
    `bytes: ${results.tarball.size}`,
    'files:',
    ...results.tarball.files.map((file) => `  ${file}`),
    '',
  ].join('\n'))
  await fsp.copyFile(tarballPath, path.join(outDir, tarballName))

  // Re-run consumer npm ci; the lockfile generated at setup must survive byte-for-byte.
  const lockPath = path.join(consumerDir, 'package-lock.json')
  const lockBefore = await fsp.readFile(lockPath)
  const consumerCi = await runCommand('07-consumer-npm-ci', 'npm ci --ignore-scripts --no-audit --no-fund', consumerDir, 600000)
  addCase('S2-01')
  assert('S2-01', consumerCi.exitCode === 0, 'fresh consumer npm ci exits 0', { exitCode: consumerCi.exitCode })
  const lockAfter = await fsp.readFile(lockPath)
  await fsp.copyFile(lockPath, path.join(outDir, 'consumer-package-lock.json'))
  const installedDir = path.join(consumerDir, 'node_modules', 'dither-face')
  const installedStat = await fsp.lstat(installedDir).catch(() => null)
  const installedReal = installedStat ? await fsp.realpath(installedDir) : null
  const installedPkg = installedStat ? JSON.parse(await fsp.readFile(path.join(installedDir, 'package.json'), 'utf8')) : null
  const lockJson = JSON.parse(await fsp.readFile(lockPath, 'utf8'))
  const lockEntry = lockJson.packages?.['node_modules/dither-face'] ?? null
  const dependencySpec = JSON.parse(await fsp.readFile(consumerFixturePath, 'utf8')).dependencies['dither-face']
  results.install = {
    lockfilePresent: Boolean(lockBefore),
    lockfileSha256Before: sha256(lockBefore),
    lockfileSha256After: sha256(lockAfter),
    lockfilePreservedByNpmCi: sha256(lockBefore) === sha256(lockAfter),
    lockfileMatchesSetup: setup.consumer?.lockAfterSha256 === sha256(lockAfter),
    dependencySpec,
    usesTarballSpec: dependencySpec === 'file:./dither-face-0.1.0.tgz' && !/^(link|workspace|portal):/.test(dependencySpec),
    lockEntryVersion: lockEntry?.version ?? null,
    installedIsSymlink: installedStat ? installedStat.isSymbolicLink() : null,
    installedRealpath: installedReal,
    installedOutsideConsumer: installedReal ? !installedReal.startsWith(await fsp.realpath(consumerDir) + path.sep) : null,
    installedVersion: installedPkg?.version ?? null,
    installedSize: installedPkg?.size ?? null,
  }
  addCase('S2-03')
  assert('S2-03', results.install.lockfilePreservedByNpmCi && results.install.lockfileMatchesSetup, 'consumer lockfile is retained byte-for-byte by npm ci and matches setup', { before: results.install.lockfileSha256Before, after: results.install.lockfileSha256After, setup: setup.consumer?.lockAfterSha256 })
  addCase('S2-03')
  assert('S2-03', results.install.usesTarballSpec && results.install.lockEntryVersion === '0.1.0', 'consumer installs the tarball (not an alias/link/workspace)', { dependencySpec, lockEntryVersion: lockEntry?.version })
  addCase('S2-03')
  assert('S2-03', !results.install.installedIsSymlink && !results.install.installedOutsideConsumer && results.install.installedVersion === '0.1.0', 'installed dither-face is a real 0.1.0 copy inside the consumer', { install: results.install })
  if (!results.install.lockfilePreservedByNpmCi) results.integrityFailures.push('consumer lockfile changed during npm ci')
  if (results.install.installedIsSymlink) results.integrityFailures.push('installed package is a symlink')
  if (results.install.installedOutsideConsumer) results.integrityFailures.push('installed package resolves outside consumer')

  // Installed package equals the tarball's declaration/entry bytes.
  const installedIndexSha = sha256(await fsp.readFile(path.join(installedDir, 'dist', 'index.js')))
  const tarIndex = await runCommand('06-tar-index', `tar -xOf ${shellQuote(tarballPath)} package/dist/index.js`, consumerDir, 120000)
  addCase('S2-03')
  assert('S2-03', tarIndex.exitCode === 0 && sha256(tarIndex.stdout) === installedIndexSha, 'installed dist/index.js bytes equal the packed tarball entry', { installedIndexSha, tarExit: tarIndex.exitCode })

  results.environment.parser = JSON.parse(await fsp.readFile(path.join(consumerDir, 'node_modules/@xmldom/xmldom/package.json'), 'utf8')).version
  results.environment.esbuild = JSON.parse(await fsp.readFile(path.join(consumerDir, 'node_modules/esbuild/package.json'), 'utf8')).version
  results.environment.playwright = JSON.parse(await fsp.readFile(path.join(consumerDir, 'node_modules/playwright/package.json'), 'utf8')).version
  results.environment.pngjs = JSON.parse(await fsp.readFile(path.join(consumerDir, 'node_modules/pngjs/package.json'), 'utf8')).version
  results.environment.ditherFace = JSON.parse(await fsp.readFile(path.join(installedDir, 'package.json'), 'utf8')).version
  addCase('S2-03')
  assert('S2-03', results.environment.parser === '0.9.12', 'XML parser is the pinned 0.9.12', { actual: results.environment.parser })
  addCase('S2-03')
  assert('S2-03', results.environment.esbuild === '0.28.2' && results.environment.playwright === '1.64.1', 'esbuild and Playwright are the pinned versions', { esbuild: results.environment.esbuild, playwright: results.environment.playwright })
  addCase('S2-03')
  assert('S2-03', results.environment.ditherFace === '0.1.0', 'installed package version is 0.1.0', { actual: results.environment.ditherFace })

  // Build the browser bundle from the installed package only.
  const bundleDir = path.join(outDir, 'browser', 'bundle')
  await fsp.mkdir(bundleDir, { recursive: true })
  const bundlePath = path.join(bundleDir, 'dither-face.js')
  const bundleMetaPath = path.join(bundleDir, 'meta.json')
  const bundleBuild = await runCommand(
    '08-browser-bundle',
    `./node_modules/.bin/esbuild node_modules/dither-face/dist/index.js --bundle --format=iife --global-name=DitherFace --outfile=${shellQuote(bundlePath)} --metafile=${shellQuote(bundleMetaPath)} --log-level=warning`,
    consumerDir,
    600000,
  )
  addCase('S2-03')
  assert('S2-03', bundleBuild.exitCode === 0, 'esbuild browser bundle from installed package exits 0', { exitCode: bundleBuild.exitCode, stderr: bundleBuild.stderr.slice(-2000) })
  const bundleMeta = JSON.parse(await fsp.readFile(bundleMetaPath, 'utf8'))
  const bundleInputs = Object.keys(bundleMeta.inputs ?? {})
  const badBundleInputs = bundleInputs.filter((input) => !input.startsWith('node_modules/dither-face/') || input.includes(`${repoDir}${path.sep}`))
  addCase('S2-03')
  assert('S2-03', bundleInputs.length > 0 && badBundleInputs.length === 0, 'every browser-bundle input comes from the installed dither-face package', { bundleInputs, badBundleInputs })
  results.browserBundle = {
    path: bundlePath,
    sha256: sha256(await fsp.readFile(bundlePath)),
    bytes: (await fsp.stat(bundlePath)).size,
    inputCount: bundleInputs.length,
    inputs: bundleInputs,
    metafileSha256: sha256(await fsp.readFile(bundleMetaPath)),
  }

  const module = await loadPackage()
  await runS201(module, installedDir)
  await runS202(module)

  const crossEngineCases = buildCrossEngineCases(corpus)
  const nodeRenders = new Map()
  for (const testCase of crossEngineCases) nodeRenders.set(caseKey(testCase), render(module, testCase))
  addCase('S2-03')
  assert('S2-03', nodeRenders.size === crossEngineCases.length && new Set([...nodeRenders.values()].map((svg) => sha256(svg))).size > 1, 'Node cross-engine corpus is non-trivial', { cases: crossEngineCases.length })

  const mixed = await runS205(module)
  const embeddingCases = buildEmbeddingCases(corpus)
  const embeddingSvgs = embeddingCases.map((testCase) => render(module, testCase))
  const transportSamples = buildTransportCases(corpus).map((testCase) => ({ ...testCase, svg: render(module, testCase) }))
  await runS204(module)

  const browserCases = {
    playwright: requireFromConsumer('playwright'),
    PNG,
    DOMParserCtor: DOMParser,
    outDir,
    bundlePath,
    crossEngineCases,
    nodeRenders,
    caseKey,
    mixedInstances: mixed.instances,
    mixedSvgs: mixed.svgs,
    definitionAnalysis: mixed.analysis,
    embeddingCases,
    embeddingSvgs,
    transportSamples,
    assert,
    addCase,
    block: blockScenario,
    note,
  }
  const browserObs = await runBrowserScenarios(browserCases)
  results.browser = browserObs
  results.environment.browsers = browserObs.versions
  const browsersJson = await fsp.readFile(path.join(consumerDir, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8').catch(() => null)
  results.environment.browserRevisions = browsersJson ? JSON.parse(browsersJson) : null
  await writeJson(path.join(outDir, 'browser-observations.json'), browserObs)

  await runS208(module)
  results.environment.npxFresh = results.commands.filter((entry) => entry.name.startsWith('S2-02-')).map((entry) => ({ name: entry.name, exitCode: entry.exitCode }))

  for (const id of IDS) {
    const entry = results.scenarios[id]
    if (entry.failures.length > 0) entry.status = 'FAIL'
    else if (entry.blocked.length > 0) entry.status = 'BLOCKED'
    else if (entry.cases === 0 || entry.assertions === 0) entry.status = 'NOT RUN'
    else entry.status = 'PASS'
  }
  results.finishedAt = new Date().toISOString()
  results.totals = {
    scenarios: IDS.length,
    pass: IDS.filter((id) => results.scenarios[id].status === 'PASS').length,
    fail: IDS.filter((id) => results.scenarios[id].status === 'FAIL').length,
    blocked: IDS.filter((id) => results.scenarios[id].status === 'BLOCKED').length,
    notRun: IDS.filter((id) => results.scenarios[id].status === 'NOT RUN').length,
    cases: IDS.reduce((sum, id) => sum + results.scenarios[id].cases, 0),
    assertions: IDS.reduce((sum, id) => sum + results.scenarios[id].assertions, 0),
    failures: IDS.reduce((sum, id) => sum + results.scenarios[id].failures.length, 0),
    blockedEntries: IDS.reduce((sum, id) => sum + results.scenarios[id].blocked.length, 0),
  }
  for (const id of IDS) await writeJson(path.join(perIdDir, `${id}.json`), results.scenarios[id])
  await writeJson(path.join(outDir, 'environment.json'), results.environment)
  await writeJson(path.join(outDir, 'results.json'), results)
  const failed = results.integrityFailures.length > 0 || results.totals.fail > 0 || results.totals.blocked > 0 || results.totals.notRun > 0
  if (failed) process.exitCode = 1
  console.log(json({ totals: results.totals, integrityFailures: results.integrityFailures, tarballSha256: results.tarball.sha256, browserBundleSha256: results.browserBundle.sha256 }))
}

main().catch(async (error) => {
  results.integrityFailures.push(`harness failure: ${error.stack || error.message}`)
  results.finishedAt = new Date().toISOString()
  await writeJson(path.join(outDir, 'results.json'), results).catch(() => {})
  console.error(error)
  process.exitCode = 1
})