import { describe, expect, it } from 'vitest'

import { GRID, ORB_POOL, ditherOrb } from './dither-orb.js'

describe('ditherOrb', () => {
  it('is byte-identical for the same seed, at any size', () => {
    for (const seed of ['user-0', 'élodie', '']) {
      expect(ditherOrb(seed, 80)).toBe(ditherOrb(seed, 80))
      expect(ditherOrb(seed, 30)).toBe(ditherOrb(seed, 30))
    }
  })

  it('gives different seeds different orbs: 20 seeds, at least 18 distinct', () => {
    const orbs = Array.from({ length: 20 }, (_, i) => ditherOrb(`user-${i}`, 80))
    expect(new Set(orbs).size).toBeGreaterThanOrEqual(18)
  })

  it('is a standalone svg with a viewBox and a circular clip', () => {
    const svg = ditherOrb('user-0', 80)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain(`viewBox="0 0 ${GRID} ${GRID}"`)
    expect(svg).toContain('<clipPath id="orb-')
    expect(svg).toContain(`<circle cx="${GRID / 2}" cy="${GRID / 2}" r="${GRID / 2}"/>`)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('paints the full grid with exactly three colors from the orb pool', () => {
    for (const seed of ['user-0', 'user-b', '', '🔑', 'a'.repeat(500)]) {
      const svg = ditherOrb(seed, 80)
      const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]!)
      expect(fills).toHaveLength(GRID * GRID)
      expect(new Set(fills).size).toBe(3)
      for (const fill of new Set(fills)) expect(ORB_POOL).toContain(fill)
    }
  })
})
