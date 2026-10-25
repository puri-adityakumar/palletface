/**
 * dither-face entry point. The registry holds the eight ported styles in
 * sheet order ("01 pixel sprite" … "08 pixelify letter"); `ditherFace` is the
 * one-call consumer API over it. Every avatar is a pure function of its seed
 * string — the same seed renders the same face, byte for byte, forever.
 */
export * from './seed.js'
export * from './palettes.js'
export * from './grid.js'
export * from './font.js'
export * from './styles/pixel-sprite.js'
export * from './styles/pixel-letter.js'
export * from './styles/dither-orb.js'
export * from './styles/pixel-landscape.js'
export * from './styles/ascii-letter.js'
export * from './styles/ascii-field.js'
export * from './styles/ascii-face.js'
export * from './styles/pixelify-letter.js'

import { pixelSprite } from './styles/pixel-sprite.js'
import { pixelLetter } from './styles/pixel-letter.js'
import { ditherOrb } from './styles/dither-orb.js'
import { pixelLandscape } from './styles/pixel-landscape.js'
import { asciiLetter } from './styles/ascii-letter.js'
import { asciiField } from './styles/ascii-field.js'
import { asciiFace } from './styles/ascii-face.js'
import { pixelifyLetter } from './styles/pixelify-letter.js'

/** One look in the registry. */
export interface AvatarStyle {
  /** Url-safe id passed as `style` to `ditherFace`, e.g. `"pixel-sprite"`. */
  slug: string
  /** Sheet row title, e.g. "pixel sprite". */
  title: string
  /** One-line note shown under the title on the sheet. */
  note: string
  /**
   * Draw the avatar as a standalone `<svg>` string: `seed` drives the rng
   * and `px` is the box size in css pixels. The letter styles take their
   * initial from `name` when the caller supplies one — the mockup passes the
   * display name while keeping the rng on its `user-<j>` seeds — and from
   * `seed` otherwise.
   */
  draw: (seed: string, px: number, name?: string) => string
}

/**
 * Every style, in sheet order — the same rows the sheet renderer lays out.
 * Slugs are stable api: pick one for `ditherFace(seed, { style })`.
 */
export const STYLES: readonly AvatarStyle[] = [
  {
    slug: 'pixel-sprite',
    title: 'pixel sprite',
    note: 'a mirrored 8x8 creature with ink eyes. no letter, pure identity, like the old identicon but colored.',
    draw: pixelSprite,
  },
  {
    slug: 'pixel-letter',
    title: 'pixel letter',
    note: 'the initial in a 5x7 bitmap font with a colored drop shadow, over an ordered-dither gradient.',
    draw: pixelLetter,
  },
  {
    slug: 'dither-orb',
    title: 'dither orb',
    note: 'the current gradient idea, but as chunky dithered pixels. no letter.',
    draw: ditherOrb,
  },
  {
    slug: 'pixel-landscape',
    title: 'pixel landscape',
    note: 'a tiny 16x16 scene: dithered sky, sun, two hills. a nod to the painted packs.',
    draw: pixelLandscape,
  },
  {
    slug: 'ascii-letter',
    title: 'ascii letter',
    note: 'the initial drawn with one random character on a sprinkled dot field.',
    draw: asciiLetter,
  },
  {
    slug: 'ascii-field',
    title: 'ascii field',
    note: 'value noise mapped to a density ramp ( .:-=+*#%@), a glow rendered in text.',
    draw: asciiField,
  },
  {
    slug: 'ascii-face',
    title: 'ascii face',
    note: 'a kaomoji assembled from random brackets, eyes and a mouth.',
    draw: asciiFace,
  },
  {
    slug: 'pixelify-letter',
    title: 'pixelify letter',
    note: "the site's own pixel font for the initial, on a two-tone checker.",
    draw: pixelifyLetter,
  },
]

/** Options for `ditherFace`; everything is optional. */
export interface DitherFaceOptions {
  /** Which look to draw, by slug. Defaults to the first sheet style, `'pixel-sprite'`. */
  style?: string
  /** Box size in css pixels. Defaults to 80, the sheet's avatar size. */
  px?: number
  /**
   * Display name the letter styles draw the initial of, e.g. `"aditya"` for
   * an `A`. Defaults to the seed.
   */
  name?: string
}

/** Fallback box size when no `px` is given — the sheet's avatar size. */
const DEFAULT_PX = 80

/**
 * Draw one avatar: `ditherFace('user-123', { style: 'pixel-landscape', px: 80 })`
 * returns a standalone `<svg>` string, deterministic in the seed — server and
 * client agree, and the same user never changes face. Throws on an unknown
 * slug, listing the valid ones.
 */
export function ditherFace(seed: string, options: DitherFaceOptions = {}): string {
  const slug = options.style ?? STYLES[0]?.slug
  const style = STYLES.find((s) => s.slug === slug)
  if (!style) {
    throw new Error(`ditherFace: unknown style ${JSON.stringify(slug)}; available: ${STYLES.map((s) => s.slug).join(', ')}`)
  }
  return style.draw(seed, options.px ?? DEFAULT_PX, options.name)
}
