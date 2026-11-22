import { describe, expect, it } from 'vitest'
import { geometricTile } from './geometric-tile.js'
import { mirroredSignal } from './mirrored-signal.js'
import { pixelEmotes } from './pixel-emotes.js'
import { randomContours } from './random-contours.js'

const SEEDS = ['ada', 'rhea', 'quinn', 'zeke', 'élodie', 'marcus', 'kai', 'yuki']
const withoutIds = (svg: string) => svg.replace(/\b(id="|url\(#)[^")]+/g, '$1id')

describe('new avatar styles', () => {
  it.each([geometricTile, randomContours, pixelEmotes, mirroredSignal])('%s varies the artwork by seed', (draw) => {
    for (const seed of SEEDS) expect(draw(seed, 32)).toBe(draw(seed, 32))
    expect(new Set(SEEDS.map(seed => withoutIds(draw(seed, 64)))).size).toBeGreaterThanOrEqual(6)
  })

  it('draws four curved tile pieces around the center dot', () => {
    const svg = geometricTile('ada', 64)
    expect(svg).toMatch(/transform="rotate\((0|90|180|270) 50 50\)"/)
    expect(svg.match(/<path d="[^"]*[aA]50 50/g)).toHaveLength(4)
    expect(svg).toMatch(/<circle cx="50" cy="50" r="13" fill="#[0-9a-f]{6}"/)
  })

  it('varies contour paths and counts while drawing one filled center', () => {
    const counts = SEEDS.map(seed => {
      const svg = randomContours(seed, 64)
      const paths = [...svg.matchAll(/<path d="(M[^"]+Z)" fill="([^"]+)"/g)]
      expect(paths.length).toBeGreaterThanOrEqual(4)
      expect(paths.length).toBeLessThanOrEqual(7)
      expect(paths.filter(path => path[2] !== 'none')).toHaveLength(1)
      expect(new Set(paths.map(path => path[1])).size).toBe(paths.length)
      return paths.length
    })
    expect(new Set(counts).size).toBeGreaterThan(1)
  })

  it('renders the emote and shadow in distinct bitmap cells', () => {
    const svg = pixelEmotes('ada', 64)
    expect(svg).toContain('viewBox="0 0 16 16"')
    const pixels = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="([^"]+)"/g)]
    expect(pixels.length).toBeGreaterThan(20)
    expect(new Set(pixels.map(pixel => pixel.slice(1, 3).join(','))).size).toBe(pixels.length)
    expect(new Set(pixels.map(pixel => pixel[3])).size).toBe(3)
    for (const [, x, y] of pixels) {
      expect(Number(x)).toBeLessThan(16)
      expect(Number(y)).toBeLessThan(16)
    }
  })

  it('mirrors the signal cells and both terminal cutouts including their colors', () => {
    for (const seed of SEEDS) {
      const svg = mirroredSignal(seed, 32)
      const tiles = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([12])" height="\3" fill="([^"]+)"/g)]
      const cells = new Map(tiles.map(([, x, y, width, fill]) => [[x, y, width].join(','), fill]))
      expect(tiles.filter(tile => tile[3] === '1')).toHaveLength(2)
      expect(tiles.length).toBeGreaterThan(5)
      for (const [, x, y, width, fill] of tiles) {
        const opposite = 20 - Number(x) - Number(width)
        expect(cells.get([opposite, y, width].join(','))).toBe(fill)
      }
    }
  })
})
