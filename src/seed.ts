/**
 * Deterministic seeding. Every avatar is a pure function of its seed string —
 * no `Math.random` — so server and client agree, the same user always gets the
 * same face, and tests can pin the output. Seed with a stable user id (or the
 * seed the user saved), never the email or display name: both can change, the
 * face should not.
 */

/** FNV-1a, 32-bit: small, fast, and distributes string seeds well enough. */
export function fnv1a(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Mulberry32: tiny seeded PRNG, deterministic across engines. */
export function mulberry32(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
