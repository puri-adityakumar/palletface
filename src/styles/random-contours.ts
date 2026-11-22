import { disc, rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

const PALETTES = [
  ['#cbecd6', '#285b51', '#f0cf7b'],
  ['#f5d5c0', '#8b3d56', '#fab987'],
  ['#cce5f2', '#3a527d', '#edbe85'],
  ['#efdfad', '#59603d', '#c4d282'],
] as const

type Point = [number, number]

/** Convert a closed Catmull–Rom spline into SVG cubic segments. */
function smoothLoop(points: Point[]): string {
  const at = (index: number) => points[(index + points.length) % points.length]!
  const rounded = (values: number[]) => values.map(value => Number(value.toFixed(2))).join(' ')
  const segments = points.map(([x, y], i) => {
    const [ax, ay] = at(i - 1)
    const [bx, by] = at(i + 1)
    const [cx, cy] = at(i + 2)
    return 'C' + rounded([
      x + (bx - ax) / 6, y + (by - ay) / 6,
      bx - (cx - x) / 6, by - (cy - y) / 6, bx, by,
    ])
  })
  return 'M' + rounded(points[0]!) + segments.join('') + 'Z'
}

/** Seeded changes to the center, outline, spacing, and number of contour lines. */
export function randomContours(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const hash = fnv1a('contours:' + seed)
  const random = mulberry32(hash)
  const range = (min: number, max: number) => min + (max - min) * random()
  const [paper, ink, accent] = PALETTES[Math.floor(random() * PALETTES.length)]!
  const count = Math.floor(range(4, 8))
  const corners = Math.floor(range(6, 11))
  const tilt = range(0, 2 * Math.PI)
  const centerX = range(36, 64)
  const centerY = range(36, 64)
  const width = range(.82, 1.24)
  // Shared angular points keep the contours nested as their radii change.
  const outline = Array.from({ length: corners }, (_, i): Point => {
    const angle = tilt + i / corners * 2 * Math.PI
    const distance = range(.72, 1.3)
    return [Math.cos(angle) * distance * width, Math.sin(angle) * distance]
  })
  let radius = range(6, 11)
  const lines = Array.from({ length: count }, (_, i) => {
    const points = outline.map(([x, y]): Point => [
      centerX + x * radius + range(-1.3, 1.3),
      centerY + y * radius + range(-1.3, 1.3),
    ])
    radius += range(5, 12)
    return `<path d="${smoothLoop(points)}" fill="${i === 0 ? accent : 'none'}" stroke-width="${i % 3 === 1 ? 1.5 : 2.7}"/>`
  })
  const artwork = rect(0, 0, paper, 100, 100) +
    `<g shape-rendering="auto" stroke="${ink}">${lines.join('')}</g>`
  return disc(px, 100, artwork, 'random-contours-' + hash.toString(36))
}
