/**
 * Checks for the pixelify-letter style: determinism, per-seed variety, the
 * svg frame, and the style's own invariant — a two-pastel checker with the
 * initial drawn in a single accent color.
 */
import { describe, expect, it } from 'vitest'
import { INK, PASTEL } from '../palettes.js'
import { pixelifyLetter } from './pixelify-letter.js'

/** The rust accent the style can pick for the initial (1 seed in 3). */
const RUST = '#c8402d'

/** Twenty distinct seeds with varied initials (A, Z, M, E, K, R, Q, Y, …). */
const SEEDS = [
  'aditya',
  'zeke',
  'marcus',
  'elodie',
  'kai',
  'rhea',
  'quinn',
  'yuki',
  'ava',
  'noah',
  'mia',
  'liam',
  'zoe',
  'evan',
  'iris',
  'omar',
  'uma',
  'pia',
  'gus',
  'taj',
]

describe('pixelifyLetter', () => {
  it('renders the identical string for the same seed', () => {
    for (const seed of ['user-0', 'élodie', 'seed-7', '']) {
      expect(pixelifyLetter(seed, 80)).toBe(pixelifyLetter(seed, 80))
    }
  })

  it('differs across seeds: at least 18 of 20 outputs differ', () => {
    // the hashed clip id differs per seed by construction, so it is blanked
    // out first — this checks the drawing itself varies, not just the id
    const svgs = SEEDS.map((seed) => pixelifyLetter(seed, 80).replace(/c-pfy-[0-9a-z]+/g, 'id'))
    expect(new Set(svgs).size).toBeGreaterThanOrEqual(18)
  })

  it('is an svg with a viewBox and a circular clip', () => {
    const svg = pixelifyLetter('user-0', 80)
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg).toContain('width="80"')
    expect(svg).toContain('height="80"')
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toMatch(/<clipPath id="[^"]+"><circle cx="8" cy="8" r="8"\/><\/clipPath>/)
    expect(svg).toMatch(/clip-path="url\(#[^"]+\)"/)
  })

  it('paints the checker in exactly two pastels and the initial in one accent', () => {
    for (const seed of SEEDS) {
      const svg = pixelifyLetter(seed, 80)
      const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1] ?? '')
      const checker = fills.slice(0, 16 * 16)
      const letter = fills.slice(16 * 16)
      expect(new Set(checker).size).toBe(2)
      for (const c of checker) expect([...PASTEL]).toContain(c)
      expect(letter.length).toBeGreaterThan(0)
      expect(new Set(letter).size).toBe(1)
      expect([INK, RUST]).toContain(letter[0])
    }
  })

  it('takes the initial from name when given, leaving the rng on the seed', () => {
    // the sheet passes the mockup's two arguments: 'user-<j>' seeds the rng,
    // the display name picks the letter — 'user-0' alone would draw 'U'
    const named = pixelifyLetter('user-0', 80, 'aditya')
    const anon = pixelifyLetter('user-0', 80)
    expect(named).not.toBe(anon)
    // the rng picks stay the seed's: the checker is the anonymous draw's, and
    // the letter keeps its color even though the glyph under it changes
    const fills = (svg: string) => [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1] ?? '')
    expect(fills(named).slice(0, 16 * 16)).toEqual(fills(anon).slice(0, 16 * 16))
    const letter = fills(named).slice(16 * 16)
    expect(letter.length).toBeGreaterThan(0)
    expect(new Set(letter)).toEqual(new Set(fills(anon).slice(16 * 16)))
  })
})
