/** Tests for the ascii-letter avatar: determinism, variation, frame, glyph. */
import { describe, expect, it } from 'vitest'
import { asciiLetter } from './ascii-letter.js'
import { glyph, initialOf } from '../font.js'
import { INK } from '../palettes.js'
import {
  cellsToMap,
  fixedModel,
  outsideGlyphDiffs,
  parseAsciiLetter,
} from '../../tests/helpers/ascii-letter-oracle.js'

const DOT_INVARIANCE_SEEDS = ['seed-background-check', 'alice', 'user-7', '艾达', '<script>&"']
const DOT_INVARIANCE_NAMES = [['Alice', 'Bob'], ['Zoe', '9lives'], ['Élodie', '用户']] as const

describe('asciiLetter', () => {
  it('renders the same seed to a byte-identical svg', () => {
    expect(asciiLetter('aditya', 80)).toBe(asciiLetter('aditya', 80))
  })

  it('renders 20 distinct seeds to at least 18 distinct svgs', () => {
    const svgs = Array.from({ length: 20 }, (_, i) => asciiLetter('seed-' + i, 80))
    expect(new Set(svgs).size).toBeGreaterThanOrEqual(18)
  })

  it('is a standalone svg with a viewBox and a circular clip', () => {
    const svg = asciiLetter('kai', 80)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 9 9"')
    expect(svg).toMatch(/<clipPath id="[^"]+"><circle cx="4.5" cy="4.5" r="4.5"\/><\/clipPath>/)
    expect(svg).toContain('clip-path="url(#')
  })

  it('draws the whole initial with the one picked character, cell for cell', () => {
    const svg = asciiLetter('aditya', 80) // initialOf('aditya') === 'A'
    const ink = [
      ...svg.matchAll(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*fill="${INK}">([^<]*)</text>`, 'g')),
    ]
    // one single character carries the initial — the style's whole premise
    expect(new Set(ink.map((m) => m[3]!)).size).toBe(1)
    // and it covers exactly the on-pixels of the 5x7 glyph at offset (2, 1)
    const drawn = new Set(ink.map((m) => `${Number(m[1]!) - 2.5},${Number(m[2]!) - 1.5}`))
    const onCells = new Set<string>()
    glyph(initialOf('aditya')).forEach((row, gy) =>
      row.forEach((on, gx) => {
        if (on) onCells.add(gx + ',' + gy)
      }),
    )
    expect(drawn).toEqual(onCells)
  })

  it('takes the initial from name when given, leaving the rng on the seed', () => {
    // the sheet passes the mockup's two arguments: 'user-<j>' seeds the rng,
    // the display name picks the letter — 'user-1' alone would draw 'U'
    const named = asciiLetter('user-1', 80, 'zeke')
    const anon = asciiLetter('user-1', 80)
    // the rng picks stay the seed's: same background
    const bg = (svg: string) => svg.match(/<rect width="9" height="9" fill="([^"]+)"/)?.[1]
    expect(bg(named)).toBe(bg(anon))
    // and the ink cells are the name's initial 'Z' at offset (2, 1)
    const ink = [
      ...named.matchAll(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*fill="${INK}">([^<]*)</text>`, 'g')),
    ]
    expect(new Set(ink.map((m) => m[3]!)).size).toBe(1)
    const drawn = new Set(ink.map((m) => `${Number(m[1]!) - 2.5},${Number(m[2]!) - 1.5}`))
    const onCells = new Set<string>()
    glyph('Z').forEach((row, gy) => row.forEach((on, gx) => { if (on) onCells.add(gx + ',' + gy) }))
    expect(drawn).toEqual(onCells)
  })

  it('keeps dots outside the union of both glyphs fixed when only the name changes', () => {
    // Q-001 regression: pre-fix, r() advanced only under non-glyph cells, so
    // the first differing glyph shifted every later background decision.
    let comparisons = 0
    for (const seed of DOT_INVARIANCE_SEEDS) {
      for (const [nameA, nameB] of DOT_INVARIANCE_NAMES) {
        const a = parseAsciiLetter(asciiLetter(seed, 80, nameA))
        const b = parseAsciiLetter(asciiLetter(seed, 80, nameB))
        expect(a.bg, `${seed}: background colour`).toBe(b.bg)
        expect(outsideGlyphDiffs(a, b), `${seed}: ${nameA} vs ${nameB}`).toEqual([])
        comparisons += 1
      }
    }
    expect(comparisons).toBe(DOT_INVARIANCE_SEEDS.length * DOT_INVARIANCE_NAMES.length)
  })

  it('matches an independent per-cell PRNG mask and glyph overlay', () => {
    // Independent reference model, not the style's own output: every one of
    // the 81 cells consumes exactly one dot decision, then the glyph overlays.
    for (const seed of [...DOT_INVARIANCE_SEEDS, '']) {
      for (const [, name] of DOT_INVARIANCE_NAMES) {
        for (const label of [name, undefined] as const) {
          const parsed = parseAsciiLetter(asciiLetter(seed, 80, label))
          const model = fixedModel(seed, label)
          expect(parsed.bg, `${seed}/${label ?? 'seed'}: bg`).toBe(model.picks.bg)
          expect(parsed.cells, `${seed}/${label ?? 'seed'}: every cell`).toEqual(cellsToMap(model.cells))
          expect(parsed.glyphs, `${seed}/${label ?? 'seed'}: glyph cells`).toEqual(model.glyphCells)
        }
      }
    }
  })
})
