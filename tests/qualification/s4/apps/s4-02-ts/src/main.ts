/**
 * S4-02 strict TypeScript consumer. Uses the documented public types only.
 * The emitted NodeNext program is executed by the harness and its report is
 * re-checked against the independently recorded golden file.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
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
  type AvatarStyle,
  type DitherFaceOptions,
  type StyleSlug,
} from 'dither-face'

interface GoldenRow {
  slug: string
  sha256: string
}

interface GoldenFile {
  input: { seed: string; name: string; px: number }
  styles: GoldenRow[]
}

const goldenPath = process.env.S4_GOLDEN
const outPath = process.env.S4_OUT ?? 'report.json'
if (goldenPath === undefined) throw new Error('S4_GOLDEN is required')

const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenFile
const expected: ReadonlyMap<string, string> = new Map(golden.styles.map((row) => [row.slug, row.sha256]))
const failures: Array<{ name: string; detail: unknown }> = []

function check(ok: boolean, name: string, detail: unknown = null): void {
  if (!ok) failures.push({ name, detail })
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const firstStyle: AvatarStyle = STYLES[0] as AvatarStyle
const typedStyle: StyleSlug = 'pixel-sprite'
const typedOptions: DitherFaceOptions = { style: typedStyle, px: 80, name: 'Ada' }
const typedSvg: string = ditherFace('user-42', typedOptions)
check(typedSvg.startsWith('<svg'), 'documented StyleSlug/DitherFaceOptions usage returns SVG')
check(firstStyle.slug === 'pixel-sprite', 'STYLES first entry is pixel-sprite')

const direct: Record<StyleSlug, (seed: string, px: number, name?: string) => string> = {
  'pixel-sprite': pixelSprite,
  'pixel-letter': pixelLetter,
  'dither-orb': ditherOrb,
  'pixel-landscape': pixelLandscape,
  'ascii-letter': asciiLetter,
  'ascii-field': asciiField,
  'ascii-face': asciiFace,
  'pixelify-letter': pixelifyLetter,
}

const styles: Array<{ slug: StyleSlug; sha256: string; bytes: number }> = []
for (const style of STYLES) {
  const svg: string = ditherFace(golden.input.seed, {
    style: style.slug,
    px: golden.input.px,
    name: golden.input.name,
  })
  const directSvg: string = direct[style.slug](golden.input.seed, golden.input.px, golden.input.name)
  const hash = sha256(svg)
  const expectedHash = expected.get(style.slug)
  check(svg.length > 200 && svg.startsWith('<svg') && svg.endsWith('</svg>'), `${style.slug}: SVG shape`)
  check(hash === expectedHash, `${style.slug}: golden hash`, { actual: hash, expected: expectedHash })
  check(svg === directSvg, `${style.slug}: direct renderer parity`)
  styles.push({ slug: style.slug, sha256: hash, bytes: Buffer.byteLength(svg) })
}

const report = {
  scenario: 'S4-02',
  ok: failures.length === 0,
  failures,
  styleCount: STYLES.length,
  styles,
  typedUsage: {
    style: typedStyle,
    options: typedOptions,
    sha256: sha256(typedSvg),
  },
  resolution: import.meta.resolve('dither-face'),
}
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ scenario: 'S4-02', ok: report.ok, failures: failures.length, styles: styles.length }))
if (!report.ok) process.exitCode = 1
