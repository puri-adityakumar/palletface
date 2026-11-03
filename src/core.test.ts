import { describe, expect, it } from 'vitest'
import { FONT, glyph, initialOf } from './font.js'
import { asciiGrid, BAYER, esc } from './grid.js'
import { fnv1a, mulberry32 } from './seed.js'

describe('seed primitives', () => {
  it('matches fixed FNV-1a vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('hello')).toBe(0x4f9f2cab)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })

  it('matches a fixed Mulberry32 sequence and keeps independent state', () => {
    const a = mulberry32(1)
    expect(Array.from({ length: 5 }, () => a())).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849])
    const b = mulberry32(1)
    expect(b()).toBe(0.6270739405881613)
  })
})

describe('font and XML primitives', () => {
  it('normalizes accents and chooses the first ASCII letter/digit', () => {
    expect(initialOf('  élodie')).toBe('E')
    expect(initialOf('e\u0301lodie')).toBe('E')
    expect(initialOf('東京 7even')).toBe('7')
    expect(initialOf('')).toBe('?')
    expect(initialOf('東京🙂')).toBe('?')
  })

  it('has rectangular bitmap glyphs including ten distinct digits', () => {
    for (const char of Object.keys(FONT)) {
      const rows = glyph(char)
      expect(rows).toHaveLength(7)
      expect(rows.every(row => row.length === 5 && row.every(bit => typeof bit === 'boolean'))).toBe(true)
    }
    expect(new Set('0123456789'.split('').map(char => FONT[char])).size).toBe(10)
    for (const digit of '0123456789') expect(glyph(digit)).not.toEqual(glyph('?'))
    expect(glyph('🙂')).toEqual(glyph('?'))
  })

  it('escapes XML text and never treats text as SVG markup', () => {
    expect(esc('&<>&')).toBe('&amp;&lt;&gt;&amp;')
    expect(asciiGrid(1, '#fff', [['<&>']])).toContain('&lt;&amp;&gt;</text>')
    expect(asciiGrid(1, '#fff', [[' ']])).not.toContain('<text')
  })

  it('has all sixteen distinct Bayer thresholds in the open unit interval', () => {
    const values = BAYER.flat()
    expect(new Set(values).size).toBe(16)
    expect(values.every(value => value > 0 && value < 1)).toBe(true)
  })
})
