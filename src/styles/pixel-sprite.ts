/**
 * Style 01 — "pixel sprite": a mirrored 8x8 creature with ink eyes. No letter,
 * pure identity, like the old identicon but colored. Ported cell for cell from
 * the avatars mockup, so a seed draws the same sprite here as it did there.
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { DEEP, INK, PASTEL } from '../palettes.js'
import { disc, rect } from '../grid.js'

/** One entry of `list`, chosen by the rng. */
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!

/**
 * `n` distinct entries of `list` in drawn order (`n` must not exceed the list
 * length). The background uses n = 1, exactly as the mockup picks it, so the
 * rng stream lines up with the mockup draw for draw.
 */
const pickN = <T>(r: () => number, list: readonly T[], n: number): T[] => {
  const pool = [...list]
  const out: T[] = []
  while (out.length < n) out.push(...pool.splice(Math.floor(r() * pool.length), 1))
  return out
}

/**
 * Draw the avatar as a standalone `<svg>` string: a 12x12 grid with the 8x8
 * creature offset 2 cells in from the top left. The left half fills row by row
 * with odds that fall off toward the top (0.35) and bottom (0.45) rows, the
 * right half mirrors it, rows 2-5 of the inner columns are forced on so the
 * eyes always land on the body, and 60% of sprites get a pair of cheeks. A
 * seed fully determines the output: same seed, byte-identical svg.
 */
export function pixelSprite(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const r = mulberry32(fnv1a('sprite' + seed))
  const n = 12
  const [bg] = pickN(r, PASTEL, 1)
  const body = pick(r, DEEP)
  const cheek = pick(r, PASTEL.filter((c) => c !== bg))
  let out = rect(0, 0, bg!, n, n)
  // The creature's left half, 8 rows of 4 columns; the right half mirrors it.
  const on: boolean[][] = []
  for (let y = 0; y < 8; y++) {
    const row: boolean[] = []
    for (let x = 0; x < 4; x++) row[x] = r() < (y < 1 ? 0.35 : y > 6 ? 0.45 : 0.62)
    on.push(row)
  }
  // A solid middle so the eyes at columns 4 and 7 always sit on the body.
  for (const row of on.slice(2, 6)) row[2] = row[3] = true
  const eyeRow = 2 + Math.floor(r() * 2)
  for (const [y, row] of on.entries())
    for (let x = 0; x < 8; x++) {
      const filled = row[x < 4 ? x : 7 - x]
      if (filled) out += rect(2 + x, 2 + y, body)
    }
  out += rect(4, 2 + eyeRow, INK) + rect(7, 2 + eyeRow, INK)
  if (r() < 0.6) out += rect(3, 3 + eyeRow, cheek) + rect(8, 3 + eyeRow, cheek)
  // disc() names its clip with a process counter so many avatars can share a
  // page; pass a seed-derived name instead, so the same seed renders the same
  // bytes wherever and whenever it lands.
  const clipId = 'sprite-' + fnv1a('sprite' + seed).toString(36)
  return disc(px, n, out, clipId)
}
import { validateRenderArgs } from '../validation.js'
