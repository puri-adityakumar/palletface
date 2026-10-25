/**
 * pixelify letter: the initial over a two-tone pixel checker. Ported from the
 * avatars mockup's `pixelifyLetter` (mockups/avatars/index.html), which set
 * the initial in the site's Pixelify Sans webfont. The library's svg has to
 * be self-contained — no font fetch — so the initial is drawn from the
 * bundled 5x7 bitmap font instead, each font pixel a 2x2 block on the same
 * grid as the checker. The checker math, the rng draws and the color picks
 * match the mockup line for line.
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { INK, PASTEL } from '../palettes.js'
import { disc, rect } from '../grid.js'
import { glyph, initialOf } from '../font.js'

/** Rust accent the mockup's letter color picks for 1 seed in 3; rest are ink. */
const RUST = '#c8402d'

/** Side of one letter bitmap pixel, in grid units — chunky at every size. */
const LETTER_CELL = 2

/** The mockup's `pick`: one uniform choice from `list`, consuming one rng draw. */
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!

/** The mockup's `pickN`: `n` choices without replacement, one rng draw each. */
const pickN = <T>(r: () => number, list: readonly T[], n: number): T[] => {
  const pool = [...list]
  const out: T[] = []
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!)
  return out
}

/**
 * Draw `initial` from the 5x7 bitmap font, trimmed to its ink so narrow
 * glyphs (I, J) center on the disc, each font pixel a LETTER_CELL block
 * centered on the 16-unit grid.
 */
function drawLetter(initial: string, color: string): string {
  const g = glyph(initial)
  let minCol = 5, maxCol = -1
  let minRow = 7, maxRow = -1
  g.forEach((row, y) =>
    row.forEach((on, x) => {
      if (!on) return
      minCol = Math.min(minCol, x)
      maxCol = Math.max(maxCol, x)
      minRow = Math.min(minRow, y)
      maxRow = Math.max(maxRow, y)
    }),
  )
  if (maxCol < 0 || maxRow < 0) return ''
  const ox = 8 - (maxCol - minCol + 1)
  const oy = 8 - (maxRow - minRow + 1)
  let out = ''
  g.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on)
        out += rect(
          ox + (x - minCol) * LETTER_CELL,
          oy + (y - minRow) * LETTER_CELL,
          color,
          LETTER_CELL,
          LETTER_CELL,
        )
    }),
  )
  return out
}

/**
 * The pixelify-letter avatar: `seed` drives the rng (namespaced `pfy`, as in
 * the mockup) and supplies the initial via `initialOf`; `px` is the rendered
 * size. Same seed, same bytes — the clip id is hashed from the seed rather
 * than counted per process.
 */
export function pixelifyLetter(seed: string, px: number): string {
  const r = mulberry32(fnv1a('pfy' + seed))
  const n = 16
  const picked = pickN(r, PASTEL, 2)
  const c1 = picked[0]!
  const c2 = picked[1]!
  const size = pick(r, [2, 4])
  const letterColor = pick(r, [INK, INK, RUST])
  let out = ''
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      out += rect(x, y, (Math.floor(x / size) + Math.floor(y / size)) % 2 ? c1 : c2)
  out += drawLetter(initialOf(seed), letterColor)
  return disc(px, n, out, 'c-pfy-' + fnv1a(seed).toString(36))
}
