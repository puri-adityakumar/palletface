import { describe, expect, it } from 'vitest'
import { pixelFlora, pixelRelic, pixelStamp } from '../index.js'

const rectangle = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g
const fills = (svg: string) => new Set([...svg.matchAll(/\bfill="(#[0-9a-f]{6})"/g)].map(([, fill]) => fill))
const geometry = (svg: string) => svg.replace(/ (?:id|clip-path|fill)="[^"]+"/g, '')
const cutoutPixel = /M(\d+) (\d+)h1v1h-1Z/g

describe('Pixel Flora and Pixel Relic', () => {
  it.each([
    ['fern', pixelFlora, 'avatar-1', 'avatar-25', 'avatar-13'],
    ['cactus', pixelFlora, 'avatar-2', 'avatar-5', 'avatar-9'],
    ['wildflower', pixelFlora, 'avatar-8', 'avatar-15', 'avatar-0'],
    ['key', pixelRelic, 'avatar-7', 'avatar-35', 'avatar-11'],
    ['lantern', pixelRelic, 'avatar-0', 'avatar-5', 'avatar-1'],
    ['potion', pixelRelic, 'avatar-10', 'avatar-18', 'avatar-20'],
  ] as const)('draws %s variants in a 16×16 grid', (_, draw, seed, shapeSeed, paletteSeed) => {
    const svg = draw(seed, 24)
    const shapeVariant = draw(shapeSeed, 24)
    const paletteVariant = draw(paletteSeed, 24)

    expect(draw(seed, 24)).toBe(svg)
    expect(fills(svg)).toEqual(fills(shapeVariant))
    expect(geometry(svg)).not.toBe(geometry(shapeVariant))
    expect(fills(svg)).not.toEqual(fills(paletteVariant))
    expect(svg).toContain('viewBox="0 0 16 16" shape-rendering="crispEdges"')
    expect(svg).toContain('<circle cx="8" cy="8" r="8"/>')

    for (const sample of [svg, shapeVariant, paletteVariant]) {
      const rects = [...sample.matchAll(rectangle)]
      expect(rects).toHaveLength(sample.match(/<rect /g)!.length)
      expect(rects.length).toBeGreaterThan(10)
      for (const [, x, y, width, height] of rects) {
        expect(Number(width)).toBeGreaterThan(0)
        expect(Number(height)).toBeGreaterThan(0)
        expect(Number(x) + Number(width)).toBeLessThanOrEqual(16)
        expect(Number(y) + Number(height)).toBeLessThanOrEqual(16)
      }
    }

    for (const px of [32, 64, 80]) {
      expect(draw(seed, px)).toBe(svg.replace('width="24" height="24"', `width="${px}" height="${px}"`))
    }
  })
})

describe('Pixel Stamp', () => {
  it('cuts the same readable bitmap out of both stamp layers on a rounded plate', () => {
    const svg = pixelStamp('avatar-1', 24, 'Ada')
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toMatch(/<rect width="16" height="16" rx="3" fill="#[0-9a-f]{6}"\/>/)
    const layers = [...svg.matchAll(/<path d="([^"]+)" fill="#[0-9a-f]{6}" fill-rule="evenodd"\/>/g)]
    expect(layers).toHaveLength(2)
    for (const [, path] of layers) {
      const pixels = [...path!.matchAll(cutoutPixel)].map(([, x, y]) => `${x},${y}`)
      const rows = Array.from({ length: 7 }, (_, y) => Array.from({ length: 5 }, (_, x) =>
        pixels.includes(`${x + 6},${y + 4}`) ? '1' : '0',
      ).join(''))
      expect(rows).toEqual(['01110', '10001', '10001', '11111', '10001', '10001', '10001'])
    }
    expect(pixelStamp('avatar-1', 24, 'Rhea').replace(cutoutPixel, '')).toBe(svg.replace(cutoutPixel, ''))
    expect(pixelStamp('avatar-1', 80, 'Ada')).toBe(svg.replace('width="24" height="24"', 'width="80" height="80"'))
  })

  it('uses the shared initial fallback and normalizes the display name independently of the seed', () => {
    const draw = (name?: string) => pixelStamp('élodie', 32, name)
    expect(draw()).toBe(draw('Émile'))
    expect(draw('  🎉 e\u0301lodie')).toBe(draw('Émile'))
    expect(draw('🎉 7even')).toBe(draw('7'))
    expect(draw('')).toBe(draw('東京'))
    expect(draw('東京')).toBe(draw('?'))
    expect(draw('')).not.toBe(draw())
    expect(draw('7')).not.toBe(draw('?'))
  })

  it('seeds the stamp palette and surface details', () => {
    const primary = pixelStamp('marcus', 32, 'M')
    expect(fills(pixelStamp('quinn', 32, 'M'))).not.toEqual(fills(primary))
    const variant = pixelStamp('palletface-zeke-4', 32, 'M')
    expect(fills(variant)).toEqual(fills(primary))
    expect(geometry(variant)).not.toBe(geometry(primary))
  })
})
