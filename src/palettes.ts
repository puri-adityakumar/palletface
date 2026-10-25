/**
 * The site's color tokens, exactly as the avatars mockup defines them.
 * PASTEL are the soft field colors, DEEP the body/accent colors; dithering
 * never blends, so pairs that turn muddy in a smooth gradient are fine here.
 */

/** Soft field colors: mint, butter, pink, sky, butter-deep, sky-pale, butter-pale. */
export const PASTEL = [
  '#9fe7a4',
  '#f8e9a9',
  '#f4b8c0',
  '#a9e8eb',
  '#f2cf62',
  '#c9f0f2',
  '#fdf0bd',
] as const

/** Body and accent colors: green, coral, butter-deep, teal, rose, rust. */
export const DEEP = [
  '#62d96b',
  '#e8553e',
  '#f2cf62',
  '#6fc7cc',
  '#e58a98',
  '#c8402d',
] as const

/** Ink for eyes, glyphs, and text. */
export const INK = '#2b2a26'

/** Paper for backgrounds and suns. */
export const PAPER = '#fbf9f4'
