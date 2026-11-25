/**
 * The registry holds the avatar styles in sheet order. `palletface` is the
 * one-call consumer API. Every avatar is a pure function of its seed
 * string for a given package version and runtime configuration.
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
import { geometricTile } from './styles/geometric-tile.js'
import { randomContours } from './styles/random-contours.js'
import { pixelEmotes } from './styles/pixel-emotes.js'
import { mirroredSignal } from './styles/mirrored-signal.js'
import { pixelFlora } from './styles/pixel-flora.js'
import { pixelRelic } from './styles/pixel-relic.js'
import { pixelStamp } from './styles/pixel-stamp.js'
import { validateRenderArgs } from './validation.js'

export { geometricTile, randomContours, pixelEmotes, mirroredSignal }
export { pixelFlora, pixelRelic, pixelStamp }

/** One look in the registry. */
export interface AvatarStyle {
  /** Url-safe id passed as `style` to `palletface`, e.g. `"pixel-sprite"`. */
  readonly slug: StyleSlug
  /** Sheet row title, e.g. "pixel sprite". */
  readonly title: string
  /** One-line note shown under the title on the sheet. */
  readonly note: string
  /**
   * Draw a standalone `<svg>`. The `seed` drives the rng and `px` sets the
   * size in CSS pixels. Styles with an initial use `name` when supplied
   * and `seed` otherwise.
   */
  readonly draw: (seed: string, px: number, name?: string) => string
}

/**
 * Slugs accepted by `palletface(seed, { style })`, including legacy ASCII styles.
 * Use `STYLES` for the current style picker and sheet order.
 */
export type StyleSlug =
  | 'pixel-sprite'
  | 'pixel-letter'
  | 'dither-orb'
  | 'pixel-landscape'
  | 'pixelify-letter'
  | 'geometric-tile'
  | 'random-contours'
  | 'pixel-emotes'
  | 'mirrored-signal'
  | 'pixel-flora'
  | 'pixel-relic'
  | 'pixel-stamp'
  | 'ascii-letter'
  | 'ascii-field'
  | 'ascii-face'

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
    slug: 'pixelify-letter',
    title: 'pixelify letter',
    note: 'a bundled bitmap initial on a two-tone checker.',
    draw: pixelifyLetter,
  },
  {
    slug: 'geometric-tile',
    title: 'geometric tile',
    note: 'curved color tiles in a seeded turn and colorway.',
    draw: geometricTile,
  },
  {
    slug: 'random-contours',
    title: 'random contours',
    note: 'topographic lines with seeded centers, outlines, and spacing.',
    draw: randomContours,
  },
  {
    slug: 'pixel-emotes',
    title: 'pixel emotes',
    note: 'an emoji-like pixel silhouette with dither and a pixel shadow.',
    draw: pixelEmotes,
  },
  {
    slug: 'mirrored-signal',
    title: 'mirrored signal',
    note: 'a 7×7 identicon with mirrored blocks and hollow terminals.',
    draw: mirroredSignal,
  },
  {
    slug: 'pixel-flora',
    title: 'pixel flora',
    note: 'a tiny fern, cactus, or wildflower on a pastel disc.',
    draw: pixelFlora,
  },
  {
    slug: 'pixel-relic',
    title: 'pixel relic',
    note: 'a key, lantern, or potion drawn as a retro inventory sprite.',
    draw: pixelRelic,
  },
  {
    slug: 'pixel-stamp',
    title: 'pixel stamp',
    note: 'a bitmap initial cut through a chipped stamp on a rounded square.',
    draw: pixelStamp,
  },
] as const satisfies readonly AvatarStyle[]

// Saved selections can keep rendering after a style leaves the picker.
const LEGACY_STYLES = new Map<string, AvatarStyle['draw']>([
  ['ascii-letter', asciiLetter],
  ['ascii-field', asciiField],
  ['ascii-face', asciiFace],
])

/** Options for `palletface`; everything is optional. */
export interface PalletfaceOptions {
  /** Which look to draw, by slug. Defaults to the first sheet style, `'pixel-sprite'`. */
  style?: StyleSlug
  /** Box size in css pixels. Defaults to 80, the sheet's avatar size. */
  px?: number
  /**
   * Display name for styles that draw an initial, e.g. `"aditya"` for
   * an `A`. Defaults to the seed.
   */
  name?: string
}

/** Fallback box size when no `px` is given — the sheet's avatar size. */
const DEFAULT_PX = 80

/**
 * Draw one avatar: `palletface('user-123', { style: 'pixel-landscape', px: 80 })`
 * returns a standalone `<svg>` string, repeatable for the same inputs and
 * package version in supported runtimes. Throws on an unknown slug, listing
 * the valid ones. ASCII appearance also depends on available system fonts.
 */
export function palletface(seed: string, options: PalletfaceOptions = {}): string {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object when provided')
  }
  const px = options.px === undefined ? DEFAULT_PX : options.px
  validateRenderArgs(seed, px, options.name)
  if (options.style !== undefined && typeof options.style !== 'string') throw new TypeError(`style must be a style slug string; received ${typeof options.style}`)
  const slug = options.style === undefined ? 'pixel-sprite' : options.style
  const draw = STYLES.find((s) => s.slug === slug)?.draw ?? LEGACY_STYLES.get(slug)
  if (!draw) {
    throw new Error(`palletface: unknown style ${JSON.stringify(slug)}; available: ${STYLES.map((s) => s.slug).join(', ')}`)
  }
  return draw(seed, px, options.name)
}
