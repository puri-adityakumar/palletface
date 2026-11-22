import { glyph, initialOf } from '../font.js'
import { rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

const PALETTES = [
  ['#f5dcb9', '#753e53', '#b06e72', '#eac6a1'],
  ['#dce5bf', '#3b6255', '#779276', '#c7d4aa'],
  ['#d6e2e9', '#3d536d', '#788ca2', '#bdd0df'],
  ['#ead5e6', '#623f67', '#a47996', '#dbb8d2'],
] as const

/** Render a chipped stamp with the shared bitmap initial cut through both layers. */
export function pixelStamp(seed: string, px: number, name?: string): string {
  validateRenderArgs(seed, px, name)
  const r = mulberry32(fnv1a('pixel-stamp:' + seed))
  const [plate, ink, edge, grain] = PALETTES[Math.floor(r() * PALETTES.length)]!
  const left = 4 + Math.floor(r() * 2)
  const right = 11 + Math.floor(r() * 2)
  const nick = 5 + Math.floor(r() * 3)
  const fleck = 12 + Math.floor(r() * 2)
  const block = (y: number) =>
    `M${left} ${2 + y}H${right}V${3 + y}H13V${nick + y}H12v1h1V${11 + y}H11v1H4v-1H3V${4 + y}H${left}Z`

  // Use the same cutout coordinates on the face and its offset edge so the
  // rounded plate shows through the initial.
  const cutout = glyph(initialOf(name ?? seed)).map((row, y) =>
    row.map((on, x) => on ? `M${x + 6} ${y + 4}h1v1h-1Z` : '').join(''),
  ).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 16 16">` +
    `<rect width="16" height="16" rx="3" fill="${plate}"/>` +
    `<g shape-rendering="crispEdges">` +
    rect(2, 11, grain) + rect(fleck, 13, grain, 2) + rect(2, 3, grain) +
    `<path d="${block(1)}${cutout}" fill="${edge}" fill-rule="evenodd"/>` +
    `<path d="${block(0)}${cutout}" fill="${ink}" fill-rule="evenodd"/>` +
    rect(5, 3, edge, 2) + rect(11, 10, edge) + '</g></svg>'
}
