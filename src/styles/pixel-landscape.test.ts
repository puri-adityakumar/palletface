import { describe, expect, it } from 'vitest'
import { pixelLandscape } from './pixel-landscape.js'

describe('pixelLandscape', () => {
  it('renders the same seed to a byte-identical svg', () => {
    expect(pixelLandscape('user-0', 80)).toBe(pixelLandscape('user-0', 80))
  })

  it('renders 20 distinct seeds to mostly different scenes', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 'seed-' + i)
    const outputs = seeds.map((seed) => pixelLandscape(seed, 80))
    expect(new Set(outputs).size).toBeGreaterThanOrEqual(18)
  })

  it('is a 16x16 svg with a viewBox and a circular clip', () => {
    const svg = pixelLandscape('user-0', 80)
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toContain('<clipPath id="land-')
    expect(svg).toContain('<circle cx="8" cy="8" r="8"/>')
    expect(svg).toContain('<g clip-path="url(#land-')
  })

  it('paints every one of the 16x16 cells exactly once', () => {
    // the scene is exhaustive — sky, sun and hills overwrite per cell with no
    // gaps — so the clipped group holds exactly 256 rects for any seed.
    for (const seed of ['user-0', 'user-3', 'seed-7']) {
      expect(pixelLandscape(seed, 80).match(/<rect /g)).toHaveLength(256)
    }
  })
})
