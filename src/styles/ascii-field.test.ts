/**
 * Checks for the ascii field style: determinism, seed variety, the avatar
 * frame, and the ramp discipline that makes the field read as ascii.
 */
import { describe, expect, it } from 'vitest'
import { asciiField } from './ascii-field.js'

/** The glyphs the field may draw — the ramp minus its empty space cell. */
const GLYPHS = [...'.:-=+*#%@']

describe('asciiField', () => {
  it('renders the same seed twice to the identical string', () => {
    expect(asciiField('user-0', 80)).toBe(asciiField('user-0', 80))
  })

  it('renders 20 distinct seeds to at least 18 distinct outputs', () => {
    const svgs = Array.from({ length: 20 }, (_, i) => asciiField('user-' + i, 80))
    expect(new Set(svgs).size).toBeGreaterThanOrEqual(18)
  })

  it('is a complete svg with a viewBox and a circular clip', () => {
    const svg = asciiField('user-0', 80)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('width="80" height="80"')
    expect(svg).toContain('viewBox="0 0 11 11"')
    expect(svg).toMatch(/<clipPath id="[^"]+"><circle cx="5\.5" cy="5\.5" r="5\.5"\/><\/clipPath>/)
    expect(svg).toContain('clip-path="url(#afield-clip-')
  })

  it('draws every glyph from the density ramp, in more than one weight', () => {
    const svg = asciiField('user-0', 80)
    const glyphs = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]!)
    const drawn = glyphs.flatMap((glyph) => [...glyph])
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.length).toBeLessThanOrEqual(11 * 11)
    expect(drawn.filter((ch) => !GLYPHS.includes(ch))).toEqual([])
    expect(new Set(drawn).size).toBeGreaterThan(1)
  })
})
