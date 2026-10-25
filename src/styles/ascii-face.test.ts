import { describe, expect, it } from 'vitest'
import { asciiFace } from './ascii-face.js'

/** Pull the kaomoji out of the `<text>` element and undo the xml escaping. */
function faceOf(svg: string): string {
  const match = /<text[^>]*>([^<]*)<\/text>/.exec(svg)
  expect(match, 'an ascii-face svg carries one <text> element').toBeTruthy()
  return match![1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

describe('asciiFace', () => {
  it('renders the same seed to the identical string', () => {
    expect(asciiFace('user-0', 80)).toBe(asciiFace('user-0', 80))
  })

  it('spreads distinct seeds across at least 18 of 20 distinct faces', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `user-${i}`)
    const outputs = new Set(seeds.map((seed) => asciiFace(seed, 80)))
    expect(outputs.size).toBeGreaterThanOrEqual(18)
  })

  it('returns a complete svg with a viewBox and a circular clip', () => {
    const svg = asciiFace('user-3', 56)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('viewBox="0 0 32 32"')
    expect(svg).toContain('<clipPath')
    expect(svg).toContain('<circle cx="16" cy="16" r="16"/>')
    expect(svg).toContain('<g clip-path="url(#')
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('builds a five-character kaomoji from a matched bracket pair', () => {
    // The mockup assembles br[0] + eye + mouth + mirrored eye + br[1], so the
    // face is always five characters whose ends are one matched bracket pair.
    const opens = ['(', '[', '{', '|', '<', 'ʕ']
    const closes = [')', ']', '}', '|', '>', 'ʔ']
    for (const seed of ['aditya', 'zeke', 'marcus', 'élodie', 'kai', 'rhea', 'quinn', 'yuki']) {
      const face = faceOf(asciiFace(seed, 80))
      expect(face).toHaveLength(5)
      const open = opens.indexOf(face.charAt(0))
      expect(open, `${face} opens with a bracket from the pool`).toBeGreaterThanOrEqual(0)
      expect(face.charAt(4), `${face} closes with the matching bracket`).toBe(closes[open])
    }
  })
})
