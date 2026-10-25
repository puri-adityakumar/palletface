/** Tests for the ascii-letter avatar: determinism, variation, frame, glyph. */
import { describe, expect, it } from 'vitest'
import { asciiLetter } from './ascii-letter.js'
import { glyph, initialOf } from '../font.js'
import { INK } from '../palettes.js'

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
})
