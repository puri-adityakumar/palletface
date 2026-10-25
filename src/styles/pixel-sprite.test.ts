import { describe, expect, it } from 'vitest'
import { pixelSprite } from './pixel-sprite.js'

describe('pixelSprite', () => {
  it('renders the same seed to the identical string', () => {
    expect(pixelSprite('user-0', 80)).toBe(pixelSprite('user-0', 80))
  })

  it('spreads 20 distinct seeds over at least 18 distinct sprites', () => {
    const sprites = Array.from({ length: 20 }, (_, i) => pixelSprite(`user-${i}`, 80))
    expect(new Set(sprites).size).toBeGreaterThanOrEqual(18)
  })

  it('wraps the 12x12 grid in an svg with a viewBox and a circular clip', () => {
    const svg = pixelSprite('user-0', 80)
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('viewBox="0 0 12 12"')
    expect(svg).toContain('<clipPath')
    expect(svg).toContain('<circle cx="6" cy="6" r="6"/>')
    expect(svg).toMatch(/clip-path="url\(#/)
  })

  it('mirrors every painted cell about the vertical center', () => {
    const svg = pixelSprite('user-3', 80)
    const counts = new Map<string, number>()
    for (const [, x, y, w, h, fill] of svg.matchAll(
      /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"\/>/g,
    )) {
      const key = `${x},${y},${w},${h},${fill}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(counts.size).toBeGreaterThan(0)
    for (const [key, count] of counts) {
      const [x, y, w, h, fill] = key.split(',')
      const mirror = `${12 - Number(x) - Number(w)},${y},${w},${h},${fill}`
      expect(counts.get(mirror), `rect ${key} has no mirrored twin`).toBe(count)
    }
  })
})
