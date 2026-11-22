import { disc, rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

const PALETTES = [
  ['#f3c969', '#e48270', '#2b7674', '#b6dddd'],
  ['#a9e1cf', '#425c87', '#ed9b91', '#f9dc96'],
  ['#eed0db', '#cc7069', '#72528a', '#f9db92'],
  ['#adcddf', '#f1af78', '#3d637c', '#c8dfaa'],
  ['#d8e7ae', '#5777a6', '#a84f61', '#f3d08d'],
  ['#f2c2d0', '#317f71', '#d17258', '#c4d8ef'],
] as const

/** Four curved tile pieces and a center dot, with a seeded colorway and turn. */
export function geometricTile(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const hash = fnv1a('geometric-tile:' + seed)
  const random = mulberry32(hash)
  const [base, accent, contrast, pale] = PALETTES[Math.floor(random() * PALETTES.length)]!
  const rotation = Math.floor(random() * 4) * 90
  const artwork = `<g shape-rendering="auto" transform="rotate(${rotation} 50 50)">` +
    rect(0, 0, base, 100, 100) +
    `<path d="M0 0h50a50 50 0 0 1-50 50Z" fill="${accent}"/>` +
    `<path d="M100 0v50a50 50 0 0 1-50-50Z" fill="${contrast}"/>` +
    `<path d="M0 50h50v50A50 50 0 0 1 0 50Z" fill="${contrast}"/>` +
    `<path d="M50 50h50v50a50 50 0 0 1-50-50Z" fill="${pale}"/>` +
    `<circle cx="50" cy="50" r="13" fill="${accent}"/></g>`
  return disc(px, 100, artwork, 'geometric-tile-' + hash.toString(36))
}
