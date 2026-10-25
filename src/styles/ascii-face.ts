/**
 * 07 ascii face: a kaomoji assembled from random brackets, eyes, and a mouth,
 * typeset once across the middle of a two-color pastel gradient. Ported from
 * the avatars mockup (`asciiFace`): the rng is namespaced 'face' + seed, the
 * draws happen in a fixed order (pastel pair, brackets, eye, mouth), and the
 * face sits centered on the 32x32 grid, textLength-fitted to 24 units.
 */
import { fnv1a, mulberry32 } from '../seed.js'
import { INK, PASTEL } from '../palettes.js'
import { disc, esc, MONO } from '../grid.js'

/** Bracket pairs for the face's sides, in mockup order. */
const BRACKETS = ['()', '[]', '{}', '||', '<>', 'ʕʔ']

/** Eye glyphs; '•' is listed twice on purpose — the mockup weights it double. */
const EYES = ['•', 'o', '^', '-', '°', '*', '=', 'u', '◕', '>', 'x', '•']

/** Mouth glyphs. */
const MOUTHS = ['ᴗ', '_', '‿', 'w', 'o', '.', '▽', 'ω', 'ㅅ', '□']

/** One draw from `list` — the mockup's `pick`. */
const pick = (r: () => number, list: readonly string[]): string => list[Math.floor(r() * list.length)]!

/** `n` draws without replacement, order mattering — the mockup's `pickN`. */
function pickN(r: () => number, list: readonly string[], n: number): string[] {
  const pool = [...list]
  const out: string[] = []
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!)
  return out
}

/** Draw the ascii face avatar: a kaomoji on a diagonal two-color gradient. */
export function asciiFace(seed: string, px: number): string {
  const h = fnv1a('face' + seed)
  const r = mulberry32(h)
  const key = h.toString(36)
  const [c1, c2] = pickN(r, PASTEL, 2)
  const br = pick(r, BRACKETS)
  const eye = pick(r, EYES)
  const right = eye === '>' ? '<' : eye
  const mouth = pick(r, MOUTHS)
  const face = br.charAt(0) + eye + mouth + right + br.charAt(1)
  const grad = 'f' + key
  const inner =
    `<defs><linearGradient id="${grad}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="32" height="32" fill="url(#${grad})"/>` +
    `<text x="16" y="16.5" text-anchor="middle" dominant-baseline="central" font-family="${MONO}" font-size="6.4" font-weight="700" fill="${INK}" textLength="24" lengthAdjust="spacingAndGlyphs">${esc(face)}</text>`
  // The clip and gradient ids are keyed by the seed hash, so the same seed
  // renders byte-identical svg on every call instead of counting a shared uid.
  return disc(px, 32, `<g shape-rendering="auto">${inner}</g>`, 'c' + key)
}
