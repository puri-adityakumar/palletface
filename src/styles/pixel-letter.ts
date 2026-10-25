/**
 * Style 02 · pixel letter — the seed's initial in the 5x7 bitmap font, ink
 * with a colored drop shadow one unit down-right, over an angle-driven
 * ordered-dither gradient of two pastels. Ported verbatim from the avatars
 * mockup (`pixelLetter`, mockups/avatars/index.html): the same 'plet' rng
 * namespace and draw order, the same 13x13 grid math and glyph offsets.
 *
 * One deliberate divergence from the mockup, forced by the port: the initial
 * comes from the seed itself, since this style is a pure function of
 * `(seed, px)`. The clip id is namespaced and derived from the seed hash and
 * passed to grid.ts's `disc`, so the same seed always renders a
 * byte-identical svg — the default per-process id would make repeat renders
 * differ.
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { DEEP, INK, PASTEL } from '../palettes.js'
import { BAYER, disc, rect } from '../grid.js'
import { glyph, initialOf } from '../font.js'

/** One rng draw: a uniformly random element of `list` (mockup `pick`). */
const pick = <T>(r: () => number, list: readonly T[]): T =>
  list[Math.floor(r() * list.length)]!

/**
 * Draw `n` distinct elements in draw order, splicing out of a pool so no
 * element repeats (mockup `pickN`).
 */
function pickN<T>(r: () => number, list: readonly T[], n: number): T[] {
  const pool = [...list]
  const out: T[] = []
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!)
  return out
}

/** Render the pixel-letter avatar for `seed` at `px` css pixels. */
export function pixelLetter(seed: string, px: number): string {
  const r = mulberry32(fnv1a('plet' + seed))
  const field = pickN(r, PASTEL, 2)
  const c1 = field[0]!
  const c2 = field[1]!
  const shadow = pick(r, DEEP)
  const angle = r() * Math.PI * 2

  // the dithered gradient: t runs 0..1 along `angle` across the 13x13 disc,
  // thresholded per cell by the Bayer matrix — c2 above, c1 below.
  let out = ''
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 13; x++) {
      const t = ((x - 6) * Math.cos(angle) + (y - 6) * Math.sin(angle)) / 13 + 0.5
      out += rect(x, y, t > BAYER[y % 4]![x % 4]! ? c2 : c1)
    }
  }

  // the initial: the shadow pass first (behind), then the ink letter,
  // each shadow pixel one unit down-right of the ink pixel it backs.
  const g = glyph(initialOf(seed))
  g.forEach((row, y) =>
    row.forEach((bit, x) => {
      if (bit) out += rect(4 + x + 1, 3 + y + 1, shadow)
    }),
  )
  g.forEach((row, y) =>
    row.forEach((bit, x) => {
      if (bit) out += rect(4 + x, 3 + y, INK)
    }),
  )

  return disc(px, 13, out, 'plet-' + fnv1a('plet' + seed).toString(16))
}
