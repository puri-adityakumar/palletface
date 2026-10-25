/**
 * dither-face entry point. The registry is deliberately empty at scaffold
 * time: styles register themselves via `registerStyle` as their modules land,
 * and the sheet renderer picks up whatever is registered, in order.
 */
export * from './seed.js'
export * from './palettes.js'
export * from './grid.js'
export * from './font.js'

/** A registered avatar look. */
export interface AvatarStyle {
  /** Sheet row title, e.g. "pixel sprite". */
  title: string
  /** One-line note shown under the title on the sheet. */
  note: string
  /**
   * Draw the avatar as a standalone `<svg>` string: `seed` drives the rng,
   * `name` supplies the initial (when the style uses one), and `px` is the
   * box size in css pixels.
   */
  render: (seed: string, name: string, px: number) => string
}

/** Every registered style, in sheet order ("01 pixel sprite" … "08 pixelify letter"). */
export const STYLES: AvatarStyle[] = []

/** Add a style to the registry; sheet rows come out in registration order. */
export function registerStyle(style: AvatarStyle): void {
  STYLES.push(style)
}
