/**
 * The ascii-letter avatar: the 5x7 initial drawn with one random character,
 * sprinkled over a dot field. Ported from the avatars mockup's `asciiLetter`
 * (mockups/avatars/index.html) onto the core modules, with the rng namespaced
 * `alet` like every style's own stream.
 *
 * The initial comes from `name` when the caller supplies one — the mockup's
 * second argument, which the sheet passes so the rng can stay on the mockup's
 * `user-<j>` seeds — and falls back to `initialOf(seed)`.
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { DEEP, INK, PASTEL } from '../palettes.js'
import { asciiGrid, disc, type AsciiCell } from '../grid.js'
import { glyph, initialOf } from '../font.js'
import { validateRenderArgs } from '../validation.js'

/** The characters the initial can be drawn with; one is picked per seed. */
const CHARS = ['#', '@', '%', '&', '$', '*', 'X', '8'] as const

/** The dot characters sprinkled over the cells the glyph does not cover. */
const DOTS = ['.', '·', ':', '-'] as const

/** The share of non-glyph cells that carry a dot instead of staying blank. */
const DOT_RATE = 0.3

/** One uniform pick from `list` — the mockup's helper; core has no pick. */
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!

/**
 * Draw the avatar as a standalone `<svg>`: a 9x9 grid with the glyph at
 * offset (2, 1) in the picked character and ink, dots in the accent color,
 * wrapped in the px-sized circular frame. `name`, when given, supplies the
 * initial instead of the seed.
 */
export function asciiLetter(seed: string, px: number, name?: string): string {
  validateRenderArgs(seed, px, name)
  const r = mulberry32(fnv1a('alet' + seed))
  const n = 9
  const bg = pick(r, PASTEL)
  const ch = pick(r, CHARS)
  const dot = pick(r, DOTS)
  const accent = pick(r, DEEP)
  const g = glyph(initialOf(name ?? seed))
  const cells: AsciiCell[][] = []
  for (let y = 0; y < n; y++) {
    const row: AsciiCell[] = []
    for (let x = 0; x < n; x++) {
      const on = g[y - 1]?.[x - 2] ?? false
      row.push(on ? ch : r() < DOT_RATE ? { ch: dot, color: accent } : ' ')
    }
    cells.push(row)
  }
  // namespaced, seed-hashed clip id: the same seed renders byte-identically
  const id = 'alet-' + fnv1a(seed).toString(16)
  return disc(px, n, `<g shape-rendering="auto">${asciiGrid(n, bg, cells, INK, 1.6)}</g>`, id)
}
