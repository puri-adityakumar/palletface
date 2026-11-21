#!/usr/bin/env node
/**
 * Stage 4 S4-01: plain Node ESM consumer.
 *
 * Produces a machine-readable report. It deliberately performs its own runtime
 * checks as well as letting the qualification harness re-check the same report,
 * so a "process exited 0" result is never the only evidence.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  asciiFace,
  asciiField,
  asciiLetter,
  ditherFace,
  ditherOrb,
  pixelLandscape,
  pixelLetter,
  pixelSprite,
  pixelifyLetter,
  STYLES,
} from 'dither-face'

const goldenPath = process.env.S4_GOLDEN
const outPath = process.env.S4_OUT ?? 'report.json'
if (!goldenPath) throw new Error('S4_GOLDEN is required')

const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'))
const goldenByStyle = Object.fromEntries(golden.styles.map((row) => [row.slug, row.sha256]))
const failures = []
const checks = []

function check(ok, name, detail = {}) {
  const row = { name, ok: Boolean(ok), ...detail }
  checks.push(row)
  if (!ok) failures.push(row)
  return Boolean(ok)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function looksLikeSvg(value) {
  return typeof value === 'string' && value.startsWith('<svg') && value.endsWith('</svg>') && value.length > 200
}

const direct = {
  'pixel-sprite': pixelSprite,
  'pixel-letter': pixelLetter,
  'dither-orb': ditherOrb,
  'pixel-landscape': pixelLandscape,
  'ascii-letter': asciiLetter,
  'ascii-field': asciiField,
  'ascii-face': asciiFace,
  'pixelify-letter': pixelifyLetter,
}

const input = golden.input
const styles = []
for (const style of STYLES) {
  const viaApi = ditherFace(input.seed, { style: style.slug, px: input.px, name: input.name })
  const viaRegistry = style.draw(input.seed, input.px, input.name)
  const viaDirect = direct[style.slug](input.seed, input.px, input.name)
  const hash = sha256(viaApi)
  check(looksLikeSvg(viaApi), `${style.slug}: non-empty SVG-shaped output`)
  check(hash === goldenByStyle[style.slug], `${style.slug}: recorded golden hash`, {
    actual: hash,
    expected: goldenByStyle[style.slug],
  })
  check(viaRegistry === viaApi, `${style.slug}: STYLES.draw equals ditherFace`)
  check(viaDirect === viaApi, `${style.slug}: direct renderer equals ditherFace`)
  styles.push({ slug: style.slug, sha256: hash, bytes: Buffer.byteLength(viaApi) })
}

check(STYLES.length === 8, 'registry exposes eight styles', { actual: STYLES.length })
check(
  JSON.stringify(STYLES.map((style) => style.slug)) === JSON.stringify(Object.keys(direct)),
  'registry order matches eight documented renderers',
)

// High-level defaults must agree with explicit sprite/80 and the direct renderer.
const defaults = {
  implicit: sha256(ditherFace('user-42')),
  emptyOptions: sha256(ditherFace('user-42', {})),
  explicit: sha256(ditherFace('user-42', { style: 'pixel-sprite', px: 80 })),
  direct: sha256(pixelSprite('user-42', 80)),
  implicitNameIsSeed: sha256(ditherFace('Ada', { style: 'pixel-letter' })) === sha256(ditherFace('Ada', { style: 'pixel-letter', name: 'Ada' })),
}
check(defaults.implicit === defaults.emptyOptions, 'default options equal empty options')
check(defaults.implicit === defaults.explicit, 'default options equal explicit pixel-sprite/80')
check(defaults.implicit === defaults.direct, 'default options equal pixelSprite(seed, 80)')
check(defaults.implicitNameIsSeed, 'letter-style name defaults to the seed')

// Name semantics: only the three letter styles may change when only name changes.
const seedForName = 'user-42'
const nameSemantics = []
for (const style of STYLES) {
  const a = ditherFace(seedForName, { style: style.slug, px: 80, name: 'Ada' })
  const b = ditherFace(seedForName, { style: style.slug, px: 80, name: 'Bea' })
  const isLetter = style.slug === 'pixel-letter' || style.slug === 'ascii-letter' || style.slug === 'pixelify-letter'
  const changed = a !== b
  nameSemantics.push({ style: style.slug, isLetter, changed })
  check(changed === isLetter, `${style.slug}: name ${isLetter ? 'changes' : 'does not change'} output`)
}

// Unicode, numeric and fractional size coverage, repeated for determinism.
const unicodeSeeds = ['', '用户', '🙂‍↔️', 'e\u0301', 'مرحبا', '   ', '<script>&"']
const unicodeNames = ['Élodie', '用户', '🙂', '123', '']
const sizes = [0.5, 64, 80.25, 512]
const unicode = []
for (const seed of unicodeSeeds) {
  for (const name of unicodeNames) {
    for (const px of sizes) {
      const first = ditherFace(seed, { style: 'pixel-letter', px, name })
      const second = ditherFace(seed, { style: 'pixel-letter', px, name })
      check(looksLikeSvg(first), `unicode render ${JSON.stringify(seed)}/${JSON.stringify(name)}@${px}`)
      check(first === second, `unicode deterministic ${JSON.stringify(seed)}/${JSON.stringify(name)}@${px}`)
      unicode.push({ seed, name, px, sha256: sha256(first) })
    }
  }
}

// Invalid inputs must throw. Cases include missing arguments and wrong types.
const invalidCases = [
  ['non-string seed', () => ditherFace(42)],
  ['null seed', () => ditherFace(null)],
  ['array seed', () => ditherFace(['x'])],
  ['non-string name', () => ditherFace('x', { name: 7 })],
  ['null name', () => ditherFace('x', { name: null })],
  ['zero px', () => ditherFace('x', { px: 0 })],
  ['negative px', () => ditherFace('x', { px: -1 })],
  ['NaN px', () => ditherFace('x', { px: Number.NaN })],
  ['Infinity px', () => ditherFace('x', { px: Number.POSITIVE_INFINITY })],
  ['string px', () => ditherFace('x', { px: '80' })],
  ['unknown style', () => ditherFace('x', { style: 'pixel-sprit' })],
  ['null options', () => ditherFace('x', null)],
  ['array options', () => ditherFace('x', [])],
  ['direct renderer missing px', () => pixelSprite('x')],
  ['registry draw missing px', () => STYLES[0].draw('x')],
]
const invalid = []
for (const [name, run] of invalidCases) {
  try {
    const value = run()
    invalid.push({ name, threw: false, valueType: typeof value })
    check(false, `invalid input throws: ${name}`)
  } catch (error) {
    invalid.push({ name, threw: true, errorName: error?.name ?? null, message: String(error?.message ?? error) })
    check(true, `invalid input throws: ${name}`)
  }
}

// Fixture resolution: the imported package must be the installed copy.
const resolvedUrl = import.meta.resolve('dither-face')
const resolvedPath = fileURLToPath(resolvedUrl)
const packageRoot = resolvedPath.replace(/\/dist\/index\.js$/, '')
const packageStat = fs.lstatSync(packageRoot)
const packageJson = JSON.parse(fs.readFileSync(`${packageRoot}/package.json`, 'utf8'))
const dependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']
  .filter((field) => packageJson[field] !== undefined)
check(packageStat.isDirectory() && !packageStat.isSymbolicLink(), 'installed package root is a real directory, not a symlink')
check(packageRoot.includes('/apps/s4-01-node/node_modules/dither-face'), 'package resolves inside the app node_modules', { packageRoot })
check(!packageRoot.includes('/qualify/repo/'), 'package does not resolve to the repository')
check(dependencyFields.length === 0, 'installed package has no runtime dependency fields', { dependencyFields })
check(packageJson.version === '0.1.0', 'installed package version is 0.1.0', { version: packageJson.version })

const report = {
  scenario: 'S4-01',
  ok: failures.length === 0,
  failures,
  checks,
  resolvedUrl,
  packageRoot,
  packageRealPath: fs.realpathSync(packageRoot),
  packageIsSymlink: packageStat.isSymbolicLink(),
  packageVersion: packageJson.version,
  dependencyFields,
  styleCount: STYLES.length,
  styles,
  defaults,
  nameSemantics,
  unicode: { count: unicode.length, samples: unicode.slice(0, 8) },
  invalid: { count: invalid.length, allThrew: invalid.every((row) => row.threw), rows: invalid },
}
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ scenario: 'S4-01', ok: report.ok, failures: failures.length, checks: checks.length, styles: styles.length, invalid: invalid.length }))
if (!report.ok) process.exitCode = 1
