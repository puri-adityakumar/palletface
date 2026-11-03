/**
 * ascii field: seeded value noise mapped to a density ramp, like an ascii-art
 * photo of a glow. Ported from the avatars mockup's `asciiField`
 * (mockups/avatars/index.html, style 06).
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { PASTEL } from '../palettes.js'
import { asciiGrid, disc } from '../grid.js'

/** Field side in cells: an 11x11 field of characters. */
const N = 11

/** Density ramp, empty to heavy; a cell picks `RAMP[floor(v * RAMP.length)]`. */
const RAMP = ' .:-=+*#%@'

/**
 * `n` draws from `list` without replacement: each step splices a random
 * element out of a shrinking pool (the mockup's `pickN`).
 */
function pickN<T>(r: () => number, list: readonly T[], n: number): T[] {
  const pool = [...list]
  const out: T[] = []
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!)
  return out
}

/**
 * Draw the ascii-field avatar: seeded value noise plus a radial glow pick a
 * ramp character for each of the 11x11 cells, painted over a diagonal
 * two-pastel gradient. The style draws no initial, so it takes no name.
 */
export function asciiField(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const hash = fnv1a('afield' + seed)
  const r = mulberry32(hash)
  const [bg, tint] = pickN(r, PASTEL, 2)
  const cx = 2 + r() * 7
  const cy = 2 + r() * 7
  // A 5x5 lattice of random values, bilinearly interpolated with smoothstep
  // across a 3x3 stretch of the field.
  const lattice = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => r()))
  const noise = (x: number, y: number): number => {
    const gx = (x / (N - 1)) * 3
    const gy = (y / (N - 1)) * 3
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    const s = (t: number): number => t * t * (3 - 2 * t)
    const l = (a: number, b: number, t: number): number => a + (b - a) * s(t)
    return l(
      l(lattice[y0]![x0]!, lattice[y0]![x0 + 1]!, fx),
      l(lattice[y0 + 1]![x0]!, lattice[y0 + 1]![x0 + 1]!, fx),
      fy,
    )
  }
  const cells: string[][] = []
  for (let y = 0; y < N; y++) {
    const row: string[] = []
    for (let x = 0; x < N; x++) {
      const v = Math.max(0, Math.min(0.999, noise(x, y) * 0.55 + (1 - Math.hypot(x - cx, y - cy) / 8) * 0.6))
      row.push(RAMP[Math.floor(v * RAMP.length)]!)
    }
    cells.push(row)
  }
  const bgFill =
    `<defs><linearGradient id="g${hash}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${tint}"/></linearGradient></defs>` +
    `<rect width="${N}" height="${N}" fill="url(#g${hash})"/>`
  // The gradient and clip ids derive from the rng namespace hash, not the
  // per-process counter: the same seed must render byte-identical svg, even
  // twice in one process (disc's optional id, grid.ts).
  return disc(px, N, `<g shape-rendering="auto">${bgFill}${asciiGrid(N, 'none', cells)}</g>`, 'c' + hash)
}
import { validateRenderArgs } from '../validation.js'
