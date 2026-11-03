/**
 * Style 04 · pixel landscape — a tiny 16x16 scene: a dithered two-color sky,
 * a sun, and two sine hills, one rng draw per pick and per number. Ported
 * verbatim from the avatars mockup (`pixelLandscape`,
 * mockups/avatars/index.html): the same 'land' rng namespace and draw order
 * (sky pair, sun, far, near, then sun x/y/r and the two hill phases and
 * heights), the same 16x16 grid math and painter's-order overwrites, and the
 * same color sets — skies, suns and hills pull from the core tokens, while
 * the far gray and the two near darks exist only in the mockup's landscape
 * and stay as literals.
 *
 * One deliberate divergence from the mockup, forced by the port: the svg
 * carries an explicit xmlns plus a seed-derived clip id, so the same seed
 * always renders a byte-identical svg — the mockup's `disc` numbered its
 * clips from a process-global counter, which would make repeat renders
 * differ.
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { DEEP, PAPER, PASTEL } from '../palettes.js'
import { BAYER, rect } from '../grid.js'

/** One rng draw: a uniformly random element of `list` (mockup `pick`). */
const pick = <T>(r: () => number, list: readonly T[]): T =>
  list[Math.floor(r() * list.length)]!

/** The scene is 16x16. */
const N = 16

/**
 * The scene's color sets, in mockup order. Typed as plain strings, not the
 * palettes' literal unions: the painter's-order `c` below is reassigned
 * across sets, and the sky/sun/hill picks must be one type.
 */
const SKIES: string[][] = [
  [PASTEL[5]!, PASTEL[2]!],
  [PASTEL[6]!, PASTEL[2]!],
  [PASTEL[3]!, PASTEL[6]!],
  [PASTEL[5]!, PASTEL[6]!],
  [PASTEL[1]!, DEEP[4]!],
]

/** Sun fills: paper, butter-deep, coral. */
const SUNS: string[] = [PAPER, DEEP[2]!, DEEP[1]!]

/** Far-hill fills: teal, mint, and the mockup's faint gray (no core token). */
const FARS: string[] = [DEEP[3]!, PASTEL[0]!, '#a9a79c']

/** Near-hill fills: green plus two scene-only darks (no core tokens). */
const NEARS: string[] = [DEEP[0]!, '#4b4a42', '#3f8f6a']

/**
 * The circular avatar frame, the same shape as grid.ts's `disc` but with the
 * clip id passed in — the caller derives it from the seed, keeping renders
 * byte-deterministic (and 'land-' namespaced, so a page of these avatars
 * never cross-links clips; a real collision means the same style + seed,
 * whose clips are identical anyway).
 */
function discSeeded(id: string, px: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><defs><clipPath id="${id}"><circle cx="${N / 2}" cy="${N / 2}" r="${N / 2}"/></clipPath></defs><g clip-path="url(#${id})">${inner}</g></svg>`
}

/** Render the pixel-landscape avatar for `seed` at `px` css pixels. */
export function pixelLandscape(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const r = mulberry32(fnv1a('land' + seed))

  const sky = pick(r, SKIES)
  const s1 = sky[0]!
  const s2 = sky[1]!
  const sun = pick(r, SUNS)
  const far = pick(r, FARS)
  const near = pick(r, NEARS)

  // the sun's center and radius, then each hill's phase and horizon height,
  // drawn in exactly the mockup's order.
  const sx = 3 + r() * 10
  const sy = 3 + r() * 4
  const sr = 1.6 + r() * 1.4
  const p1 = r() * 6
  const p2 = r() * 6
  const h1 = 8 + r() * 2
  const h2 = 11 + r() * 2

  // one rect per cell, painted back to front: the Bayer-dithered sky, then
  // the sun disc, then the two sine hills — later bands simply overwrite.
  let out = ''
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let c = y / N > BAYER[y % 4]![x % 4]! * 0.9 + 0.05 ? s2 : s1
      if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < sr) c = sun
      if (y >= h1 + Math.sin(x / 3 + p1) * 1.6) c = far
      if (y >= h2 + Math.sin(x / 2.2 + p2) * 1.2) c = near
      out += rect(x, y, c)
    }
  }

  return discSeeded('land-' + fnv1a('land' + seed).toString(16), px, out)
}
import { validateRenderArgs } from '../validation.js'
