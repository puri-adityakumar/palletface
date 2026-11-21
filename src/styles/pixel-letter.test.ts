/**
 * Tests for the pixel-letter style: determinism, spread across seeds, the
 * avatar frame, and the drop-shadow geometry the style exists for.
 */
import { describe, expect, it } from 'vitest'
import { pixelLetter } from './pixel-letter.js'
import { glyph, initialOf } from '../font.js'
import { DEEP, INK } from '../palettes.js'

/** Pull the 1x1 rects out of an avatar svg, in draw order. */
const rects = (svg: string): { x: number; y: number; fill: string }[] =>
  [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="([^"]+)"\/>/g)].map(
    ([, x, y, fill]) => ({ x: Number(x), y: Number(y), fill: fill! }),
  )

describe('pixelLetter', () => {
  it('renders the same seed to a byte-identical svg', () => {
    expect(pixelLetter('aditya', 80)).toBe(pixelLetter('aditya', 80))
    expect(pixelLetter('user-3', 30)).toBe(pixelLetter('user-3', 30))
  })

  it('renders 20 distinct seeds to at least 18 distinct svgs', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 'user-' + i)
    const outs = seeds.map((seed) => pixelLetter(seed, 80))
    expect(new Set(outs).size).toBeGreaterThanOrEqual(18)
  })

  it('returns an svg with a viewBox and a circular clip', () => {
    const svg = pixelLetter('kai', 56)
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('viewBox="0 0 13 13"')
    expect(svg).toContain('<clipPath id="plet-')
    expect(svg).toContain('<circle cx="6.5" cy="6.5" r="6.5"/>')
    expect(svg).toContain('clip-path="url(#plet-')
  })

  it('draws the initial in ink with a drop shadow one unit down-right', () => {
    const seed = 'marcus'
    const svg = pixelLetter(seed, 80)
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? []
    const n = Number(w)
    expect(n).toBe(13) // the mockup's grid constant
    expect(Number(h)).toBe(n)

    // draw order is the mockup's: the full dither field, then the shadow
    // pass, then the ink pass
    const cells = rects(svg)
    const lit = glyph(initialOf(seed))
      .flatMap((row, y) => row.map((bit, x) => bit && ({ x: 4 + x, y: 3 + y })))
      .filter((p): p is { x: number; y: number } => p !== false)
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
    expect(cells.length).toBe(n * n + 2 * lit.length)

    // the field: every grid position exactly once, y-major
    const field = cells.slice(0, n * n)
    expect(field.map(key)).toEqual(
      Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => `${x},${y}`)).flat(),
    )

    // the ink pass: one rect per lit glyph pixel, at the glyph offset, in ink
    const ink = cells.slice(n * n + lit.length)
    expect(ink.map(key).sort()).toEqual(lit.map(key).sort())
    expect(ink.every((c) => c.fill === INK)).toBe(true)

    // the shadow pass: one rect per lit pixel, in glyph order, each exactly
    // (1, 1) down-right of its ink pixel, all in one DEEP color
    const shadows = cells.slice(n * n, n * n + lit.length)
    expect(shadows.map(key)).toEqual(lit.map((p) => key({ x: p.x + 1, y: p.y + 1 })))
    expect(new Set(shadows.map((c) => c.fill)).size).toBe(1)
    expect(DEEP.some((color) => color === shadows[0]!.fill)).toBe(true)
  })

  it('takes the initial from name when given, leaving the rng on the seed', () => {
    // the sheet passes the mockup's two arguments: 'user-<j>' seeds the rng,
    // the display name picks the letter — 'user-0' alone would draw 'U'
    const named = pixelLetter('user-0', 80, 'aditya')
    const anon = pixelLetter('user-0', 80)
    // the rng picks stay the seed's: the dither field is the anonymous draw's
    expect(rects(named).slice(0, 13 * 13)).toEqual(rects(anon).slice(0, 13 * 13))
    // and the ink pass is the name's initial 'A' at the glyph offset
    const litA = glyph('A')
      .flatMap((row, y) => row.map((bit, x) => bit && { x: 4 + x, y: 3 + y }))
      .filter((p): p is { x: number; y: number } => p !== false)
    const ink = rects(named).slice(13 * 13 + litA.length)
    expect(ink.map((c) => `${c.x},${c.y}`).sort()).toEqual(litA.map((p) => `${p.x},${p.y}`).sort())
  })
})
