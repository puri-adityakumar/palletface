/**
 * Dither orb: a three-color radial glow drawn as chunky pixels with a 4x4
 * ordered (Bayer) dither, wrapped in the circular avatar frame. No letter —
 * the orb itself is the identity. Ported from the avatars mockup
 * (mockups/avatars/index.html, `ditherOrb`) with the production reference's
 * exact math (better-palletism d084acd, src/lib/dither-avatar.ts): the same
 * ten-color pool, glow center, and REACH divider.
 *
 * Pure math, no Math.random: the same seed renders byte-identical svg in
 * every process, so server and client agree and tests can pin the output.
 */

import { BAYER, disc, rect } from '../grid.js'
import { DEEP, PASTEL } from '../palettes.js'
import { fnv1a, mulberry32 } from '../seed.js'

/** Pixels per side. */
export const GRID = 20

/**
 * The orb pool: every pastel plus green, coral, and teal. The production
 * reference drops butter-deep because PASTEL already has it — the mockup's
 * eleven pool entries, as ten distinct colors.
 */
export const ORB_POOL: readonly string[] = [...PASTEL, DEEP[0]!, DEEP[1]!, DEEP[3]!]

/** Distance from the glow center at which the last color fully takes over. */
const REACH = 17

/** Draw one color without replacement, consuming the rng exactly like the
 * reference's pick: one draw over a shrinking pool.
 */
function pick(rng: () => number, pool: string[]): string {
  return pool.splice(Math.floor(rng() * pool.length), 1)[0]!
}

/** Draw the dither orb for `seed` as a standalone svg, `px` css pixels square. */
export function ditherOrb(seed: string, px: number): string {
  const rng = mulberry32(fnv1a('orb' + seed))
  const pool: string[] = [...ORB_POOL]
  const [c1, c2, c3]: [string, string, string] = [pick(rng, pool), pick(rng, pool), pick(rng, pool)]
  const cx = 4 + rng() * 12
  const cy = 4 + rng() * 12
  let out = ''
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      // 0 at the center, 2 at REACH and beyond; each unit is one color step.
      const d = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / REACH) * 2
      const th = BAYER[y % 4]![x % 4]!
      out += rect(x, y, d < 1 ? (d > th ? c2 : c1) : d - 1 > th ? c3 : c2)
    }
  }
  // disc()'s default clip id comes from a process counter; pass a seed-derived
  // one so the same seed renders byte-identical svg in every process.
  return disc(px, GRID, out, 'orb-' + fnv1a('orb' + seed).toString(16))
}
