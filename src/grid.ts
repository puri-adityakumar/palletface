/**
 * Svg primitives shared by every style: the ordered-dither matrix, a pixel
 * rect builder, the circular avatar frame, and the ascii `<text>` grid.
 * Ported from the avatars mockup so both render identically.
 */
import { INK } from './palettes.js'

/** 4x4 ordered-dither (Bayer) thresholds, normalized to the open interval (0, 1). */
export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16))

/** One svg pixel: a 1x1 (or `w` x `h`) rect in grid units. */
export const rect = (x: number, y: number, c: string, w = 1, h = 1): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`

/** Monospace stack for the ascii styles. */
export const MONO = "Menlo, 'SF Mono', ui-monospace, monospace"

/** Escape xml text content: `&` first, then `<` and `>`, all occurrences. */
export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

let uid = 0

/**
 * Wrap an `n` x `n` grid of svg fragments in a px-sized square avatar with a
 * circular clip. The default id is unique per process, so many discs can
 * share a page; styles that must render byte-identically for the same seed
 * pass their own `id` — namespaced and hashed — since two such discs only
 * share an id when their clip geometry is identical anyway. (Unlike the
 * mockup, which relied on innerHTML, the svg carries an explicit xmlns so
 * the string also works as a standalone file or data URI.)
 */
export function disc(px: number, n: number, inner: string, id: string = 'c' + uid++): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><defs><clipPath id="${id}"><circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}"/></clipPath></defs><g clip-path="url(#${id})">${inner}</g></svg>`
}

/** A cell in an ascii grid: a character, optionally with its own color. */
export type AsciiCell = string | { ch: string; color: string }

/**
 * Draw a grid of characters as `<text>` elements, one per cell, centered in
 * each grid square. Blank cells (`' '`) are skipped; `bg` of `'none'` draws no
 * backdrop rect (for callers that paint their own, e.g. a gradient).
 */
export function asciiGrid(
  n: number,
  bg: string,
  cells: AsciiCell[][],
  color: string = INK,
  size: number = 1.25,
): string {
  let out = `<rect width="${n}" height="${n}" fill="${bg}"/>`
  cells.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch === ' ') return
      const c = typeof ch === 'object' ? ch : { ch, color }
      out += `<text x="${x + 0.5}" y="${y + 0.5}" text-anchor="middle" dominant-baseline="central" font-family="${MONO}" font-size="${size}" font-weight="700" fill="${c.color}">${esc(c.ch)}</text>`
    }),
  )
  return out
}
