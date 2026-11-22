import { describe, expect, it } from 'vitest'
import { ditherFace, STYLES } from './index.js'

describe('public API', () => {
  it('has twelve distinct, stable slugs in sheet order and uses sprite/80 defaults', () => {
    expect(STYLES.map(s => s.slug)).toEqual([
      'pixel-sprite', 'pixel-letter', 'dither-orb', 'pixel-landscape',
      'pixelify-letter', 'geometric-tile', 'random-contours', 'pixel-emotes', 'mirrored-signal',
      'pixel-flora', 'pixel-relic', 'pixel-stamp',
    ])
    expect(ditherFace('user')).toBe(STYLES[0]!.draw('user', 80))
    expect(ditherFace('user', { px: undefined, name: undefined })).toBe(ditherFace('user'))
  })

  for (const style of STYLES) {
    it(`${style.slug} forwards options and accepts empty/Unicode/untrusted-looking strings`, () => {
      for (const seed of ['', 'élodie', '東京', '<script>alert("x")</script>', 'a'.repeat(10_000)]) {
        const options = { style: style.slug, px: 32.5, name: 'Ada' }
        const svg = ditherFace(seed, options)
        expect(svg).toBe(style.draw(seed, 32.5, 'Ada'))
        expect(svg).toContain('width="32.5" height="32.5"')
        expect(svg).not.toContain('<script>')
      }
    })

    it(`${style.slug} validates direct arguments and the convenience API`, () => {
      for (const seed of [null, undefined, 4, {}, []]) {
        expect(() => style.draw(seed as never, 80)).toThrow(/seed must be a string/)
        expect(() => ditherFace(seed as never, { style: style.slug })).toThrow(/seed must be a string/)
      }
      for (const px of [0, -1, NaN, Infinity, -Infinity, '80', null, {}]) {
        expect(() => style.draw('x', px as never)).toThrow(/positive finite/)
        expect(() => ditherFace('x', { style: style.slug, px: px as never })).toThrow(/positive finite/)
      }
      expect(() => style.draw('x', undefined as never)).toThrow(/positive finite/)
      for (const name of [null, 1, {}]) {
        expect(() => ditherFace('x', { style: style.slug, name: name as never })).toThrow(/name must be a string/)
        if (style.slug.endsWith('letter') || style.slug === 'pixel-stamp') {
          expect(() => style.draw('x', 80, name as never)).toThrow(/name must be a string/)
        }
      }
    })
  }

  it('uses name only for letter initials', () => {
    for (const style of STYLES) {
      const a = ditherFace('user-0', { style: style.slug, name: 'Ada' })
      const b = ditherFace('user-0', { style: style.slug, name: 'Zeke' })
      if (style.slug.endsWith('letter') || style.slug === 'pixel-stamp') expect(a).not.toBe(b)
      else expect(a).toBe(b)
    }
  })

  it('rejects malformed options and lists valid styles without coercing inputs', () => {
    for (const options of [null, 3, 'x', [], true]) expect(() => ditherFace('x', options as never)).toThrow(/options must be an object/)
    for (const style of [null, 3, {}, false]) expect(() => ditherFace('x', { style: style as never })).toThrow(/style must be a style slug string/)
    expect(() => ditherFace('x', { style: 'bad' as never })).toThrow(/unknown style "bad"; available: pixel-sprite, pixel-letter/)
    for (const style of ['grainy-pixelify-letter', '__proto__', 'constructor']) {
      expect(() => ditherFace('x', { style: style as never })).toThrow(/unknown style/)
    }
  })

  it('resolves all SVG references locally and avoids cross-style definition IDs', () => {
    const seen = new Set<string>()
    for (const style of STYLES) {
      const svg = style.draw('same-seed', 80)
      const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]!)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) {
        expect(seen.has(id), `${style.slug}: ${id}`).toBe(false)
        seen.add(id)
      }
      for (const [, id] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(id)
    }
  })
})
